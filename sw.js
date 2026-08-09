/* 研数工坊 Service Worker — 离线缓存核心资源 */
const CACHE_NAME = 'kaoyan-math-v33';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js?v=33',
  './data/880数一基础篇.js',
  './vendor/katex/katex.min.js',
  './vendor/katex/katex.min.css',
  './vendor/katex/fonts/KaTeX_Main-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Math-Italic.woff2',
  './vendor/katex/fonts/KaTeX_AMS-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size1-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size2-Regular.woff2',
  './vendor/pako.min.js',
  './vendor/pdf-loader.mjs',
  './vendor/pdf.min.mjs',
  './vendor/pdf.worker.min.mjs',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

// 安装：预缓存核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // 逐个缓存，跳过失败的
      return Promise.allSettled(
        CORE_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// 请求策略：核心资源 cache-first，其余 network-first 回退 cache
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API 请求不走缓存
  if (url.pathname.startsWith('/api/')) return;

  // 核心静态资源：cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // 后台更新
        fetch(req).then(resp => {
          if (resp && resp.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(req, resp));
          }
        }).catch(() => {});
        return cached;
      }
      // 未命中：网络请求 → 缓存 → 返回
      return fetch(req).then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return resp;
      }).catch(() => {
        // 离线回退
        if (req.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
