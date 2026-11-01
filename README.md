# 2000s-Navigator

一个**零依赖、零构建**的纯静态个人导航站 —— 分类管理、拖拽排序、链接过滤、分类折叠、深浅色模式、Google 识图、云端同步，一个 `index.html` 打开就能用。

<p>
  <img alt="HTML5" src="https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white">
  <img alt="CSS3" src="https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green">
</p>

---

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [部署到 Cloudflare](#部署到-cloudflare)
- [使用说明](#使用说明)
- [数据存储说明](#数据存储说明)
- [技术实现要点](#技术实现要点)
- [常见问题](#常见问题)
- [浏览器兼容性](#浏览器兼容性)
- [开发约定](#开发约定)
- [更新日志](#更新日志)
- [许可证](#许可证)

---

## 项目简介

2000s-Navigator 是一个不依赖任何框架、任何构建工具的个人导航页。全部源码只有 **5 个文件**（HTML / CSS / 两个 JS / 一个 Service Worker），把仓库丢到任意静态托管上就能跑。

- **数据归你自己**：所有导航数据存在浏览器 `localStorage`，可一键导出 JSON 备份，也可选接入 Cloudflare Worker 做多设备同步。
- **不破坏既有数据**：数据结构长期保持向后兼容，升级版本不会清空你已保存的分类与链接。
- **在线即最新**：Service Worker 采用「网络优先」策略，改完代码刷新就能看到新版，不再被旧缓存卡住。

---

## 功能特性

### 🏠 导航管理

| 能力 | 说明 |
| --- | --- |
| 分类管理 | 新建、重命名、删除分类 |
| 链接管理 | 新增、编辑、删除网站链接 |
| 拖拽排序 | 直接拖动卡片调整顺序，带视觉反馈 |
| 链接配色 | 6 种颜色标记，右键 / 长按即可切换 |
| 一键折叠 | 单个分类折叠展开，或「折叠全部 / 展开全部」 |

### 🔍 搜索与识图

- **多引擎搜索**：Google / Bing / 百度，点搜索框左侧图标即可切换（支持键盘回车展开）。
- **以图搜图（Google Lens）**：点搜索框右侧相机图标选图，自动跳转 Google Lens 识图结果。
- **三种投喂方式**：点相机按钮选文件 · `Ctrl+V` 粘贴剪贴板图片 · 把图片直接拖到搜索框上。
- **链接快速过滤**：搜索框下方输入关键词，实时筛选已保存的链接；命中的分类自动展开，并显示匹配数量与一键清空按钮。

### 🗂️ 浏览体验

- **深浅色模式**：一键切换，偏好自动记忆。
- **顶栏时钟**：显示日期、星期与时间。
- **自定义反馈**：用 Toast 通知替代 `alert`，用自定义确认弹窗替代 `confirm`，不再打断浏览。
- **弹窗可拖拽**：所有面板都能拖动位置。
- **回到顶部**：右下角悬浮按钮。
- **键盘友好**：`Esc` 关闭当前弹窗 / 收起下拉菜单。

### ☁️ 数据与同步

- **本地优先**：默认完全离线可用，数据存在浏览器本地。
- **导入 / 导出**：一键导出 JSON 备份，或从 JSON 文件恢复。
- **云端同步（可选）**：填入 Cloudflare Worker 地址后即可上传 / 下载数据；数据变更后自动同步（带防抖）。
- **一键重置**：清理本地数据，恢复到初始状态。

### 📱 PWA 与移动端

- **可安装**：带 `manifest.json`，可「添加到主屏幕」当独立 App 用。
- **离线可用**：Service Worker 预缓存静态资源，断网也能打开。
- **响应式布局**：小屏自动调整卡片列数与间距。
- **触屏优化**：点击热区放大到 ≥44px、避免 hover 粘滞高亮、长按卡片弹出「编辑 / 颜色 / 删除」菜单。
- **防缩放**：输入框统一 16px 字号，避免 iOS 聚焦时自动放大页面。

---

## 快速开始

### 本地预览

```bash
git clone https://github.com/cyjx007/simple-2000s-navigator.git
cd simple-2000s-navigator

# 方式一：Python 自带静态服务器
python -m http.server 8080
# 打开 http://localhost:8080

# 方式二（Windows）：双击 start-server.bat，自动起服务并打开浏览器

# 方式三：Node.js
npx serve .
```

> 直接双击 `index.html`（`file://`）也能用基本功能，但 **Service Worker / PWA / 云端同步需要 http(s) 环境**，建议用上面的本地服务器。

---

## 项目结构

```
simple-2000s-navigator/
├── index.html          # 页面骨架（含 SW 注册、弹窗结构）
├── style.css           # 全部样式：主题变量、布局、响应式、动效
├── main.js             # 界面逻辑：折叠、过滤、识图、拖拽、弹窗、诊断
├── app.js              # 数据层：DataManager（localStorage）+ CloudflareSync
├── sw.js               # Service Worker：网络优先缓存策略
├── manifest.json       # PWA 清单（内联 SVG 图标，无额外图片依赖）
├── start-server.bat    # Windows 一键本地预览脚本
├── LICENSE             # MIT 许可证
└── README.md           # 本文档
```

---

## 部署到 Cloudflare

整套方案分两部分：**Pages 托管静态文件** + **Worker + KV 提供数据接口**。只用本地存储的话，第 1、3 步即可，跳过 Worker。

### 1. 创建 KV 命名空间

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages → KV**
3. **Create namespace**，名称填 `NAV_DATA`

### 2. 创建并部署 Worker

1. 进入 **Workers & Pages → Create application → Create Worker**，命名如 `nav-api`
2. 在 **Settings → Variables → KV Namespace Bindings** 添加绑定：
   - Variable name：`NAV_DATA`
   - KV namespace：选择刚创建的命名空间
3. 粘贴以下代码并部署：

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/api/data') {
      if (request.method === 'GET') {
        const data = await env.NAV_DATA.get('data');
        return new Response(
          data || JSON.stringify({
            categories: [{ id: 1, name: '常用网站', icon: '', order: 1 }],
            links: [],
            meta: { version: 1, lastUpdate: new Date().toISOString() },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (request.method === 'POST') {
        const data = await request.text();
        await env.NAV_DATA.put('data', data);
        return new Response('OK', { headers: corsHeaders });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
```

### 3. 部署静态站点到 Pages

1. 进入 **Workers & Pages → Pages → Connect to git**，选择本仓库
2. 构建设置：
   - **Build command**：留空
   - **Build output directory**：`/`
   - **Root directory**：`/`
3. 部署完成后会得到一个 `https://<项目名>.pages.dev` 地址

### 4. 在页面里启用同步

1. 打开 Pages 地址，点右上角 **设置**
2. 填入 Worker 地址（`https://<worker名>.<账户>.workers.dev`）
3. **API Token** 留空即可（当前 Worker 示例未做鉴权）
4. 点 **登录**，验证通过后即可使用「上传到云端 / 下载云端数据」

> ⚠️ 示例 Worker 未做任何鉴权，**任何知道地址的人都能读写你的数据**。若要公开部署，请自行加 Token 校验或换用私有方案。

---

## 使用说明

### 基本操作

1. **添加链接**：右上角「增加链接」→ 选分类 → 填名称与 URL → 保存
2. **管理分类**：右上角「分类管理」→ 新建 / 重命名 / 删除
3. **编辑链接**：右键卡片（手机端长按）→ 编辑 / 颜色 / 删除
4. **折叠分类**：点分类标题栏或右侧圆形箭头；右上角「折叠全部」批量操作，状态会被记住
5. **过滤链接**：在搜索框下方的过滤框输入关键词，回车即筛
6. **导出备份**：设置 → 数据管理 → 导出数据（建议定期备份）

### 以图搜图

1. 点搜索框右侧的**相机图标**，选择一张本地图片
2. 会自动在 Google Lens 中打开识图结果（需允许本站弹出新标签页）
3. 也可以 `Ctrl+V` 粘贴剪贴板图片，或把图片文件拖到搜索框上
4. 若自动识图未成功，页面会**把图片复制到剪贴板**并在识图窗口里给出提示，按 `Ctrl+V` 粘贴即可
5. 可随时在 **设置 → 诊断信息** 里查看识图状态：**「沙箱桥 Origin」应显示为 `null`（绿色）**

### 快捷操作

| 操作 | 效果 |
| --- | --- |
| `Esc` | 关闭当前弹窗 / 收起搜索引擎下拉 |
| `Enter` / `Space` | 在搜索引擎选择器上展开下拉 |
| `Ctrl+V` | 粘贴图片直接识图 |
| 拖拽图片到搜索框 | 同上 |
| 右键 / 长按卡片 | 编辑 · 换色 · 删除 |
| 拖动卡片 | 调整链接顺序 |

---

## 数据存储说明

所有数据都存在浏览器本地，**换浏览器或清除站点数据会丢失**，请定期导出备份。

| 键名 | 内容 |
| --- | --- |
| `nav_data` | 全部分类与链接（`{ categories, links, meta }`） |
| `nav_settings` | 云端同步配置（Worker 地址、Token） |
| `nav_sync` | 是否有待同步的本地变更 |
| `nav_theme` | 主题偏好（`light` / `dark`） |
| `nav_collapsed` | 各分类的折叠状态 |

数据结构：

```jsonc
{
  "categories": [{ "id": 1, "name": "常用网站", "icon": "", "order": 1 }],
  "links": [
    { "id": 1, "name": "GitHub", "url": "https://github.com",
      "category_id": 1, "order": 1, "color": "" }
  ],
  "meta": { "version": 1, "lastUpdate": "2026-10-14T00:00:00.000Z" }
}
```

> 新增字段只会追加，不会删除或重命名已有字段，因此**升级版本不会破坏你的数据**。

---

## 技术实现要点

### 识图为什么需要一个「沙箱桥」

直接在当前页面用表单 POST 上传图片到 `lens.google.com/v3/upload` 会**稳定失败**：

- 从 http(s) 页面跨域提交表单时，浏览器**必定**会带上 `Origin` 头 → Google 返回 **403**
- 而 `Origin: null` 的请求可以通过（返回 303 并跳到 Lens 结果页）

所以本项目用一个 **不加 `allow-same-origin` 的 sandbox iframe**（其源是「不透明源」）来提交表单，请求就会带上 `Origin: null`，从而真正接通 Google Lens，**且不依赖任何第三方图床**。

还有一个容易被忽略的坑：沙箱 iframe 与父页面开的弹窗**不同源**，按 HTML 规范 `target="窗口名"` 会因「找不到该窗口」被**静默丢弃**。因此提交桥被放进**弹窗内部**，用 `target="_top"` 导航它自己的顶层窗口 —— 这条路径由 `sandbox` 的 `allow-top-navigation` 明确允许，不依赖同源窗口定位。

### 缓存策略

- 静态资源统一带 `?v=` 版本号
- `sw.js` 对同源请求使用 `fetch(req, { cache: 'no-cache' })`，绕过浏览器 HTTP 缓存
- 跨域请求（含识图上传）一律不拦截，避免干扰 Google Lens 提交
- 设置面板提供 **「强制刷新」**：注销 SW + 清空 Cache Storage + 带时间戳重载

---

## 常见问题

<details>
<summary><b>改了代码，刷新后还是旧版？</b></summary>

按顺序试：

1. 打开 **设置 → 诊断信息**，确认「页面版本」是不是最新版本号
2. 点 **强制刷新**（会自动注销 SW 并清空缓存后重载）
3. 仍不行就手动：DevTools → Application → Service Workers → Unregister，再 `Ctrl+Shift+R`
4. 或用无痕窗口打开

</details>

<details>
<summary><b>点相机图标没反应 / 识图没跳转？</b></summary>

- 检查 **设置 → 诊断信息** 里「沙箱桥 Origin」是否为 `null`。若不是，点「重新检测识图」
- 确认浏览器**允许本站弹出窗口**（地址栏右侧的拦截提示）
- 即使自动跳转失败，图片也会被复制到剪贴板，在识图页按 `Ctrl+V` 同样可以搜索

</details>

<details>
<summary><b>为什么打开识图后，又冒出个 google.com.hk 之类的页面？</b></summary>

v2.2.1 已修复：旧版兜底逻辑会额外 `window.open` 或把弹窗跳转到 Google Lens 首页，可能被 Google 重定向到地区首页。现在兜底**只在原有弹窗里显示提示**，不再新开任何页面。

</details>

<details>
<summary><b>数据会不会丢？</b></summary>

数据在浏览器 `localStorage` 里，以下情况会丢：清除浏览器站点数据、换浏览器 / 换设备、使用无痕模式。**请定期用「导出数据」备份**，或配置云端同步。

</details>

<details>
<summary><b>为什么离线打开是旧版页面？</b></summary>

这是「网络优先 + 离线回退缓存」的预期行为：联网时始终拉最新版，断网时用最后一次成功缓存的版本。

</details>

---

## 浏览器兼容性

| 浏览器 | 最低版本 |
| --- | --- |
| Chrome / Edge | 70+ |
| Firefox | 65+ |
| Safari | 12+ |
| 移动端 Chrome / Safari | 现代版本 |

> `DataTransfer`、`ClipboardItem`、Service Worker 等特性在过旧浏览器上可能不可用；识图会自动降级为剪贴板方式。

---

## 开发约定

1. **改完静态资源记得升版本号**：同步修改 `index.html` 里的 `?v=x.y.z`、`main.js` 的 `APP_VERSION`、`sw.js` 的 `CACHE_NAME`，三者保持一致，否则用户会看到旧版。
2. **保持数据结构向后兼容**：`nav_data` 只增字段，不改名、不删字段。
3. **不引入构建工具**：保持「克隆即运行」，不要新增需要编译的依赖。
4. **注释写清「为什么」**：尤其是识图、缓存这类反直觉的逻辑。

---

## 更新日志

### v2.2.2

- **Toast 换位置**：从右上角改到底部居中。原来通知会盖住「增加链接 / 设置」按钮，
  现在既不挡顶栏按钮，也不挡右下角的回到顶部（手机端有通知时按钮自动上移让位）
- **Toast 体验**：最多同时 3 条、鼠标悬停暂停倒计时（底部有细进度条）、点一下立即关闭
- **动效统一**：抽出 `--ease-out` / `--ease-spring` 曲线变量；卡片 hover 只过渡
  `transform / box-shadow / 颜色`（不再 `transition: all`），并补上按下反馈与 hover 高光
- **顶栏**：滚动后底色变实 + 投影；按钮补 `:active` 与键盘焦点环，支持 Tab + 回车操作
- **首屏不再白闪**：主题在 `<head>` 里同步应用，深色模式用户不会先看到白色页面
- **主题切换过渡**：切深浅色时颜色柔和过渡 0.32s，首屏加载不触发
- **细节**：渐变背景改为固定图层（滚动更跟手）、弹窗锁滚动时补滚动条宽度（页面不横跳）、
  弹窗内滚动不再带动整页、中文字体栈补苹方 / 微软雅黑、`prefers-reduced-motion` 下关闭动效

### v2.2.1

- **修复多余页面**：识图兜底不再 `window.open` 新标签页，也不再自动把弹窗跳转到 Google Lens 首页
  （旧行为会被 Google 重定向到 `google.com.hk/?olud` 之类的地区首页）
- **兜底逻辑更稳**：收到提交回执（`lens-submitted`）后立即取消兜底计时器，计时器从 4.5s 放宽到 6s，
  并新增 `_submitted` 标记，避免误判导致重复导航
- **兜底提示改版**：改为在原有识图弹窗内显示提示页（含手动打开链接），不再打扰式新开页面
- **代码清理**：删除无用的 `closePre()`
- **仓库整理**：新增 `.gitignore`，移除被误提交的 `.DS_Store`；补齐 `LICENSE`（MIT）
- **文档校正**：README 移除不存在的「天气 / 高德 API」章节，重写为与实际功能一致的结构

### v2.2.0

- **修复识图卡在「正在搜索」不动**：原因是沙箱 iframe 是不透明源，与父页面开的弹窗**不同源**，
  按规范 `target="窗口名"` 会被判定为「找不到该窗口」而静默丢弃。现改为把沙箱桥**放进弹窗内部**，
  用 `target="_top"` 导航它自己的顶层（由 `sandbox` 的 `allow-top-navigation` 明确允许）
- **识图失败自动降级**：若弹窗仍未跳转，自动把图片写入剪贴板并给出粘贴提示，保证始终有一条可用路径
- **诊断面板**新增「重新检测识图」按钮

### v2.1.0

- **缓存彻底治理**：静态资源统一加 `?v=` 版本号；Service Worker 同源请求强制 `cache: 'no-cache'`
- **设置面板新增「诊断信息」**：显示页面版本 / 识图引擎 / 沙箱桥 Origin / 运行环境，并提供「强制刷新」
- **识图自检**：沙箱桥启动后主动上报自身 origin（正常应为 `null`），异常时给出明确提示

### v2.0.0

- **界面焕新**：全新主题变量体系、毛玻璃顶栏、渐变 Logo、卡片悬浮动效
- **深浅色模式**：一键切换并记忆偏好
- **以图搜图**：接入 Google Lens（沙箱桥方案），支持选图 / 粘贴 / 拖拽
- **分类折叠展开**：状态持久化，支持一键折叠 / 展开全部
- **链接快速过滤**：实时筛选，命中分类自动展开并显示匹配数量
- **交互优化**：Toast 替代 `alert`，自定义确认弹窗替代 `confirm`，`Esc` 关闭弹窗
- **移动端适配**：响应式布局、触控热区放大、长按弹出菜单
- **缓存修复**：Service Worker 改为网络优先

### v1.0.0

- 初始版本：基础导航、云端同步、PWA 离线支持

---

## 许可证

本项目基于 [MIT License](LICENSE) 开源。

## 致谢

- 页面版式与最初的实现思路来自早期开源版本，感谢原作者的分享
- 识图能力由 Google Lens 提供

---

**享受你的个性化导航体验！** 🚀
