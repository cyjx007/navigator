/**
 * Service Worker - 导航页面缓存
 * v7: 同源资源 Network First，并强制绕过浏览器 HTTP 缓存（cache: 'no-cache'），
 *     确保改完代码刷新就能看到最新版；离线时回退 Cache Storage。
 *     跨域请求（含识图上传）一律不拦截，避免影响 Google Lens 提交。
 */

const CACHE_NAME = 'nav-cache-v8';

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

  // 同源请求：网络优先，离线回退缓存
  event.respondWith(networkFirst(req));
});

// 消息处理：支持页面主动触发更新
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
