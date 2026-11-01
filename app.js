/**
 * 导航页面 - 数据管理和同步模块 v2.0
 * 数据结构保持完全兼容，不破坏已有数据
 */

// ===== 数据管理 =====
const DataManager = {
    STORAGE_KEY: 'nav_data',
    SYNC_KEY: 'nav_sync',
    SNAP_KEY: 'nav_snapshots',
    SNAP_MAX: 5,                 // 最多留 5 份本地快照
    SNAP_MAX_BYTES: 300 * 1024,  // 数据太大就不留，避免把 localStorage 撑爆

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

    saveData(data, options = {}) {
        // 覆盖前先留一份快照：误删分类、误导入、误恢复都能退回来
        if (!options.skipSnapshot) this.pushSnapshot();

        // 确保 meta 对象存在
        if (!data.meta) data.meta = {};
        data.meta.lastUpdate = new Date().toISOString();
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        localStorage.setItem(this.SYNC_KEY, 'true');
        return data;
    },

    // ===== 本地快照（防手滑，不防清浏览器数据）=====
    pushSnapshot() {
        try {
            const current = localStorage.getItem(this.STORAGE_KEY);
            if (!current || current.length > this.SNAP_MAX_BYTES) return;

            const list = this.getSnapshots();
            if (list.length && list[0].raw === current) return; // 内容没变就不重复存

            list.unshift({ t: Date.now(), raw: current });
            localStorage.setItem(this.SNAP_KEY, JSON.stringify(list.slice(0, this.SNAP_MAX)));
        } catch (e) {
            // 配额满了就算了，快照不能影响正常保存
        }
    },

    getSnapshots() {
        try {
            const raw = localStorage.getItem(this.SNAP_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    },

    restoreSnapshot(index) {
        const item = this.getSnapshots()[index];
        if (!item) return null;
        try {
            const data = JSON.parse(item.raw);
            this.saveData(data); // 恢复前会把"当前状态"再存一份，可以反悔
            return data;
        } catch (e) {
            return null;
        }
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
        this.pushSnapshot();
        localStorage.removeItem(this.STORAGE_KEY);
        return this.getDefaultData();
    }
};

// ===== Cloudflare 同步管理 =====
const CloudflareSync = {
    workerUrl: '',
    apiToken: '',
    rev: null,            // 云端版本号：上传时带 If-Match，别人先改过就会被拦下
    cloudUpdatedAt: null,
    _blocked: false,      // 出现未解决的冲突时暂停自动同步，避免静默覆盖

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

    headers(extra = {}) {
        return { 'Authorization': `Bearer ${this.apiToken}`, ...extra };
    },

    // 拉取云端数据 + 版本号（rev 放在响应头里，正文仍是原样的 nav_data）
    async fetchRemote() {
        if (!this.workerUrl || !this.apiToken) {
            return { ok: false, message: '请先配置 Worker URL 和 API Token' };
        }
        try {
            const response = await fetch(`${this.workerUrl}/api/data`, {
                headers: this.headers(),
                cache: 'no-store'
            });

            if (response.status === 404) {
                this.rev = '0';
                return { ok: true, empty: true, data: null, rev: '0' };
            }
            if (response.status === 401) return { ok: false, status: 401, message: 'API Token 无效或已过期' };
            if (response.status === 403) return { ok: false, status: 403, message: 'API Token 权限不足' };
            if (!response.ok) return { ok: false, status: response.status, message: `读取失败 (${response.status})` };

            const data = await response.json();
            this.rev = response.headers.get('X-Data-Rev') || '0';
            this.cloudUpdatedAt = response.headers.get('X-Data-Updated') || (data.meta && data.meta.lastUpdate) || null;
            return { ok: true, data, rev: this.rev, updatedAt: this.cloudUpdatedAt };
        } catch (error) {
            return { ok: false, message: this.describeError(error) };
        }
    },

    describeError(error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            return '网络连接失败，请检查 Worker URL 和网络';
        }
        if (error.name === 'AbortError') return '请求超时，请检查网络';
        return '网络错误: ' + error.message;
    },

    // 只验证配置能不能读，不改数据
    async verifyConfig() {
        if (!this.workerUrl || !this.apiToken) {
            return { success: false, message: '请先填写Worker URL和API Token' };
        }

        try {
            new URL(this.workerUrl);
        } catch (e) {
            return { success: false, message: 'Worker URL格式不正确，请确保是以https://开头的完整URL' };
        }

        const remote = await this.fetchRemote();
        if (remote.ok) {
            const settings = this.getSettings();
            settings.verified = true;
            this.saveSettings(settings);
            return { success: true, message: '配置验证成功' };
        }
        return { success: false, message: remote.message || '验证失败' };
    },

    // 上传本地数据。options.force = 无视版本号直接覆盖
    async uploadData(options = {}) {
        if (!this.workerUrl || !this.apiToken) {
            return { success: false, message: '请先配置Worker URL和API Token' };
        }

        // 不知道云端版本号时先读一次，否则 If-Match 无从谈起
        if (this.rev === null && !options.force) {
            const remote = await this.fetchRemote();
            if (!remote.ok) return { success: false, message: remote.message };
        }

        try {
            const data = DataManager.getData();
            const headers = this.headers({ 'Content-Type': 'application/json' });
            if (!options.force && this.rev !== null) headers['If-Match'] = this.rev;

            const response = await fetch(`${this.workerUrl}/api/data`, {
                method: 'POST',
                headers,
                body: JSON.stringify(data)
            });

            if (response.status === 409) {
                const info = await response.json().catch(() => ({}));
                this.rev = info.rev != null ? String(info.rev) : this.rev;
                this.cloudUpdatedAt = info.updatedAt || null;
                return {
                    success: false,
                    conflict: true,
                    cloudRev: info.rev,
                    cloudUpdatedAt: info.updatedAt
                };
            }

            if (response.ok) {
                const info = await response.json().catch(() => ({}));
                if (info.rev != null) this.rev = String(info.rev);
                this.cloudUpdatedAt = info.updatedAt || new Date().toISOString();
                this._blocked = false;
                localStorage.setItem(DataManager.SYNC_KEY, 'false');
                return { success: true, message: '同步成功', rev: this.rev };
            }

            if (response.status === 401) return { success: false, message: 'API Token无效或已过期' };
            if (response.status === 403) return { success: false, message: 'API Token权限不足' };
            if (response.status >= 500) return { success: false, message: '服务器错误，请稍后重试' };

            const error = await response.text().catch(() => '未知错误');
            return { success: false, message: `上传失败 (${response.status}): ${error}` };
        } catch (error) {
            return { success: false, message: this.describeError(error) };
        }
    },

    // 只下载，不再"本地较新就偷偷上传"（旧行为会静默覆盖云端）
    async downloadData() {
        const remote = await this.fetchRemote();
        if (!remote.ok) return { success: false, message: remote.message };
        if (remote.empty || !remote.data) return { success: false, message: '云端还没有数据' };

        DataManager.saveData(remote.data);
        return { success: true, message: '已下载云端数据', data: remote.data, rev: remote.rev };
    },

    // 云端上一版（每次上传前的自动备份）
    async restoreCloudPrev() {
        if (!this.workerUrl || !this.apiToken) {
            return { success: false, message: '请先配置Worker URL和API Token' };
        }
        try {
            const response = await fetch(`${this.workerUrl}/api/data/prev`, {
                headers: this.headers(),
                cache: 'no-store'
            });
            if (response.status === 404) return { success: false, message: '云端没有更早的备份' };
            if (response.status === 401) return { success: false, message: 'API Token无效或已过期' };
            if (!response.ok) return { success: false, message: `读取失败 (${response.status})` };

            const payload = await response.json();
            if (!payload || !payload.data) return { success: false, message: '备份内容为空' };
            DataManager.saveData(payload.data);
            return { success: true, message: '已恢复云端上一版', data: payload.data, savedAt: payload.savedAt };
        } catch (error) {
            return { success: false, message: this.describeError(error) };
        }
    },

    // 合并两份数据：按 id 取并集，同 id 保留本地（用户刚改的那份）
    mergeData(local, cloud) {
        const merged = JSON.parse(JSON.stringify(local || {}));
        merged.categories = merged.categories || [];
        merged.links = merged.links || [];

        const catIds = new Set(merged.categories.map(c => c.id));
        (cloud?.categories || []).forEach(c => {
            if (!catIds.has(c.id)) {
                merged.categories.push(c);
                catIds.add(c.id);
            }
        });

        const linkIds = new Set(merged.links.map(l => l.id));
        (cloud?.links || []).forEach(l => {
            if (!linkIds.has(l.id)) {
                merged.links.push(l);
                linkIds.add(l.id);
            }
        });

        merged.categories.sort((a, b) => (a.order || 0) - (b.order || 0));
        return merged;
    },

    // 防抖自动同步：遇到冲突就停下来等用户决定，绝不静默覆盖
    _syncTimer: null,
    async autoSync() {
        if (this._syncTimer) clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(async () => {
            const needSync = localStorage.getItem(DataManager.SYNC_KEY) === 'true';
            if (!needSync || !this.workerUrl || !this.apiToken) return;
            if (this._blocked) return;

            const settings = this.getSettings();
            if (!settings.verified) {
                const verifyResult = await this.verifyConfig();
                if (!verifyResult.success) return;
            }

            const result = await this.uploadData({ auto: true });
            if (result.conflict) {
                this._blocked = true;
                ToastManager.warning('云端已被其他设备更新，自动同步已暂停；请到「设置」里选择合并或覆盖', 8000);
            }
        }, 500);
    }
};
