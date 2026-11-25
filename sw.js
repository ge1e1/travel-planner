// ============================================================
// 趣行 Travel · Service Worker（PWA 离线支持）
// 缓存策略：
//   - 页面导航：网络优先，离线回退到缓存的 index.html
//   - 静态资源（Tailwind CDN / 字体镜像 loli.net）：网络优先 + 缓存兜底 + 后台更新
//   - 图片（Unsplash / Picsum）与字体文件：缓存优先，离线可回看已浏览内容
//   - 业务 API（硅基流动 AI / wttr.in 天气 / 高德地图）：永不缓存，始终走网络
// 注意：Service Worker 仅在 http(s) 环境生效，file:// 打开时不会注册。
// ============================================================
const CACHE = 'quxing-v1';

// 30 城本地配图（与 index.html 同目录 images/ 下），安装时一并预缓存，离线完整可用
const CITY_IMAGES = [
  'sanya', 'chengdu', 'dali', 'beijing', 'xian', 'hangzhou', 'xiamen', 'zhangjiajie',
  'chongqing', 'shanghai', 'nanjing', 'suzhou', 'guangzhou', 'shenzhen', 'tianjin', 'qingdao',
  'dalian', 'haerbin', 'wuhan', 'changsha', 'luoyang', 'kunming', 'lijiang', 'xishuangbanna',
  'guilin', 'guiyang', 'lasa', 'xining', 'dunhuang', 'pingyao'
].map((id) => './images/' + id + '.jpg');

// 预缓存：页面打开所需的最小资源集（逐条独立缓存，单条失败不阻断安装）
const PRECACHE = [
  './',
  './index.html',
  'https://cdn.tailwindcss.com',
  'https://fonts.loli.net/css2?family=Ma+Shan+Zheng&family=Noto+Sans+SC:wght@400;500;700;900&family=ZCOOL+KuaiLe&display=swap',
  ...CITY_IMAGES
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 业务 API 黑名单：命中即直接放行网络，绝不读写缓存
const BYPASS_PATTERNS = [
  '/v1/chat/completions', // 硅基流动 AI（行程规划 / 微调 / 攻略）
  'wttr.in',              // 天气
  'restapi.amap.com'      // 高德静态地图
];

// 走"缓存优先"的资源：图片与字体文件（离线可回看）
function isCacheFirst(url) {
  return url.includes('images.unsplash.com') ||
    url.includes('picsum.photos') ||
    url.includes('/images/') || // 本地 30 城配图
    url.includes('fonts.loli.net') || // 字体 CSS（镜像）
    url.includes('gstatic.loli.net') ||
    url.includes('fonts.gstatic.com');
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (BYPASS_PATTERNS.some((p) => url.includes(p))) return; // 永远走网络

  // 页面导航请求：网络优先，成功则刷新缓存，离线回退到缓存的 index.html
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const fresh = fetch(e.request)
        .then((res) => {
          // 200 或不透明的跨域响应（no-cors 图片/字体）才写入缓存
          if (res && (res.status === 200 || res.type === 'opaque')) {
            cache.put(e.request, res.clone());
          }
          return res;
        })
        .catch(() => cached);
      return isCacheFirst(url) ? (cached || fresh) : (fresh.catch(() => cached));
    })
  );
});
