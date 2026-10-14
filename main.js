/**
 * 导航页面 - 主界面逻辑 v2.0
 * 优化：Toast 通知系统、通用确认弹窗、ESC 关闭、时钟、链接过滤、更多颜色、Bug 修复
 */

// ===== 工具函数 =====
const $ = id => document.getElementById(id);

// ===== 版本标识（用于确认浏览器实际加载的是哪一版，排查旧缓存）=====
const APP_VERSION = '2.2.1';
const IMAGE_SEARCH_MODE = 'sandbox-bridge';
console.log(
    '%c[Navigator] v' + APP_VERSION + ' · 识图=' + IMAGE_SEARCH_MODE,
    'color:#fff;background:#3b82f6;padding:2px 6px;border-radius:4px;font-weight:bold'
);

// ===== Toast 通知系统 (替代 alert) =====
const ToastManager = {
    container: null,
    init() {
        this.container = $('toastContainer');
    },
    show(message, type = 'info', duration = 3000) {
        if (!this.container) return;
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `<span class="toast__icon">${icons[type] || icons.info}</span><span>${message}</span>`;
        this.container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 250);
        }, duration);
    },
    success(msg, d) { this.show(msg, 'success', d); },
    error(msg, d) { this.show(msg, 'error', d); },
    warning(msg, d) { this.show(msg, 'warning', d); },
    info(msg, d) { this.show(msg, 'info', d); }
};

// ===== 通用确认弹窗 (替代 confirm) =====
const ConfirmManager = {
    _resolve: null,
    _modalId: 'confirmModal',

    init() {
        $('confirmYesBtn')?.addEventListener('click', () => this._resolveConfirm(true));
        $('confirmNoBtn')?.addEventListener('click', () => this._resolveConfirm(false));
        $('confirmClose')?.addEventListener('click', () => this._resolveConfirm(false));
    },

    _resolveConfirm(result) {
        if (this._resolve) {
            const fn = this._resolve;
            this._resolve = null;
            AccessibilityManager.closeModal(this._modalId);
            fn(result);
        }
    },

    show(title, text, options = {}) {
        return new Promise((resolve) => {
            // If there's already a confirm open, reject
            if (this._resolve) {
                this._resolveConfirm(false);
            }

            this._resolve = resolve;

            const modal = $(this._modalId);
            if (!modal) { resolve(false); return; }

            $('confirmTitle').textContent = title || '确认操作';
            $('confirmText').textContent = text || '确定要执行此操作吗？';

            const yesBtn = $('confirmYesBtn');
            const noBtn = $('confirmNoBtn');
            yesBtn.textContent = options.confirmText || '确认';
            noBtn.textContent = options.cancelText || '取消';
            yesBtn.className = options.danger
                ? 'settings-btn settings-btn--danger'
                : 'settings-btn';

            AccessibilityManager.openModal(this._modalId);
        });
    }
};

// ===== 主题管理 =====
const ThemeManager = {
    init() {
        this.btn = $('themeToggleBtn');
        this.theme = localStorage.getItem('nav_theme') || 'light';
        this.applyTheme(this.theme);
        this.btn?.addEventListener('click', () => this.toggleTheme());
    },
    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('nav_theme', this.theme);
        this.applyTheme(this.theme);
    },
    applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (this.btn) this.btn.textContent = '☀️';
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (this.btn) this.btn.textContent = '🌙';
        }
    }
};

// ===== 时钟管理 =====
const ClockManager = {
    init() {
        this.element = $('headerClock');
        if (this.element) {
            this.update();
            setInterval(() => this.update(), 1000);
        }
    },
    update() {
        const now = new Date();
        const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const date = now.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' });
        if (this.element) this.element.textContent = `${date} ${time}`;
    }
};

// ===== 搜索引擎配置 =====
const searchEngines = {
    google: { url: 'https://www.google.com/search', icon: 'https://www.google.com/favicon.ico' },
    bing: { url: 'https://www.bing.com/search', icon: 'https://www.bing.com/favicon.ico' },
    baidu: { url: 'https://www.baidu.com/s', icon: 'https://www.baidu.com/favicon.ico' }
};

// ===== 以图搜图 (识图 · Google Lens) =====
// 关键结论（已实测）：
//   · 从 http(s) 页面跨域提交表单时，浏览器一定会带上 Origin 头 → Google 直接返回 403；
//   · 而 Origin: null 可以通过（返回 303 并跳到 Lens 结果页）。
// 因此这里用一个 sandbox iframe（不开启 allow-same-origin → 其源是「不透明源」）来提交上传表单，
// 请求就会带上 Origin: null，从而真正接通 Google Lens，且不依赖任何第三方图床。
const ImageSearch = {
    maxSize: 20 * 1024 * 1024, // 20MB
    LENS_ENDPOINT: 'https://lens.google.com/v3/upload',
    WINDOW_NAME: 'navLensResult',
    selfCheck: null,      // 主页面常驻自检桥（只上报 origin）
    innerFrame: null,     // 弹窗内的提交桥（target=_top）
    resultWin: null,
    bridgeOrigin: null,   // 自检结果：应为 'null'
    bridgeBroken: false,  // 沙箱失效时改用剪贴板兜底
    _pendingFile: null,
    _innerReady: false,
    _lastFile: null,
    _watchdog: null,
    _submitted: false,    // 内层桥是否已成功提交（提交后不再走兜底，避免多开页面）

    init() {
        const btn = $('imageSearchBtn');
        const input = $('imageSearchInput');

        this.createSelfCheck();
        window.addEventListener('message', (e) => this.onMessage(e));

        // 点击相机按钮 -> 打开文件选择（不预先开标签页，避免误弹空白页）
        btn?.addEventListener('click', (e) => { e.preventDefault(); input?.click(); });

        // 选好文件后再执行（此时仍在用户手势内，可正常预开结果页）
        input?.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (file) this.run(file);
        });

        // 粘贴图片 (Ctrl+V)
        document.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items || [];
            for (const item of items) {
                if (item.type && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) { this.run(file); e.preventDefault(); }
                    break;
                }
            }
        });

        // 拖拽图片到搜索框
        const searchForm = $('searchForm');
        if (searchForm) {
            searchForm.addEventListener('dragover', (e) => {
                e.preventDefault();
                searchForm.classList.add('drag-active');
            });
            searchForm.addEventListener('dragleave', () => searchForm.classList.remove('drag-active'));
            searchForm.addEventListener('drop', (e) => {
                e.preventDefault();
                searchForm.classList.remove('drag-active');
                const file = e.dataTransfer?.files?.[0];
                if (file && file.type.startsWith('image/')) this.run(file);
            });
        }

        // 页面加载后主动 ping，确保拿到沙箱自检结果
        setTimeout(() => this.pingSelf(), 400);
        setTimeout(() => this.pingSelf(), 1500);
    },

    // 沙箱桥脚本：源为「不透明源」→ 表单请求头 Origin: null → Google 可接受
    // tag 用于区分「自检桥」与「弹窗内层桥」；target 为提交目标
    bridgeScript(tag, target) {
        return 'var EP=' + JSON.stringify(this.LENS_ENDPOINT) + ';' +
            'var TAG=' + JSON.stringify(tag) + ';' +
            'function __rep(){try{parent.postMessage({type:"lens-ready",tag:TAG,origin:String(self.origin)},"*");}catch(x){}}' +
            'window.addEventListener("load",__rep);setTimeout(__rep,0);' +
            'window.addEventListener("message",function(e){' +
            'var d=e.data;if(!d)return;' +
            'if(d.type==="lens-ping"){__rep();return;}' +
            'if(d.type!=="lens-upload"||!d.file)return;' +
            'try{' +
            'var f=document.createElement("form");' +
            'f.method="POST";f.enctype="multipart/form-data";' +
            'f.action=EP+"?stcs="+Date.now();' +
            'f.target=' + JSON.stringify(target) + ';' +
            'var i=document.createElement("input");' +
            'i.type="file";i.name="encoded_image";' +
            'var dt=new DataTransfer();dt.items.add(d.file);i.files=dt.files;' +
            'f.appendChild(i);document.body.appendChild(f);f.submit();' +
            'e.source.postMessage({type:"lens-submitted",tag:TAG},"*");' +
            '}catch(err){e.source.postMessage({type:"lens-error",tag:TAG,message:String(err)},"*");}' +
            '});';
    },

    // 生成沙箱桥 iframe（刻意不加 allow-same-origin，才能拿到 Origin: null）
    makeBridgeFrame(id, tag, target) {
        const frame = document.createElement('iframe');
        frame.id = id;
        frame.title = 'Google 识图桥接（沙箱）';
        frame.setAttribute('aria-hidden', 'true');
        frame.setAttribute('sandbox', 'allow-forms allow-scripts allow-top-navigation');
        frame.style.cssText = 'position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none;';
        frame.srcdoc = '<!doctype html><meta charset="utf-8"><title>lens-bridge</title><body><script>' +
            this.bridgeScript(tag, target) + '<\/script>';
        return frame;
    },

    // 主页面常驻自检桥：只上报 origin，不参与提交
    createSelfCheck() {
        if (this.selfCheck) return;
        const frame = this.makeBridgeFrame('lensSelfCheck', 'self', '_blank');
        document.body.appendChild(frame);
        this.selfCheck = frame;
    },

    pingSelf() {
        try { this.selfCheck?.contentWindow?.postMessage({ type: 'lens-ping' }, '*'); } catch (e) {}
    },

    pingInner() {
        try { this.innerFrame?.contentWindow?.postMessage({ type: 'lens-ping' }, '*'); } catch (e) {}
    },

    sendToInner(file) {
        const f = this.innerFrame;
        if (!f || !f.contentWindow) return false;
        try {
            f.contentWindow.postMessage({ type: 'lens-upload', file }, '*');
            return true;
        } catch (e) {
            return false;
        }
    },

    onMessage(e) {
        const d = e.data || {};
        if (!d || typeof d.type !== 'string') return;

        if (d.type === 'lens-ready') {
            const origin = String(d.origin);
            if (d.tag === 'inner') {
                // 弹窗内层桥就绪 → 发送排队中的图片
                this._innerReady = true;
                if (this._pendingFile) {
                    const f = this._pendingFile;
                    this._pendingFile = null;
                    this.sendToInner(f);
                }
            } else {
                // 自检桥：origin 必须是 "null"，否则请求会带真实 Origin 而被 Google 403
                this.bridgeOrigin = origin;
                const el = $('diagOrigin');
                if (el) {
                    el.textContent = origin;
                    el.className = origin === 'null' ? 'is-ok' : 'is-bad';
                }
                console.log('[Navigator] 识图沙箱桥 origin =', origin, '（应为 null）');
                this.bridgeBroken = origin !== 'null';
                if (this.bridgeBroken) {
                    ToastManager.warning('识图沙箱未生效，已切换为「复制图片 + 打开 Google Lens」方式', 8000);
                }
            }
        } else if (d.type === 'lens-submitted') {
            // 提交成功 —— 取消兜底计时器，避免稍后又去导航/新开页面
            this._submitted = true;
            clearTimeout(this._watchdog);
            this._watchdog = null;
            LoadingManager.hide();
            console.log('[Navigator] 已通过沙箱桥提交到 Google Lens（Origin: null）');
        } else if (d.type === 'lens-error') {
            LoadingManager.hide();
            ToastManager.error('识图启动失败：' + (d.message || '未知错误'));
        }
    },

    // 在用户手势内预开结果窗口，并往里面注入一个「内层沙箱桥」。
    // 关键点：内层桥用 target="_top" 导航它自己的顶层（即这个弹窗）——
    // 这条路径由 sandbox 的 allow-top-navigation 明确允许，不受「必须同源才能按名字定位窗口」的限制。
    preOpen() {
        let win = null;
        try { win = window.open('', this.WINDOW_NAME); } catch (e) { win = null; }
        if (!win) { this.resultWin = null; return null; }

        try {
            win.document.open();
            win.document.write(
                '<!doctype html><meta charset="utf-8"><title>正在识图…</title>' +
                '<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;' +
                'font-family:-apple-system,"Segoe UI","PingFang SC",sans-serif;background:#f8fafc;color:#475569}' +
                '.box{text-align:center}.ring{width:44px;height:44px;margin:0 auto 18px;border:3px solid #dbeafe;' +
                'border-top-color:#3b82f6;border-radius:50%;animation:spin .9s linear infinite}' +
                '@keyframes spin{to{transform:rotate(360deg)}}</style>' +
                '<div class="box"><div class="ring"></div>' +
                '<div style="font-size:15px">正在用 Google 智能镜头搜索，请稍候…</div></div>' +
                '<iframe id="lensInner" title="lens-bridge" sandbox="allow-forms allow-scripts allow-top-navigation"' +
                ' style="position:absolute;width:0;height:0;border:0;opacity:0"></iframe>' +
                '<script>window.addEventListener("message",function(e){' +
                'try{window.opener&&window.opener.postMessage(e.data,"*");}catch(x){}});<\/script>'
            );
            win.document.close();

            const inner = win.document.getElementById('lensInner');
            if (inner) {
                inner.srcdoc = '<!doctype html><meta charset="utf-8"><title>lens-bridge</title><body><script>' +
                    this.bridgeScript('inner', '_top') + '<\/script>';
                this.innerFrame = inner;
                this._innerReady = false;
                setTimeout(() => this.pingInner(), 500);
            }
        } catch (e) {
            console.warn('注入识图桥失败:', e);
            this.innerFrame = null;
        }
        this.resultWin = win;
        return win;
    },

    validate(file) {
        if (!file || !file.type.startsWith('image/')) {
            ToastManager.warning('请选择图片文件');
            return false;
        }
        if (file.size > this.maxSize) {
            ToastManager.warning('图片过大，请上传 20MB 以内的图片');
            return false;
        }
        return true;
    },

    // 通过弹窗内层沙箱桥提交（Origin: null，target=_top 导航该弹窗）
    submit(file) {
        const win = this.preOpen();
        if (!win) return false;

        this._submitted = false;
        this._pendingFile = file;
        this.pingInner();
        // 内层桥就绪时会回 lens-ready 并立即发送；这里再兜一次，防止消息早于监听器注册
        setTimeout(() => {
            if (this._pendingFile) {
                const f = this._pendingFile;
                this._pendingFile = null;
                this.sendToInner(f);
            }
        }, 1600);
        return true;
    },

    // 兜底方案：把图片写进剪贴板，并在「已存在的识图弹窗」里给出提示。
    // 刻意不再 window.open / 不再自动跳转 lens.google.com 首页 ——
    // 那样会多开一个 google.com.hk/?olud 之类的无关页面，打扰用户。
    async copyAndOpen(file) {
        let copied = false;
        try {
            if (file && navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new ClipboardItem({ [file.type || 'image/png']: file })]);
                copied = true;
            }
        } catch (e) {
            console.warn('写剪贴板失败:', e);
        }

        // 仅当弹窗仍是本页写入的占位文档时才改写提示（跨域后写入会抛错，忽略即可）
        const win = this.resultWin;
        if (win && !win.closed) {
            try {
                win.document.open();
                win.document.write(this.fallbackHtml(copied));
                win.document.close();
            } catch (e) { /* 已跳转到 Google，忽略 */ }
        }

        ToastManager.info(
            copied
                ? '自动识图未成功：图片已复制到剪贴板，请在识图页面按 Ctrl+V 粘贴搜索'
                : '自动识图未成功，请点搜索框右侧相机图标重试',
            10000
        );
        return copied;
    },

    // 兜底提示页：写入已有弹窗，绝不打开新标签页
    fallbackHtml(copied) {
        return '<!doctype html><meta charset="utf-8"><title>识图</title>' +
            '<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;' +
            'font-family:-apple-system,"Segoe UI","PingFang SC",sans-serif;background:#f8fafc;color:#475569}' +
            '.box{text-align:center;max-width:440px;padding:0 24px;line-height:1.75}' +
            'a{color:#3b82f6}</style>' +
            '<div class="box"><div style="font-size:15px">' +
            (copied
                ? '图片已复制到剪贴板。<br>点下方链接打开 Google 智能镜头后，按 <b>Ctrl+V</b> 粘贴搜索。'
                : '自动识图未成功，请返回导航页，点搜索框右侧相机图标重试。') +
            '</div><div style="margin-top:14px"><a href="https://lens.google.com/">打开 Google 智能镜头</a></div></div>';
    },

    async run(file) {
        if (!this.validate(file)) return;
        this._lastFile = file;
        this._submitted = false;

        // 沙箱自检未通过 → 走剪贴板兜底（先开一个空白弹窗承载提示，不跳转外部站点）
        if (this.bridgeBroken) {
            LoadingManager.show('正在准备识图…');
            this.preOpen();
            await this.copyAndOpen(file);
            LoadingManager.hide();
            return;
        }

        LoadingManager.show('正在用 Google 智能镜头识图…');

        if (!this.submit(file)) {
            LoadingManager.hide();
            ToastManager.error('识图窗口未能打开，请允许本站弹出窗口后重试', 7000);
            return;
        }

        // 兜底：6 秒后若「没收到提交回执」且弹窗仍停在占位页，才降级为剪贴板方式
        clearTimeout(this._watchdog);
        this._watchdog = setTimeout(() => {
            this._watchdog = null;
            if (this._submitted) return;   // 已提交成功 —— 什么都不做，避免多开页面
            LoadingManager.hide();
            const win = this.resultWin;
            let stillPlaceholder;
            if (!win || win.closed) {
                stillPlaceholder = true;
            } else {
                try {
                    stillPlaceholder = win.document.title === '正在识图…';
                } catch (err) {
                    stillPlaceholder = false; // 跨域读取报错 = 已成功跳转到 Google
                }
            }
            if (stillPlaceholder) {
                console.log('[Navigator] 弹窗未跳转，降级为剪贴板方式');
                this.copyAndOpen(this._lastFile);
            }
        }, 6000);

        // 清空输入，便于再次选择同一张图片
        const input = $('imageSearchInput');
        if (input) setTimeout(() => { try { input.value = ''; } catch (e) {} }, 1200);
    }
};

// ===== 加载状态管理 =====
const LoadingManager = {
    init() {
        this.overlay = $('loadingOverlay');
        this.textElement = this.overlay?.querySelector('.loading-text');
    },
    show(text = '正在处理中...') {
        if (this.overlay && this.textElement) {
            this.textElement.textContent = text;
            this.overlay.classList.remove('is-hidden');
        }
    },
    hide() {
        if (this.overlay) this.overlay.classList.add('is-hidden');
    }
};

// ===== 可访问性 / 模态框管理 =====
const AccessibilityManager = {
    lastFocusedElement: null,
    init() {
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    },
    handleKeyDown(e) {
        if (e.key === 'Escape') {
            // 优先关闭确认弹窗
            if (!$('confirmModal').classList.contains('is-hidden')) {
                ConfirmManager._resolveConfirm(false);
                return;
            }
            // 关闭其他弹窗
            const modals = ['settingsPanel', 'addLinkModal', 'editLinkModal', 'categoryManageModal'];
            for (const id of modals) {
                const modal = $(id);
                if (modal && !modal.classList.contains('is-hidden')) {
                    const closeFns = {
                        settingsPanel: closeSettings,
                        addLinkModal: closeAddLinkModal,
                        editLinkModal: closeEditLinkModal,
                        categoryManageModal: closeCategoryManageModal
                    };
                    closeFns[id]?.();
                    return;
                }
            }
            // 隐藏右键菜单和搜索引擎下拉
            hideContextMenu();
            $('searchEngineDropdown')?.classList.remove('is-visible');
            $('searchEngineSelector')?.classList.remove('is-open');
        }
    },
    openModal(modalId) {
        const modal = $(modalId);
        if (!modal) return;
        this.lastFocusedElement = document.activeElement;
        modal.classList.remove('is-hidden');
        document.body.style.overflow = 'hidden';
    },
    closeModal(modalId) {
        const modal = $(modalId);
        if (!modal) return;
        modal.classList.add('is-hidden');
        if (this.lastFocusedElement) {
            setTimeout(() => this.lastFocusedElement.focus(), 100);
        }
        document.body.style.overflow = '';
    }
};

// ===== 链接过滤 =====
// ===== 分类模块「折叠 / 展开」 =====
const CollapseManager = {
    STORAGE_KEY: 'nav_collapsed',
    state: {},

    init() {
        try {
            this.state = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}') || {};
        } catch (e) {
            this.state = {};
        }
        this.bindAll();
        $('collapseAllBtn')?.addEventListener('click', () => this.toggleAll());
        this.updateAllBtn();
    },

    keyOf(mod) {
        if (!mod) return '';
        return mod.dataset.categoryId ? ('c' + mod.dataset.categoryId) : (mod.dataset.collapseKey || 'default');
    },

    isCollapsed(mod) {
        return !!this.state[this.keyOf(mod)];
    },

    // persist=false 用于「因过滤而临时展开」，不写入本地存储
    setCollapsed(mod, collapsed, persist = true) {
        if (!mod) return;
        mod.classList.toggle('is-collapsed', !!collapsed);
        const btn = mod.querySelector('.category-module__toggle');
        if (btn) btn.setAttribute('aria-expanded', String(!collapsed));
        if (persist) {
            const k = this.keyOf(mod);
            if (k) { this.state[k] = !!collapsed; this.save(); }
        }
    },

    toggle(mod) {
        this.setCollapsed(mod, !this.isCollapsed(mod));
        this.updateAllBtn();
    },

    save() {
        try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state)); } catch (e) {}
    },

    bindAll() {
        document.querySelectorAll('.category-module').forEach(mod => this.bindModule(mod));
        this.updateAllBtn();
    },

    bindModule(mod) {
        const header = mod.querySelector('.category-module__header');
        if (!header || header.dataset.collapseBound === '1') return;
        header.dataset.collapseBound = '1';
        header.addEventListener('click', () => this.toggle(mod));
        // 恢复上次的折叠状态
        this.setCollapsed(mod, this.isCollapsed(mod), false);
    },

    toggleAll() {
        const mods = Array.from(document.querySelectorAll('.category-module'));
        if (!mods.length) return;
        // 以当前 DOM 的真实状态为准（过滤时可能被临时展开）
        const anyExpanded = mods.some(m => !m.classList.contains('is-collapsed'));
        mods.forEach(m => this.setCollapsed(m, anyExpanded));
        this.updateAllBtn();
        ToastManager.info(anyExpanded ? '已折叠全部分类' : '已展开全部分类', 1600);
    },

    updateAllBtn() {
        const btn = $('collapseAllBtn');
        if (!btn) return;
        const mods = Array.from(document.querySelectorAll('.category-module'));
        const allCollapsed = mods.length > 0 && mods.every(m => m.classList.contains('is-collapsed'));
        btn.textContent = allCollapsed ? '展开全部' : '折叠全部';
    }
};

const LinkFilter = {
    keyword: '',
    init() {
        const input = $('linkFilterInput');
        input?.addEventListener('input', () => {
            this.keyword = input.value.trim().toLowerCase();
            this.apply();
        });
        $('linkFilterClear')?.addEventListener('click', () => {
            if (input) { input.value = ''; input.focus(); }
            this.keyword = '';
            this.apply();
        });
    },
    apply() {
        const kw = this.keyword;
        let matched = 0;

        document.querySelectorAll('.category-module').forEach(mod => {
            let visibleInModule = 0;

            mod.querySelectorAll('.category-module__link').forEach(card => {
                const text = (card.querySelector('.link-text')?.textContent || '').toLowerCase();
                const hit = !kw || text.includes(kw);
                card.style.display = hit ? '' : 'none';
                if (hit) visibleInModule++;
            });

            if (kw) {
                // 有搜索词：只保留命中的分类，并自动展开
                mod.style.display = visibleInModule === 0 ? 'none' : '';
                if (visibleInModule > 0) CollapseManager.setCollapsed(mod, false, false);
                matched += visibleInModule;
            } else {
                // 清空搜索：恢复原样与用户手动折叠状态
                mod.style.display = '';
                CollapseManager.setCollapsed(mod, CollapseManager.isCollapsed(mod), false);
            }
        });

        const clearBtn = $('linkFilterClear');
        const countEl = $('linkFilterCount');
        if (clearBtn) clearBtn.hidden = !kw;
        if (countEl) {
            if (!kw) {
                countEl.hidden = true;
                countEl.textContent = '';
            } else {
                countEl.hidden = false;
                countEl.textContent = matched + ' 个匹配';
            }
        }
    }
};

// ===== 弹窗拖拽功能 =====
function makeDraggable(modalId, headerId) {
    const modal = $(modalId);
    const header = $(headerId);
    const content = modal?.querySelector('.settings-panel__content');
    if (!modal || !header || !content) return;

    let isDragging = false;
    let startX, startY, initialX = 0, initialY = 0;

    header.style.cursor = 'move';

    header.addEventListener('mousedown', function(e) {
        if (['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const computedStyle = window.getComputedStyle(content);
        const transform = computedStyle.transform;
        if (transform && transform !== 'none') {
            const matrix = new DOMMatrix(transform);
            initialX = matrix.m41;
            initialY = matrix.m42;
        }
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        const deltaX = e.clientX - startX + initialX;
        const deltaY = e.clientY - startY + initialY;
        content.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    });

    document.addEventListener('mouseup', function() {
        isDragging = false;
    });
}

// ===== 同步按钮显示状态 =====
function updateSyncButtonsVisibility() {
    const settings = CloudflareSync.getSettings();
    const syncButtons = document.querySelectorAll('.sync-btn');
    const loginBtn = $('loginBtn');

    if (settings.verified) {
        syncButtons.forEach(btn => btn.style.display = 'inline-block');
        if (loginBtn) loginBtn.style.display = 'none';
    } else {
        syncButtons.forEach(btn => btn.style.display = 'none');
        if (loginBtn) loginBtn.style.display = 'inline-block';
    }
}

// ===== 登录 =====
async function login() {
    const loginBtn = $('loginBtn');
    const syncStatus = $('syncStatus');

    loginBtn.disabled = true;
    loginBtn.textContent = '登录中...';
    syncStatus.textContent = '';

    try {
        LoadingManager.show('正在验证登录信息...');

        const workerUrl = $('workerUrl').value.trim();
        const apiToken = $('apiToken').value.trim();

        const originalWorkerUrl = CloudflareSync.workerUrl;
        const originalApiToken = CloudflareSync.apiToken;
        CloudflareSync.workerUrl = workerUrl;
        CloudflareSync.apiToken = apiToken;

        const verifyResult = await CloudflareSync.verifyConfig();

        if (verifyResult.success) {
            const settings = { workerUrl, apiToken, verified: true };
            CloudflareSync.saveSettings(settings);
            updateSyncButtonsVisibility();
            updateConfigStatus(settings);
            syncStatus.textContent = '✓ 登录成功';
            syncStatus.style.color = 'var(--color-green)';
            ToastManager.success('登录成功');
        } else {
            CloudflareSync.workerUrl = originalWorkerUrl;
            CloudflareSync.apiToken = originalApiToken;
            syncStatus.textContent = '✗ ' + verifyResult.message;
            syncStatus.style.color = 'var(--color-red)';
            ToastManager.error('登录失败');
        }
    } catch (error) {
        syncStatus.textContent = '✗ 登录失败: ' + error.message;
        syncStatus.style.color = 'var(--color-red)';
        ToastManager.error('登录失败: ' + error.message);
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = '登录';
        LoadingManager.hide();
    }
}

// ===== 设置面板控制 =====
function openSettings() {
    const settings = CloudflareSync.getSettings();
    $('workerUrl').value = settings.workerUrl || '';
    $('apiToken').value = settings.apiToken || '';
    updateConfigStatus(settings);
    updateSyncButtonsVisibility();
    AccessibilityManager.openModal('settingsPanel');
}

function updateConfigStatus(settings) {
    const configStatus = $('configStatus');
    const configStatusText = $('configStatusText');
    const syncInfo = $('syncInfo');
    const downloadBtn = $('downloadFromCloudBtn');
    const uploadBtn = $('uploadToCloudBtn');

    const hasCredentials = settings.workerUrl && settings.apiToken;
    const isVerified = settings.verified === true;

    if (isVerified) {
        configStatus.classList.remove('is-hidden', 'config-status--pending', 'config-status--unconfigured');
        configStatus.classList.add('config-status--verified');
        configStatusText.innerHTML = '✓ <strong>已配置云端同步</strong><br>Worker URL: ' + settings.workerUrl;
        syncInfo.classList.remove('is-hidden');
        updateSyncInfo();
        downloadBtn.disabled = false;
        uploadBtn.disabled = false;
    } else if (hasCredentials) {
        configStatus.classList.remove('is-hidden', 'config-status--verified', 'config-status--unconfigured');
        configStatus.classList.add('config-status--pending');
        configStatusText.innerHTML = '⚠️ <strong>配置待验证</strong><br>已填写配置信息，请点击登录验证';
        syncInfo.classList.add('is-hidden');
        downloadBtn.disabled = false;
        uploadBtn.disabled = false;
    } else {
        configStatus.classList.remove('is-hidden', 'config-status--verified', 'config-status--pending');
        configStatus.classList.add('config-status--unconfigured');
        configStatusText.innerHTML = '⚠️ <strong>未配置云端同步</strong><br>请填写 Worker URL 和 API Token 以启用云端数据同步';
        syncInfo.classList.add('is-hidden');
        downloadBtn.disabled = true;
        uploadBtn.disabled = true;
    }
}

function updateSyncInfo() {
    const data = DataManager.getData();
    const lastSyncTime = $('lastSyncTime');
    const syncStatusInfo = $('syncStatusInfo');

    if (data.meta && data.meta.lastUpdate) {
        const lastUpdate = new Date(data.meta.lastUpdate);
        const now = new Date();
        const diffMs = now - lastUpdate;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        let timeText = '';
        if (diffMins < 1) timeText = '刚刚';
        else if (diffMins < 60) timeText = diffMins + '分钟前';
        else if (diffHours < 24) timeText = diffHours + '小时前';
        else timeText = diffDays + '天前';

        lastSyncTime.textContent = '⏱ 最后更新: ' + timeText + ' (' + lastUpdate.toLocaleString('zh-CN') + ')';
    } else {
        lastSyncTime.textContent = '⏱ 最后更新: 从未同步';
    }

    const needSync = localStorage.getItem(DataManager.SYNC_KEY) === 'true';
    syncStatusInfo.innerHTML = needSync
        ? '<span style="color: var(--color-orange);">●</span> 本地数据有更新，等待同步'
        : '<span style="color: var(--color-green);">●</span> 数据已同步';
}

function closeSettings() {
    const currentSettings = CloudflareSync.getSettings();
    const newWorkerUrl = $('workerUrl').value.trim();
    const newApiToken = $('apiToken').value.trim();
    const configChanged = currentSettings.workerUrl !== newWorkerUrl || currentSettings.apiToken !== newApiToken;

    const settings = { workerUrl: newWorkerUrl, apiToken: newApiToken };
    settings.verified = configChanged ? false : currentSettings.verified;
    CloudflareSync.saveSettings(settings);
    updateConfigStatus(settings);
    AccessibilityManager.closeModal('settingsPanel');
}

// ===== 数据导入导出 =====
function exportData() {
    const data = DataManager.getData();
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nav_data_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    ToastManager.success('数据已导出');
}

function importData() {
    $('importDataInput').click();
}

async function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!importedData.categories || !importedData.links || !importedData.meta) {
                ToastManager.error('数据格式不正确，请确保是有效的导航数据文件');
                return;
            }

            const confirmed = await ConfirmManager.show('导入数据', '导入数据将覆盖当前所有数据，确定要继续吗？', { danger: true });
            if (!confirmed) return;

            DataManager.saveData(importedData);
            CloudflareSync.autoSync();
            renderCommonLinks();
            renderCategoryLinks();
            ToastManager.success('数据导入成功！');
        } catch (error) {
            ToastManager.error('导入失败：' + error.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function resetData() {
    const confirmed1 = await ConfirmManager.show('清理本地数据',
        '这将删除所有分类和链接，恢复到初始状态。此操作不可撤销！', { danger: true });
    if (!confirmed1) return;

    const confirmed2 = await ConfirmManager.show('再次确认',
        '清理后所有数据将丢失，确定要继续吗？', { danger: true });
    if (!confirmed2) return;

    DataManager.resetData();
    localStorage.removeItem(DataManager.SYNC_KEY);
    localStorage.removeItem('nav_settings');

    $('workerUrl').value = '';
    $('apiToken').value = '';
    updateSyncButtonsVisibility();
    updateConfigStatus({ verified: false });
    renderCommonLinks();
    renderCategoryLinks();
    updateSyncInfo();
    ToastManager.success('本地数据已清理');
}

// ===== 下载云端数据 =====
async function downloadFromCloud() {
    const downloadBtn = $('downloadFromCloudBtn');
    const syncStatus = $('syncStatus');

    downloadBtn.disabled = true;
    downloadBtn.textContent = '下载中...';
    syncStatus.textContent = '';
    LoadingManager.show('正在从云端同步数据...');

    try {
        const workerUrl = $('workerUrl').value.trim();
        const apiToken = $('apiToken').value.trim();

        if (!workerUrl || !apiToken) {
            syncStatus.textContent = '✗ 请先填写 Worker URL 和 API Token';
            syncStatus.style.color = 'var(--color-red)';
            return;
        }

        const originalWorkerUrl = CloudflareSync.workerUrl;
        const originalApiToken = CloudflareSync.apiToken;
        CloudflareSync.workerUrl = workerUrl;
        CloudflareSync.apiToken = apiToken;

        const settings = CloudflareSync.getSettings();
        if (!settings.verified) {
            syncStatus.textContent = '正在验证配置...';
            const verifyResult = await CloudflareSync.verifyConfig();
            if (!verifyResult.success) {
                CloudflareSync.workerUrl = originalWorkerUrl;
                CloudflareSync.apiToken = originalApiToken;
                syncStatus.textContent = '✗ 配置验证失败: ' + verifyResult.message;
                syncStatus.style.color = 'var(--color-red)';
                return;
            }
        }

        const response = await fetch(`${CloudflareSync.workerUrl}/api/data`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${CloudflareSync.apiToken}` }
        });

        if (response.ok) {
            const cloudData = await response.json();
            DataManager.saveData(cloudData);

            if (!settings.verified) {
                CloudflareSync.saveSettings({ workerUrl, apiToken, verified: true });
                updateConfigStatus(CloudflareSync.getSettings());
            }

            renderCommonLinks();
            renderCategoryLinks();
            updateSyncInfo();
            syncStatus.textContent = '✓ 已从云端同步数据';
            syncStatus.style.color = 'var(--color-green)';
            ToastManager.success('云端数据已同步');
        } else if (response.status === 404) {
            syncStatus.textContent = '⚠ 云端没有数据，请先同步到云端';
            syncStatus.style.color = 'var(--color-orange)';
        } else if (response.status === 401) {
            syncStatus.textContent = '✗ API Token无效，请检查Token设置';
            syncStatus.style.color = 'var(--color-red)';
        } else {
            const error = await response.text().catch(() => '未知错误');
            syncStatus.textContent = `✗ 下载失败 (${response.status}): ${error}`;
            syncStatus.style.color = 'var(--color-red)';
        }
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            syncStatus.textContent = '✗ 网络连接失败，请检查网络连接和Worker URL';
        } else {
            syncStatus.textContent = '✗ 下载失败: ' + error.message;
        }
        syncStatus.style.color = 'var(--color-red)';
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = '下载云端数据';
        LoadingManager.hide();
    }
}

// ===== 上传到云端 =====
async function uploadToCloud() {
    const uploadBtn = $('uploadToCloudBtn');
    const syncStatus = $('syncStatus');

    uploadBtn.disabled = true;
    uploadBtn.textContent = '上传中...';
    syncStatus.textContent = '';
    LoadingManager.show('正在同步到云端...');

    try {
        const workerUrl = $('workerUrl').value.trim();
        const apiToken = $('apiToken').value.trim();

        if (!workerUrl || !apiToken) {
            syncStatus.textContent = '✗ 请先填写 Worker URL 和 API Token';
            syncStatus.style.color = 'var(--color-red)';
            return;
        }

        const originalWorkerUrl = CloudflareSync.workerUrl;
        const originalApiToken = CloudflareSync.apiToken;
        CloudflareSync.workerUrl = workerUrl;
        CloudflareSync.apiToken = apiToken;

        const settings = CloudflareSync.getSettings();
        if (!settings.verified) {
            syncStatus.textContent = '正在验证配置...';
            const verifyResult = await CloudflareSync.verifyConfig();
            if (!verifyResult.success) {
                CloudflareSync.workerUrl = originalWorkerUrl;
                CloudflareSync.apiToken = originalApiToken;
                syncStatus.textContent = '✗ 配置验证失败: ' + verifyResult.message;
                syncStatus.style.color = 'var(--color-red)';
                return;
            }
        }

        const uploadResult = await CloudflareSync.uploadData();
        if (uploadResult.success) {
            if (!settings.verified) {
                CloudflareSync.saveSettings({ workerUrl, apiToken, verified: true });
                updateConfigStatus(CloudflareSync.getSettings());
            }
            updateSyncInfo();
            syncStatus.textContent = '✓ ' + uploadResult.message;
            syncStatus.style.color = 'var(--color-green)';
            ToastManager.success('数据已上传到云端');
        } else {
            syncStatus.textContent = '✗ ' + uploadResult.message;
            syncStatus.style.color = 'var(--color-red)';
        }
    } catch (error) {
        syncStatus.textContent = '✗ 上传失败: ' + error.message;
        syncStatus.style.color = 'var(--color-red)';
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '上传到云端';
        LoadingManager.hide();
    }
}

// ===== 添加链接模态框 =====
function openAddLinkModal() {
    loadCategoriesToSelect();
    AccessibilityManager.openModal('addLinkModal');
}

function closeAddLinkModal() {
    AccessibilityManager.closeModal('addLinkModal');
    $('linkNameInput').value = '';
    $('linkUrlInput').value = '';
    const categorySelect = $('linkCategorySelect');
    if (categorySelect) categorySelect.value = '1';
}

// ===== 分类管理模态框 =====
function openCategoryManageModal() {
    renderCategoryList();
    AccessibilityManager.openModal('categoryManageModal');
}

function closeCategoryManageModal() {
    AccessibilityManager.closeModal('categoryManageModal');
    $('newCategoryNameInput').value = '';
}

// ===== 渲染分类管理列表 =====
function renderCategoryList() {
    const data = DataManager.getData();
    const container = $('categoryListContainer');
    if (!container) return;

    container.innerHTML = '';

    const categories = data.categories
        .filter(cat => cat.id !== 1)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

    if (categories.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state__icon">📁</div><div class="empty-state__text">暂无分类，请在上方添加</div></div>';
        return;
    }

    categories.forEach(category => {
        const categoryItem = document.createElement('div');
        categoryItem.className = 'category-list-item';
        categoryItem.dataset.categoryId = category.id;

        // 名称文本展示
        const nameSpan = document.createElement('span');
        nameSpan.className = 'category-list-name';
        nameSpan.textContent = category.name;

        // 编辑输入框（默认隐藏）
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'settings-input category-list-input is-hidden';
        nameInput.value = category.name;

        // 按钮组
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-category-btn';
        editBtn.textContent = '修改';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'save-category-btn is-hidden';
        saveBtn.textContent = '保存';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-category-btn is-hidden';
        cancelBtn.textContent = '取消';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-category-btn';
        deleteBtn.textContent = '删除';

        const enterEditMode = () => {
            nameSpan.classList.add('is-hidden');
            nameInput.classList.remove('is-hidden');
            editBtn.classList.add('is-hidden');
            deleteBtn.classList.add('is-hidden');
            saveBtn.classList.remove('is-hidden');
            cancelBtn.classList.remove('is-hidden');
            nameInput.value = category.name;
            nameInput.focus();
            nameInput.select();
        };

        const exitEditMode = () => {
            nameSpan.classList.remove('is-hidden');
            nameInput.classList.add('is-hidden');
            editBtn.classList.remove('is-hidden');
            deleteBtn.classList.remove('is-hidden');
            saveBtn.classList.add('is-hidden');
            cancelBtn.classList.add('is-hidden');
        };

        const saveEdit = () => {
            const newName = nameInput.value.trim();
            if (!newName) {
                ToastManager.warning('分类名称不能为空');
                nameInput.focus();
                return;
            }
            if (newName === category.name) { exitEditMode(); return; }
            renameCategory(category.id, newName); // 内部会重新渲染列表
        };

        editBtn.addEventListener('click', enterEditMode);
        saveBtn.addEventListener('click', saveEdit);
        cancelBtn.addEventListener('click', exitEditMode);

        nameInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') saveEdit();
            else if (e.key === 'Escape') exitEditMode();
        });

        categoryItem.appendChild(nameSpan);
        categoryItem.appendChild(nameInput);
        categoryItem.appendChild(editBtn);
        categoryItem.appendChild(saveBtn);
        categoryItem.appendChild(cancelBtn);
        categoryItem.appendChild(deleteBtn);
        container.appendChild(categoryItem);
    });
}

// ===== 添加新分类 =====
function addNewCategory() {
    const categoryName = $('newCategoryNameInput').value.trim();
    if (!categoryName) { ToastManager.warning('请输入分类名称'); return; }

    const data = DataManager.getData();
    if (data.categories.find(cat => cat.name === categoryName)) {
        ToastManager.warning('该分类名称已存在');
        return;
    }

    const newCategory = {
        id: DataManager.getNextId(data.categories),
        name: categoryName,
        icon: '',
        order: data.categories.filter(cat => cat.id !== 1).length + 1
    };
    data.categories.push(newCategory);
    DataManager.saveData(data);
    CloudflareSync.autoSync().catch(() => {});
    renderCategoryLinks();
    renderCategoryList();
    $('newCategoryNameInput').value = '';
    ToastManager.success('分类已添加');
}

// ===== 重命名分类 =====
function renameCategory(categoryId, newName) {
    if (!newName || !newName.trim()) { ToastManager.warning('分类名称不能为空'); return; }

    const data = DataManager.getData();
    if (data.categories.find(cat => cat.name === newName && cat.id !== categoryId)) {
        ToastManager.warning('该分类名称已存在');
        return;
    }

    const category = data.categories.find(cat => cat.id === categoryId);
    if (category) {
        category.name = newName.trim();
        DataManager.saveData(data);
        CloudflareSync.autoSync();
        renderCategoryLinks();
        renderCategoryList();
        ToastManager.success('分类已重命名');
    }
}

// ===== 加载分类到选择框 =====
function loadCategoriesToSelect() {
    const data = DataManager.getData();
    const categorySelect = $('linkCategorySelect');
    if (!categorySelect) return;

    categorySelect.innerHTML = '';

    const commonOption = document.createElement('option');
    commonOption.value = '1';
    commonOption.textContent = '常用网站';
    commonOption.selected = true;
    categorySelect.appendChild(commonOption);

    const categories = data.categories
        .filter(cat => cat.id !== 1)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.appendChild(option);
    });
}

// ===== 保存链接 =====
function saveLink() {
    const name = $('linkNameInput').value.trim();
    const url = $('linkUrlInput').value.trim();
    const categoryId = parseInt($('linkCategorySelect').value);

    if (!name || !url) { ToastManager.warning('请填写网站名称和URL'); return; }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        ToastManager.warning('URL必须以 http:// 或 https:// 开头');
        return;
    }
    if (!categoryId) { ToastManager.warning('请选择要添加到的分类'); return; }

    const data = DataManager.getData();
    const newLink = {
        id: DataManager.getNextId(data.links),
        name: name,
        url: url,
        category_id: categoryId,
        order: data.links.filter(l => l.category_id === categoryId).length + 1,
        color: 'default'
    };

    data.links.push(newLink);
    DataManager.saveData(data);
    CloudflareSync.autoSync();
    renderCommonLinks();
    renderCategoryLinks();
    closeAddLinkModal();
    ToastManager.success('链接已添加');
}

// ===== 创建链接卡片 (公共方法，消除重复代码) =====
function createLinkCard(link) {
    const linkDiv = document.createElement('div');
    linkDiv.className = 'category-module__link';
    linkDiv.dataset.linkId = link.id;
    linkDiv.dataset.color = link.color || 'default';

    const linkA = document.createElement('a');
    linkA.href = link.url;
    linkA.target = '_blank';
    linkA.rel = 'noopener noreferrer';
    linkA.draggable = false;

    const iconImg = document.createElement('img');
    iconImg.className = 'link-icon';
    iconImg.draggable = false;
    iconImg.alt = '';
    iconImg.loading = 'lazy';
    try {
        const urlObj = new URL(link.url);
        iconImg.src = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
    } catch(e) {
        iconImg.src = 'https://www.google.com/s2/favicons?domain=example.com&sz=64';
    }
    iconImg.onerror = function() { this.style.visibility = 'hidden'; };

    const textSpan = document.createElement('span');
    textSpan.className = 'link-text';
    textSpan.textContent = link.name;

    linkA.appendChild(iconImg);
    linkA.appendChild(textSpan);

    linkDiv.addEventListener('contextmenu', function(e) { showContextMenu(e, link.id); });
    bindLongPress(linkDiv, link.id);
    addDragEvents(linkDiv);
    linkDiv.appendChild(linkA);
    return linkDiv;
}

// ===== 渲染常用网站 =====
function renderCommonLinks() {
    const data = DataManager.getData();
    const container = $('common-links-content');
    if (!container) return;

    const commonLinks = data.links.filter(link => link.category_id === 1);

    // 更新数量徽章
    const countEl = $('commonCount');
    if (countEl) countEl.textContent = commonLinks.length;

    container.innerHTML = '';

    if (commonLinks.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state__icon">📋</div><div class="empty-state__text">暂无链接，点击"增加链接"添加</div></div>';
        return;
    }

    const linksContainer = document.createElement('div');
    linksContainer.className = 'category-module__links';
    commonLinks.forEach(link => linksContainer.appendChild(createLinkCard(link)));
    container.appendChild(linksContainer);

    CollapseManager.bindAll();
    LinkFilter.apply();
}

// ===== 渲染分类模块 =====
function renderCategoryLinks() {
    const data = DataManager.getData();
    const container = $('category-modules-container');
    if (!container) return;

    container.innerHTML = '';

    const categories = data.categories
        .filter(cat => cat.id !== 1)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

    if (categories.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state__icon">📂</div><div class="empty-state__text">暂无其他分类，请点击"分类管理"添加</div></div>';
        return;
    }

    categories.forEach(category => {
        const categoryLinks = data.links.filter(link => link.category_id === category.id);

        const categoryModule = document.createElement('div');
        categoryModule.className = 'category-module category-module__box';
        categoryModule.dataset.categoryId = category.id;

        // 标题区域
        const titleSection = document.createElement('div');
        titleSection.className = 'category-module__header';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'inline-block category-module__title-wrapper category-module__title-wrapper--active';

        const titleLink = document.createElement('a');
        titleLink.className = 'category-module__title';
        titleLink.textContent = category.name;

        const countBadge = document.createElement('span');
        countBadge.className = 'category-module__count';
        countBadge.textContent = categoryLinks.length;

        // 右键删除分类
        titleLink.oncontextmenu = async function(e) {
            e.preventDefault();
            const msg = categoryLinks.length > 0
                ? `该分类下有 ${categoryLinks.length} 个链接，确定要删除整个分类吗？`
                : '确定要删除这个分类吗？';
            const confirmed = await ConfirmManager.show('删除分类', msg, { danger: true });
            if (confirmed) {
                deleteCategory(category.id);
                ToastManager.success('分类已删除');
            }
        };

        // 折叠 / 展开按钮
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'category-module__toggle';
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.setAttribute('aria-label', '折叠或展开该分类');
        toggleBtn.title = '折叠 / 展开';
        toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

        titleDiv.appendChild(titleLink);
        titleDiv.appendChild(countBadge);
        titleSection.appendChild(titleDiv);
        titleSection.appendChild(toggleBtn);
        categoryModule.appendChild(titleSection);

        // 内容区域（外层负责折叠动画）
        const bodySection = document.createElement('div');
        bodySection.className = 'category-module__body';
        const bodyInner = document.createElement('div');
        bodyInner.className = 'category-module__body-inner';
        const linksContainer = document.createElement('div');
        linksContainer.className = 'category-module__content';

        if (categoryLinks.length > 0) {
            const linksDiv = document.createElement('div');
            linksDiv.className = 'category-module__links';
            categoryLinks.forEach(link => linksDiv.appendChild(createLinkCard(link)));
            linksContainer.appendChild(linksDiv);
        } else {
            linksContainer.innerHTML = '<div class="empty-state"><div class="empty-state__icon">📋</div><div class="empty-state__text">暂无链接，点击"增加链接"添加</div></div>';
        }

        bodyInner.appendChild(linksContainer);
        bodySection.appendChild(bodyInner);
        categoryModule.appendChild(bodySection);
        container.appendChild(categoryModule);
    });

    CollapseManager.bindAll();
    LinkFilter.apply();
}

// ===== 删除分类 =====
function deleteCategory(categoryId) {
    const data = DataManager.getData();
    data.links = data.links.filter(l => l.category_id !== categoryId);
    data.categories = data.categories.filter(c => c.id !== categoryId);
    DataManager.saveData(data);
    CloudflareSync.autoSync();
    renderCommonLinks();
    renderCategoryLinks();
}

// ===== 编辑链接 =====
let currentEditLinkId = null;

function openEditLinkModal(linkId) {
    const data = DataManager.getData();
    const link = data.links.find(l => l.id === linkId);
    if (!link) return;

    currentEditLinkId = linkId;
    $('editLinkNameInput').value = link.name;
    $('editLinkUrlInput').value = link.url;
    AccessibilityManager.openModal('editLinkModal');
    hideContextMenu();
}

function closeEditLinkModal() {
    AccessibilityManager.closeModal('editLinkModal');
    currentEditLinkId = null;
    $('editLinkNameInput').value = '';
    $('editLinkUrlInput').value = '';
}

function saveEditLink() {
    if (!currentEditLinkId) return;

    const name = $('editLinkNameInput').value.trim();
    let url = $('editLinkUrlInput').value.trim();

    if (!name) { ToastManager.warning('请输入链接名称'); return; }
    if (!url) { ToastManager.warning('请输入链接地址'); return; }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    const data = DataManager.getData();
    const link = data.links.find(l => l.id === currentEditLinkId);
    if (link) {
        link.name = name;
        link.url = url;
        DataManager.saveData(data);
        CloudflareSync.autoSync();
        renderCommonLinks();
        renderCategoryLinks();
        ToastManager.success('链接已更新');
    }
    closeEditLinkModal();
}

// ===== 删除链接 (使用通用确认弹窗) =====
async function deleteLink(linkId) {
    const data = DataManager.getData();
    const link = data.links.find(l => l.id === linkId);
    const linkName = link ? link.name : '该链接';

    const confirmed = await ConfirmManager.show('确认删除',
        `确定要删除 "${linkName}" 吗？`, { danger: true });

    if (confirmed) {
        data.links = data.links.filter(l => l.id !== linkId);
        DataManager.saveData(data);
        CloudflareSync.autoSync();
        renderCommonLinks();
        renderCategoryLinks();
        ToastManager.success('链接已删除');
    }
    hideContextMenu();
}

// ===== 右键菜单 =====
let lastContextMenuX = 0;
let lastContextMenuY = 0;

// 显示菜单（contextMenu 为 position:fixed，故用 clientX/clientY 定位）
function showContextMenuAt(clientX, clientY, linkId) {
    const contextMenu = $('contextMenu');
    contextMenu.classList.add('is-visible');

    // 智能定位：避免超出视窗
    const menuWidth = 170;
    const menuHeight = 160;
    let x = clientX;
    let y = clientY;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
    if (x < 8) x = 8;
    if (y < 8) y = 8;

    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.dataset.linkId = linkId;

    lastContextMenuX = x;
    lastContextMenuY = y;
}

function showContextMenu(e, linkId) {
    e.preventDefault();
    showContextMenuAt(e.clientX, e.clientY, linkId);
}

function hideContextMenu() {
    $('contextMenu')?.classList.remove('is-visible');
}

// ===== 移动端：长按卡片弹出菜单 =====
function bindLongPress(linkDiv, linkId) {
    let timer = null, startX = 0, startY = 0, fired = false;

    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };

    linkDiv.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        fired = false;
        cancel();
        timer = setTimeout(() => {
            timer = null;
            fired = true;
            try { if (navigator.vibrate) navigator.vibrate(15); } catch (err) {}
            showContextMenuAt(startX, startY, linkId);
        }, 500);
    }, { passive: true });

    linkDiv.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        if (!t) return;
        if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) cancel();
    }, { passive: true });

    linkDiv.addEventListener('touchend', cancel);
    linkDiv.addEventListener('touchcancel', cancel);

    // 长按已弹菜单时，拦截随后的 click，避免误打开链接
    linkDiv.addEventListener('click', (e) => {
        if (fired) {
            e.preventDefault();
            e.stopPropagation();
            fired = false;
        }
    }, true);
}

// ===== 颜色选择子菜单 =====
const linkColors = [
    { value: 'red', label: '红色', dot: 'var(--color-red)' },
    { value: 'blue', label: '蓝色', dot: 'var(--color-blue)' },
    { value: 'green', label: '绿色', dot: 'var(--color-green)' },
    { value: 'purple', label: '紫色', dot: 'var(--color-purple)' },
    { value: 'orange', label: '橙色', dot: 'var(--color-orange)' },
    { value: 'default', label: '默认', dot: 'var(--text-secondary)' }
];

function showColorSubmenu(linkId) {
    hideContextMenu();

    // 移除已有子菜单
    document.getElementById('colorSubmenu')?.remove();

    const colorMenu = document.createElement('div');
    colorMenu.id = 'colorSubmenu';
    colorMenu.className = 'context-menu color-submenu is-visible';
    colorMenu.style.left = lastContextMenuX + 'px';
    colorMenu.style.top = lastContextMenuY + 'px';

    linkColors.forEach(c => {
        const item = document.createElement('div');
        item.className = 'context-menu__item color-option';
        item.dataset.color = c.value;
        item.innerHTML = `<span class="color-dot" style="background:${c.dot}"></span> ${c.label}`;
        colorMenu.appendChild(item);
    });

    document.body.appendChild(colorMenu);

    colorMenu.addEventListener('click', function(e) {
        const option = e.target.closest('.color-option');
        if (option) {
            changeLinkColor(linkId, option.dataset.color);
            colorMenu.remove();
            ToastManager.success('颜色已更新');
        }
    });

    setTimeout(() => {
        document.addEventListener('click', function closeSubmenu(e) {
            if (!colorMenu.contains(e.target)) {
                colorMenu.remove();
                document.removeEventListener('click', closeSubmenu);
            }
        });
    }, 10);
}

function changeLinkColor(linkId, color) {
    const data = DataManager.getData();
    const link = data.links.find(l => l.id === linkId);
    if (link) {
        link.color = color;
        DataManager.saveData(data);
        CloudflareSync.autoSync();
        renderCommonLinks();
        renderCategoryLinks();
    }
}

// ===== 拖拽排序 =====
let draggedItem = null;

function addDragEvents(linkDiv) {
    linkDiv.draggable = true;

    linkDiv.addEventListener('dragstart', function(e) {
        draggedItem = this;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => this.classList.add('dragging'), 0);
    });

    linkDiv.addEventListener('dragend', function() {
        this.classList.remove('dragging');
        draggedItem = null;
    });

    linkDiv.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (draggedItem && draggedItem !== this) {
            this.classList.add('drag-over');
        }
    });

    linkDiv.addEventListener('dragleave', function() {
        this.classList.remove('drag-over');
    });

    linkDiv.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        if (draggedItem && draggedItem !== this) {
            const sourceId = parseInt(draggedItem.dataset.linkId);
            const targetId = parseInt(this.dataset.linkId);
            reorderLinks(sourceId, targetId);
        }
    });
}

function reorderLinks(sourceId, targetId) {
    const data = DataManager.getData();
    const sourceIndex = data.links.findIndex(l => l.id === sourceId);
    const targetIndex = data.links.findIndex(l => l.id === targetId);

    if (sourceIndex > -1 && targetIndex > -1) {
        if (data.links[sourceIndex].category_id === data.links[targetIndex].category_id) {
            const [movedItem] = data.links.splice(sourceIndex, 1);
            data.links.splice(targetIndex, 0, movedItem);

            const categoryId = movedItem.category_id;
            const categoryLinks = data.links.filter(l => l.category_id === categoryId);
            categoryLinks.forEach((link, index) => { link.order = index + 1; });

            DataManager.saveData(data);
            CloudflareSync.autoSync();
            renderCommonLinks();
            renderCategoryLinks();
        }
    }
}

// ===== 事件绑定 =====
function bindEvents() {
    // 按钮事件映射
    const events = {
        'categoryManageBtn': ['click', openCategoryManageModal],
        'addLinkBtn': ['click', openAddLinkModal],
        'settingsBtn': ['click', openSettings],
        'loginBtn': ['click', login],
        'settingsClose': ['click', closeSettings],
        'downloadFromCloudBtn': ['click', downloadFromCloud],
        'uploadToCloudBtn': ['click', uploadToCloud],
        'exportDataBtn': ['click', exportData],
        'importDataBtn': ['click', importData],
        'resetDataBtn': ['click', resetData],
        'importDataInput': ['change', handleFileImport],
        'addLinkClose': ['click', closeAddLinkModal],
        'cancelLinkBtn': ['click', closeAddLinkModal],
        'saveLinkBtn': ['click', saveLink],
        'categoryManageClose': ['click', closeCategoryManageModal],
        'addNewCategoryBtn': ['click', addNewCategory],
        'editLinkClose': ['click', closeEditLinkModal],
        'cancelEditLinkBtn': ['click', closeEditLinkModal],
        'saveEditLinkBtn': ['click', saveEditLink],
        'editLinkBtn': ['click', () => openEditLinkModal(parseInt($('contextMenu').dataset.linkId))],
        'colorLinkBtn': ['click', () => showColorSubmenu(parseInt($('contextMenu').dataset.linkId))],
        'deleteLinkBtn': ['click', () => deleteLink(parseInt($('contextMenu').dataset.linkId))],
        'backToTop': ['click', () => window.scrollTo({ top: 0, behavior: 'smooth' })]
    };

    Object.entries(events).forEach(([id, [event, handler]]) => {
        const el = $(id);
        if (el) el.addEventListener(event, handler);
    });

    // 新分类输入框回车
    $('newCategoryNameInput')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') addNewCategory();
    });

    // 模态框外部点击关闭
    const modalCloseMap = {
        'settingsPanel': () => closeSettings(),
        'addLinkModal': () => closeAddLinkModal(),
        'editLinkModal': () => closeEditLinkModal(),
        'categoryManageModal': () => closeCategoryManageModal(),
        'confirmModal': () => ConfirmManager._resolveConfirm(false)
    };

    Object.keys(modalCloseMap).forEach(id => {
        const modal = $(id);
        if (!modal) return;
        const content = modal.querySelector('.settings-panel__content');
        content?.addEventListener('click', e => e.stopPropagation());
        modal.addEventListener('click', e => {
            if (e.target === modal) modalCloseMap[id]();
        });
    });

    // 搜索引擎下拉菜单
    const searchEngineSelector = $('searchEngineSelector');
    const searchEngineDropdown = $('searchEngineDropdown');
    const searchForm = $('searchForm');

    if (searchEngineSelector && searchEngineDropdown && searchForm) {
        const toggleEngineMenu = function() {
            const open = searchEngineDropdown.classList.toggle('is-visible');
            searchEngineSelector.classList.toggle('is-open', open);
        };

        searchEngineSelector.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleEngineMenu();
        });

        // 键盘可访问：回车 / 空格展开
        searchEngineSelector.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                e.stopPropagation();
                toggleEngineMenu();
            }
        });

        searchEngineDropdown.addEventListener('click', function(e) {
            const item = e.target.closest('.search-engine-dropdown__item');
            if (!item) return;
            e.stopPropagation();

            const engine = item.dataset.engine;
            const { url, icon } = searchEngines[engine];

            searchForm.action = url;
            const iconEl = searchEngineSelector.querySelector('.search-engine-icon');
            iconEl.src = icon;
            iconEl.dataset.engine = engine;
            iconEl.alt = engine;

            searchEngineDropdown.querySelectorAll('.search-engine-dropdown__item').forEach(el => {
                el.classList.toggle('is-active', el === item);
            });

            searchEngineDropdown.classList.remove('is-visible');
            searchEngineSelector.classList.remove('is-open');
        });

        document.addEventListener('click', () => {
            searchEngineDropdown.classList.remove('is-visible');
            searchEngineSelector.classList.remove('is-open');
        });
    }

    // 右键菜单隐藏
    document.addEventListener('click', e => {
        if (!e.target.closest('#contextMenu') && !e.target.closest('[data-link-id]')) {
            hideContextMenu();
        }
    });

    // 分类删除事件委托
    $('categoryListContainer')?.addEventListener('click', async e => {
        if (e.target.matches('.delete-category-btn')) {
            const categoryId = parseInt(e.target.closest('.category-list-item').dataset.categoryId);
            const links = DataManager.getData().links.filter(l => l.category_id === categoryId);
            const msg = links.length > 0
                ? `该分类下有 ${links.length} 个链接，确定要删除整个分类吗？`
                : '确定要删除这个分类吗？';
            const confirmed = await ConfirmManager.show('删除分类', msg, { danger: true });
            if (confirmed) {
                deleteCategory(categoryId);
                renderCategoryList();
                ToastManager.success('分类已删除');
            }
        }
    });

    // 配置输入框监听
    ['workerUrl', 'apiToken'].forEach(id => {
        $(id)?.addEventListener('input', () => updateConfigStatus({
            workerUrl: $('workerUrl').value.trim(),
            apiToken: $('apiToken').value.trim()
        }));
    });

    // 回到顶部按钮 + 滚动时收起右键菜单
    window.addEventListener('scroll', () => {
        const btn = $('backToTop');
        if (btn) {
            btn.classList.toggle('is-visible', window.scrollY > 300);
        }
        hideContextMenu();
    }, { passive: true });
}

// ===== 诊断信息面板 =====
function initDiagnostics() {
    const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
    set('diagVersion', 'v' + APP_VERSION);
    set('diagLens', 'Google Lens（沙箱桥）');
    set('diagProto', location.protocol + (location.host ? '//' + location.host : ''));
    if (ImageSearch.bridgeOrigin) set('diagOrigin', ImageSearch.bridgeOrigin);
    $('forceRefreshBtn')?.addEventListener('click', forceRefresh);
    $('recheckLensBtn')?.addEventListener('click', () => {
        const el = $('diagOrigin');
        if (el) { el.textContent = '检测中…'; el.className = ''; }
        ImageSearch.bridgeOrigin = null;
        ImageSearch.bridgeBroken = false;
        ImageSearch.pingSelf();
        ToastManager.info('正在重新检测识图沙箱…', 2500);
    });
}

// ===== 强制刷新：注销 SW + 清空 Cache Storage + 带时间戳重载 =====
async function forceRefresh() {
    LoadingManager.show('正在清除缓存并重新加载…');
    try {
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister().catch(() => false)));
        }
        if (window.caches && caches.keys) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k).catch(() => false)));
        }
    } catch (e) {
        console.warn('清理缓存失败:', e);
    }
    const url = new URL(location.href);
    url.searchParams.set('_r', Date.now());
    location.replace(url.toString());
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', function() {
    // 初始化各管理器
    ToastManager.init();
    ConfirmManager.init();
    LoadingManager.init();
    AccessibilityManager.init();
    CloudflareSync.init();
    ThemeManager.init();
    ClockManager.init();
    CollapseManager.init();
    LinkFilter.init();
    ImageSearch.init();
    initDiagnostics();

    // 绑定事件
    bindEvents();

    // 渲染页面
    renderCommonLinks();
    renderCategoryLinks();

    // 初始化弹窗拖拽
    ['settingsPanel', 'addLinkModal', 'editLinkModal', 'categoryManageModal', 'confirmModal'].forEach(id => {
        makeDraggable(id, `${id}Header`);
    });

    // file:// 环境提示（离线缓存 / PWA 不可用；识图仍可用）
    if (location.protocol === 'file:') {
        setTimeout(() => {
            ToastManager.info('当前通过 file:// 打开，离线缓存不可用；建议用 http://localhost:8080 访问', 7000);
        }, 1500);
    }
});
