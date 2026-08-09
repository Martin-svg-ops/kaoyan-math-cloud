/* 研数工坊 Service Worker v3 — PWA 离线缓存 */
const CACHE_NAME = 'kaoyan-math-v62';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js?v=62',
  './vendor/mathjax/tex-svg.js',
  './vendor/pako.min.js',
  './vendor/pdf-loader.mjs',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];
// 注意：不缓存 data/*.js 题库文件，避免题库更新后用户看到旧数据

/* ── Install：预缓存静态资源 ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      )
    ).then(() => self.skipWaiting())
  );
});

/* ── Activate：清理旧版本缓存 ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch：智能缓存策略 ── */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API 请求 → 永远走网络，不缓存
  if (url.pathname.startsWith('/api/')) return;

  // 题库数据文件 → network-only（保证题库始终最新）
  if (url.pathname.includes('/data/')) return;

  // HTML 导航请求 → network-first
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 其余静态资源 → cache-first + 后台更新
  event.respondWith(cacheFirstWithRefresh(req));
});

/* ── 策略函数 ── */

// network-first：先尝试网络，失败则回退缓存
async function networkFirst(req) {
  try {
    const resp = await fetch(req);
    if (resp && resp.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, resp.clone());
    }
    return resp;
  } catch (_) {
    const cached = await caches.match(req);
    return cached || caches.match('./index.html');
  }
}

// cache-first + 后台更新（stale-while-revalidate 简化版）
async function cacheFirstWithRefresh(req) {
  const cached = await caches.match(req);
  if (cached) {
    // 后台静默更新缓存
    fetch(req).then(resp => {
      if (resp && resp.status === 200) {
        caches.open(CACHE_NAME).then(cache => cache.put(req, resp));
      }
    }).catch(() => {});
    return cached;
  }
  // 无缓存：网络获取
  try {
    const resp = await fetch(req);
    if (resp && resp.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, resp.clone());
    }
    return resp;
  } catch (_) {
    // 离线且无缓存：返回离线占位
    return new Response('Offline', { status: 503 });
  }
}

/* ── 消息通道：允许页面触发更新 ── */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
