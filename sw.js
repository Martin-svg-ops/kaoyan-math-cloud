/* 研数工坊 Service Worker — 离线缓存核心资源 */
const CACHE_NAME = 'kaoyan-math-v37';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js?v=35',
  './data/880数一基础篇.js',
  './data/gaoshu_jichu.js',
  './data/gaoshu_zonghe.js',
  './data/gaoshu_tuozhan.js',
  './vendor/mathjax/tex-svg.js',
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

// 请求策略：
//  - 文档(index.html)走 network-first，始终拿到最新页面(含新题库脚本)
//  - 核心静态资源 cache-first + 后台更新
//  - 其余 network-first 回退 cache
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API 请求不走缓存
  if (url.pathname.startsWith('/api/')) return;

  // 文档请求：network-first，保证页面永远最新
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(req).then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return resp;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // 核心静态资源：cache-first + 后台更新
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
