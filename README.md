# Navigator

<p>
  <img alt="HTML5" src="https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white">
  <img alt="CSS3" src="https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green">
</p>

**A zero-dependency, zero-build personal start page.**

English · [中文](README.zh-CN.md)

Navigator manages categories and links, supports drag-and-drop ordering, live
filtering, collapsible sections, light/dark themes, Google Lens image search and
optional cloud sync. Open `index.html` and it works; deploy it to any static
host when you want it online.

The core is six files (HTML, CSS, three JavaScript files and a Service Worker).
There is no framework, no bundler and no install step.

## Features

### Navigation

| Capability | Description |
| --- | --- |
| Categories | Create, rename and delete categories. |
| Links | Add, edit and delete links. |
| Drag and drop | Reorder cards directly, with visual feedback. |
| Colours | Six colour markers per link, available from the context menu. |
| Collapse | Collapse one category, or collapse/expand all. |

### Search and image search

- **Multiple search engines** — Google, Bing and Baidu, switchable from the
  icon on the left of the search box.
- **Google Lens** — choose an image with the camera icon and open the Lens
  results page.
- **Three input methods** — file picker, `Ctrl+V` paste, or drag an image onto
  the search box.
- **Live link filter** — filter saved links as you type; matching categories
  expand automatically and show a match count.
- **Pinyin initials** — type `blbl` to find 哔哩哔哩, or `mfym` to find 免费域名.
  The pinyin table is loaded on demand.

### Keyboard

| Key | Action |
| --- | --- |
| `/` | Focus the link filter. |
| `↑` / `↓` | Move between cards. |
| `Enter` | Open the selected link (or the first match). |
| `Esc` | Clear the filter, close the dialog, then close the context menu. |
| `Tab` | Focus top-bar buttons; `Enter` / `Space` activates them. |

### Browsing

- **Light and dark themes** — remembered and applied before the first paint, so
  there is no white flash.
- **Clock** — date, weekday and time in the header.
- **Toasts and custom dialogs** — no native `alert`/`confirm` interruptions.
- **Draggable panels** — dialogs can be moved out of the way.
- **Back to top** — floating button in the bottom-right corner.
- **Icon fallback** — a coloured initial block when a site icon cannot be
  fetched.

### Data and sync

- **Local first** — fully offline by default; data lives in `localStorage`.
- **Import/export** — one-click JSON backup and restore.
- **Optional cloud sync** — point it at a Cloudflare Worker to upload/download
  data, with debounced automatic sync.
- **Token authentication** — the Worker supports a `NAV_TOKEN` secret, so a
  leaked URL does not leak data.
- **Separate data per token** — different tokens use different KV keys.
- **No silent overwrite** — uploads carry an `If-Match` revision. A stale
  revision returns 409 and the UI offers merge, local overwrite or cancel.
- **Automatic backup** — before each upload the Worker stores the previous value
  as `<key>:prev`; settings can restore it.
- **Local snapshots** — up to five copies are kept before saves, so accidental
  category deletion or import can be undone.
- **Reset** — clear local data and return to the initial state.

### PWA and mobile

- **Installable** — `manifest.json` supports "Add to home screen".
- **Offline** — the Service Worker precaches static assets.
- **Responsive** — card columns and spacing adapt to small screens.
- **Touch friendly** — hit areas of at least 44 px, no sticky hover state, and a
  long-press menu for edit/colour/delete.
- **No iOS zoom** — inputs use 16 px text.

## Requirements

- A modern browser (see [compatibility](#browser-compatibility)).
- Python 3 or Node.js for a local HTTP server. `file://` works for basic use but
  Service Worker, PWA and cloud sync need HTTP(S).
- Optional: a Cloudflare account for the Worker + KV sync backend.

## Quick start

```bash
git clone https://github.com/cyjx007/navigator.git
cd navigator

# Python
python3 -m http.server 8080

# or Node.js
npx serve .
```

Open <http://localhost:8080>. On Windows you can also double-click
`start-server.bat`.

> Opening `index.html` through `file://` supports basic navigation, but the
> Service Worker, PWA install and cloud sync require HTTP(S).

## Project layout

```text
index.html          page shell, Service Worker registration, dialogs
style.css           theme variables, layout, responsive rules, animation
main.js             UI logic: collapse, filter, pinyin, keyboard, Lens, drag, dialogs
app.js              data layer: DataManager (localStorage) + CloudflareSync
pinyin.js           generated pinyin-initial table, loaded on demand (~22 KB)
sw.js               Service Worker: network-first HTML, stale-while-revalidate assets
_headers            cache and security headers for static hosting
worker/
  nav-api.js        sync Worker (token auth, data partitioning, icon proxy)
  wrangler.example.toml
manifest.json       PWA manifest with inline SVG icons
start-server.bat    one-click local server for Windows
LICENSE             MIT
```

## Deploy to Cloudflare

The full setup is **Pages (or Workers Static Assets) for the site** plus
**Worker + KV for sync**. If you only need local data, skip the Worker.

### 1. Create a KV namespace

1. Open the [Cloudflare dashboard](https://dash.cloudflare.com).
2. Go to **Workers & Pages → KV**.
3. Create a namespace named `NAV_DATA`.

### 2. Create and deploy the Worker

1. Go to **Workers & Pages → Create application → Create Worker** and name it,
   for example, `nav-api`.
2. Under **Settings → Variables → KV Namespace Bindings**, add:
   - variable name `NAV_DATA`
   - the namespace created above
3. Paste [`worker/nav-api.js`](worker/nav-api.js) into the editor and deploy.
   With wrangler: copy `worker/wrangler.example.toml` to
   `worker/wrangler.toml`, fill in the KV id, then `npx wrangler deploy`.
4. **Set a token (strongly recommended)**: add a Secret `NAV_TOKEN` under
   **Settings → Variables and Secrets**. With wrangler:
   `npx wrangler secret put NAV_TOKEN`.

Worker routes:

| Route | Description |
| --- | --- |
| `GET /api/data` | Read all data; requires `Authorization: Bearer <NAV_TOKEN>`. Returns `X-Data-Rev` / `X-Data-Updated`. |
| `POST /api/data` | Write all data; accepts `If-Match: <rev>`. A stale revision returns **409** without writing. |
| `GET /api/data/prev` | Automatic backup from before the last upload. |
| `GET /icon?u=example.com` | Site icon proxy, cached in KV for 30 days, no auth. |
| `GET /api/health` | Health check: `{ ok, auth, kv }`. |

> Without `NAV_TOKEN` the Worker falls back to the old "anyone can read/write"
> mode, which makes upgrades easier. With it set, requests without the token get
> 401.
>
> Data is stored under `data:<first 8 bytes of sha256(token)>`, so different
> tokens have separate partitions. Legacy data under `data` is read as a
> fallback and migrated on the first upload.

### 3. Deploy the static site

The repository already contains [`_headers`](_headers) for cache and security
headers:

- **Workers Static Assets** (what the live site uses): `npx wrangler deploy`
  with `assets.directory` pointing at the repository root.
- **Pages**: **Workers & Pages → Pages → Connect to git**, choose the repo,
  leave the build command empty and set the output directory to `/`.

### 4. Enable sync in the page

1. Open the site and click **Settings**.
2. Enter the Worker URL (`https://<worker>.<account>.workers.dev`).
3. Enter the `NAV_TOKEN` value.
4. Click **Log in**, then use **Upload** / **Download**.

After that, card icons prefer the `Worker/icon` proxy (Cloudflare edge fetch +
KV cache), fall back to public icon services, and finally to a coloured initial
block.

## Usage

### Basics

1. **Add a link** — **Add link** → choose a category → name and URL → save.
2. **Manage categories** — **Manage categories** → create, rename, delete.
3. **Edit a link** — right-click a card (long-press on mobile) → edit, colour,
   delete.
4. **Collapse** — click a category header or the arrow; **Collapse all** is in
   the top bar and the state is remembered.
5. **Filter** — type in the filter box below the search field.
6. **Back up** — Settings → Data → Export (do this regularly).

### Google Lens

1. Click the camera icon and choose a local image.
2. The Lens results page opens in a new tab (allow pop-ups for the site).
3. You can also paste with `Ctrl+V` or drag an image onto the search box.
4. If automatic navigation fails, the image is copied to the clipboard so you
   can paste it into the Lens window.

### Shortcuts

| Action | Effect |
| --- | --- |
| `/` | Focus the link filter. |
| `↑` / `↓` | Move between cards. |
| `Enter` | Open the selected link. |
| `Esc` | Clear filter / close dialog / close search-engine menu. |
| `Enter` / `Space` | Expand the search-engine selector. |
| `Ctrl+V` | Paste an image for Lens. |
| Drag an image onto the search box | Same as paste. |
| Right-click / long-press a card | Edit, colour, delete. |
| Drag a card | Reorder links. |

## Data storage

Everything is stored locally. Clearing site data, switching browsers or using
private mode loses it; export regularly or enable sync.

| Key | Contents |
| --- | --- |
| `nav_data` | All categories and links (`{ categories, links, meta }`). |
| `nav_settings` | Sync configuration (Worker URL, token). |
| `nav_sync` | Whether local changes are pending. |
| `nav_theme` | `light` or `dark`. |
| `nav_collapsed` | Collapsed state per category. |

Data shape:

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

New fields are only appended; existing fields are never renamed or removed, so
upgrades do not destroy saved data.

## Implementation notes

### Why image search needs a sandbox bridge

Posting a form directly to `lens.google.com/v3/upload` from an HTTP(S) page
fails: the browser always sends an `Origin` header and Google returns **403**.
Requests with `Origin: null` are accepted (303 to the Lens result page).

Navigator therefore submits the form from a **sandboxed iframe without
`allow-same-origin`** (an opaque origin), producing `Origin: null`, with no
third-party image host.

A second pitfall: the sandboxed iframe and a popup opened by the parent are not
same-origin, so `target="window-name"` is silently dropped. The submit bridge
lives inside the popup and navigates its own top-level window with
`target="_top"`, which the sandbox's `allow-top-navigation` permits.

### Cache strategy

- Static assets carry a `?v=` version.
- `sw.js` uses **network-first for HTML** (new deployments appear immediately)
  and **stale-while-revalidate for versioned assets**.
- Cross-origin requests (including the Lens upload) are not intercepted.
- **Force refresh** in settings unregisters the Service Worker, clears Cache
  Storage and reloads with a timestamp.

`_headers` deliberately omits `Cache-Control`: Cloudflare already sends
`public, max-age=0, must-revalidate` for static assets, and `_headers` appends
rather than replaces, producing two conflicting `max-age` values. Fast repeat
visits come from the Service Worker, not from platform caching.

### Pinyin table

`pinyin.js` is generated (`window.PINYIN_TABLE`, covering U+4E00–U+9FA5, index =
codepoint − 0x4E00) with [pinyin-pro](https://github.com/zh-lx/pinyin-pro) at
build time. It is only imported when the filter contains Latin letters.

## FAQ

**Why do I still see an old version after changing files?**
Check the page version under Settings → Diagnostics, click **Force refresh**, or
unregister the Service Worker in DevTools and reload. The static asset version,
`APP_VERSION` in `main.js` and `CACHE_NAME` in `sw.js` must be updated together.

**The camera icon does nothing.**
Allow pop-ups for the site. In Settings → Diagnostics, the sandbox bridge origin
should be `null`; if not, click **Recheck image search**. If navigation still
fails, the image is copied to the clipboard for manual paste.

**Why did a google.com.hk page open?**
Fixed in v2.2.1: the fallback no longer opens extra windows or redirects the
popup to the Lens home page.

**Can I lose data?**
Yes: clearing site data, changing browser/device or private mode. Export
regularly or configure sync.

**Why is the offline page an older version?**
That is the expected network-first + offline-fallback behaviour.

## Browser compatibility

| Browser | Minimum |
| --- | --- |
| Chrome / Edge | 70+ |
| Firefox | 65+ |
| Safari | 12+ |
| Mobile Chrome / Safari | current versions |

Older browsers may lack `DataTransfer`, `ClipboardItem` or Service Worker;
image search then falls back to the clipboard path.

## Development conventions

1. **Bump versions together** — `?v=x.y.z` in `index.html`, `APP_VERSION` in
   `main.js` and `CACHE_NAME` in `sw.js`.
2. **Keep data backward compatible** — only add fields to `nav_data`; never
   rename or remove them.
3. **No build tools** — keep "clone and run". `pinyin.js` is the only generated
   file and its output is committed.
4. **Comment the why** — especially for image search and caching.
5. **Check external resources** — icons, fonts and CDNs must have fallbacks and
   should work without a proxy.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

The code in this repository is released under the [MIT License](LICENSE),
copyright © 2026 cyjx007.

## Credits

- Started from
  [wangdaodaodao/simple-2000s-navigator](https://github.com/wangdaodaodao/simple-2000s-navigator):
  the page layout and initial implementation came from that project, then were
  heavily refactored here (sync protocol, pinyin search, icon proxy, animation,
  response headers).
- **The upstream repository has no license file** (GitHub detects no license),
  so it is "all rights reserved" by default. Personal use is fine; for
  commercial use or large public redistribution, contact the original author or
  confirm that a license has been added.
- Image search is provided by Google Lens.
