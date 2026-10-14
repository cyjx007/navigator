/**
 * 导航页面 - 数据管理和同步模块 v2.0
 * 数据结构保持完全兼容，不破坏已有数据
 */

// ===== 数据管理 =====
const DataManager = {
    STORAGE_KEY: 'nav_data',
    SYNC_KEY: 'nav_sync',

    getData() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        if (!data) return this.getDefaultData();

        try {
            const parsed = JSON.parse(data);
            // 数据完整性检查：确保必要字段存在
            if (!parsed.categories || !parsed.links || !parsed.meta) {
                return this.getDefaultData();
            }
            return parsed;
        } catch(e) {
            console.error('数据解析失败，使用默认数据:', e);
            return this.getDefaultData();
        }
    },

    saveData(data) {
        // 确保 meta 对象存在
        if (!data.meta) data.meta = {};
        data.meta.lastUpdate = new Date().toISOString();
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        localStorage.setItem(this.SYNC_KEY, 'true');
        return data;
    },

    getDefaultData() {
        return {
            categories: [
                { id: 1, name: '常用网站', icon: '', order: 1 },
            ],
            links: [],
            meta: { version: 1, lastUpdate: new Date().toISOString() }
        };
    },

    getNextId(items) {
        return items.length === 0 ? 1 : Math.max(...items.map(item => item.id)) + 1;
    },

    resetData() {
        localStorage.removeItem(this.STORAGE_KEY);
        return this.getDefaultData();
    }
};

// ===== Cloudflare 同步管理 =====
const CloudflareSync = {
    workerUrl: '',
    apiToken: '',

    init() {
        const settings = this.getSettings();
        this.workerUrl = settings.workerUrl || '';
        this.apiToken = settings.apiToken || '';
    },

    getSettings() {
        const settings = localStorage.getItem('nav_settings');
        const defaultSettings = { verified: false };
        return settings ? { ...defaultSettings, ...JSON.parse(settings) } : defaultSettings;
    },

    saveSettings(settings) {
        localStorage.setItem('nav_settings', JSON.stringify(settings));
        this.workerUrl = settings.workerUrl || '';
        this.apiToken = settings.apiToken || '';
    },

    async verifyConfig() {
        if (!this.workerUrl || !this.apiToken) {
            return { success: false, message: '请先填写Worker URL和API Token' };
        }

        try {
            new URL(this.workerUrl);
        } catch (e) {
            return { success: false, message: 'Worker URL格式不正确，请确保是以https://开头的完整URL' };
        }

        try {
            const response = await fetch(`${this.workerUrl}/api/data`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.apiToken}` }
            });

            if (response.ok || response.status === 404) {
                const settings = this.getSettings();
                settings.verified = true;
                this.saveSettings(settings);
                return { success: true, message: '配置验证成功' };
            } else if (response.status === 401) {
                return { success: false, message: 'API Token无效或已过期' };
            } else if (response.status === 403) {
                return { success: false, message: 'API Token权限不足' };
            } else if (response.status >= 500) {
                return { success: false, message: '服务器错误，请稍后重试' };
            } else {
                const error = await response.text().catch(() => '未知错误');
                return { success: false, message: `验证失败 (${response.status}): ${error}` };
            }
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                return { success: false, message: '网络连接失败，请检查Worker URL和网络连接' };
            } else if (error.name === 'AbortError') {
                return { success: false, message: '请求超时，请检查网络连接' };
            } else {
                return { success: false, message: `网络错误: ${error.message}` };
            }
        }
    },

    async uploadData() {
        if (!this.workerUrl || !this.apiToken) {
            return { success: false, message: '请先配置Worker URL和API Token' };
        }

        try {
            const data = DataManager.getData();
            const response = await fetch(`${this.workerUrl}/api/data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiToken}`
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                localStorage.setItem(DataManager.SYNC_KEY, 'false');
                return { success: true, message: '同步成功' };
            } else if (response.status === 401) {
                return { success: false, message: 'API Token无效或已过期' };
            } else if (response.status === 403) {
                return { success: false, message: 'API Token权限不足' };
            } else if (response.status >= 500) {
                return { success: false, message: '服务器错误，请稍后重试' };
            } else {
                const error = await response.text().catch(() => '未知错误');
                return { success: false, message: `上传失败 (${response.status}): ${error}` };
            }
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                return { success: false, message: '网络连接失败，请检查Worker URL和网络连接' };
            } else if (error.name === 'AbortError') {
                return { success: false, message: '请求超时，请检查网络连接' };
            } else {
                return { success: false, message: `网络错误: ${error.message}` };
            }
        }
    },

    async downloadData() {
        if (!this.workerUrl || !this.apiToken) {
            return { success: false, message: '请先配置Worker URL和API Token' };
        }

        try {
            const response = await fetch(`${this.workerUrl}/api/data`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.apiToken}` }
            });

            if (response.ok) {
                const cloudData = await response.json();
                const localData = DataManager.getData();

                if (cloudData.meta && cloudData.meta.lastUpdate) {
                    if (!localData.meta || !localData.meta.lastUpdate ||
                        new Date(cloudData.meta.lastUpdate) > new Date(localData.meta.lastUpdate)) {
                        DataManager.saveData(cloudData);
                        return { success: true, message: '已同步云端数据', data: cloudData };
                    } else {
                        await this.uploadData();
                        return { success: true, message: '已上传本地数据' };
                    }
                } else {
                    await this.uploadData();
                    return { success: true, message: '已上传本地数据' };
                }
            } else if (response.status === 404) {
                await this.uploadData();
                return { success: true, message: '已上传本地数据' };
            } else if (response.status === 401) {
                return { success: false, message: 'API Token无效或已过期' };
            } else if (response.status === 403) {
                return { success: false, message: 'API Token权限不足' };
            } else if (response.status >= 500) {
                return { success: false, message: '服务器错误，请稍后重试' };
            } else {
                const error = await response.text().catch(() => '未知错误');
                return { success: false, message: `下载失败 (${response.status}): ${error}` };
            }
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                return { success: false, message: '网络连接失败，请检查Worker URL和网络连接' };
            } else if (error.name === 'AbortError') {
                return { success: false, message: '请求超时，请检查网络连接' };
            } else {
                return { success: false, message: `网络错误: ${error.message}` };
            }
        }
    },

    // 防抖自动同步
    _syncTimer: null,
    async autoSync() {
        // 防抖：500ms 内多次调用只执行一次
        if (this._syncTimer) clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(async () => {
            const needSync = localStorage.getItem(DataManager.SYNC_KEY) === 'true';
            if (needSync && this.workerUrl && this.apiToken) {
                const settings = this.getSettings();
                if (!settings.verified) {
                    const verifyResult = await this.verifyConfig();
                    if (!verifyResult.success) return;
                }
                await this.uploadData();
            }
        }, 500);
    }
};
