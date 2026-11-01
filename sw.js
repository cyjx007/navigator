/**
 * Service Worker - 导航页面缓存
 * v9: HTML 走 Network First（部署后立刻换新）；带 ?v= 的静态资源走 Stale While
 *     Revalidate（秒开，后台更新）。跨域请求一律不拦截，避免影响识图上传。
 */

const CACHE_NAME = 'nav-cache-v9';

// 需要预缓存的静态资源（相对路径，兼容子目录部署）
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './main.js',
  './style.css',
  './manifest.json'
];

// Network First：优先网络，失败回退缓存
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // cache: 'no-cache' 会绕过浏览器 HTTP 缓存并强制向服务器校验，
    // 避免「改了代码但刷新还是旧版」
    let response;
    try {
      response = await fetch(request, { cache: 'no-cache' });
    } catch (e) {
      response = await fetch(request);
    }
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

// 安装
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理所有旧版本缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.map(n => (n !== CACHE_NAME ? caches.delete(n) : null))))
      .then(() => self.clients.claim())
  );
});

// 请求处理
self.addEventListener('fetch', event => {
  const req = event.request;

  // 只处理 GET
  if (req.method !== 'GET') return;
  if (!req.url.startsWith('http')) return;

  const url = new URL(req.url);

  // 跨域请求（favicon、图片等）直接放行，不拦截、不缓存
  if (url.origin !== self.location.origin) return;

  // HTML 一定要拿最新的（部署后立刻换到新的 ?v=），其余带版本号的资源可以先用缓存
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  const isVersioned = url.searchParams.has('v');

  if (isHTML || !isVersioned) {
    event.respondWith(networkFirst(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(req, event));
});

// Stale While Revalidate：先给缓存（快），后台再更新
// 只用在带 ?v= 的资源上——URL 变了就是新内容，不存在「拿到旧版」的问题
async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const update = fetch(request, { cache: 'no-cache' })
    .then(response => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    // 让后台更新有机会跑完，不被提前回收（拿不到 event 就算了，不影响返回）
    try {
      event.waitUntil(update);
    } catch (e) { /* ignore */ }
    return cached;
  }

  const fresh = await update;
  return fresh || Response.error();
}

// 消息处理：支持页面主动触发更新
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
