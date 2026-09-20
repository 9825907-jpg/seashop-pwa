// SeaShop PWA — service worker: кэширует "оболочку" приложения, чтобы оно
// открывалось и работало без сети (все данные всё равно лежат в IndexedDB
// на устройстве, сеть сервис-воркеру нужна только чтобы один раз скачать
// файлы приложения и подхватывать их обновления).
const CACHE_VERSION = 'seashop-v8';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/format.js',
  './js/db.js',
  './js/logic.js',
  './js/app.js',
  './js/router.js',
  './js/components.js',
  './js/views/home.js',
  './js/views/orderDetail.js',
  './js/views/orderForm.js',
  './js/views/clients.js',
  './js/views/clientDetail.js',
  './js/views/products.js',
  './js/views/productForm.js',
  './js/views/purchases.js',
  './js/views/purchaseDetail.js',
  './js/views/purchaseForm.js',
  './js/views/stats.js',
  './js/views/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {
      // Отсутствующий на этом этапе файл не должен ронять установку —
      // при следующей активации кэш всё равно обновится через fetch-обработчик.
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Стратегия: сеть в приоритете (чтобы правки сразу подхватывались при
// наличии интернета), с откатом на кэш офлайн; успешный сетевой ответ
// обновляет кэш "по пути".
//
// Важно: обычный fetch(event.request) всё равно подчиняется HTTP-кэшу
// браузера (GitHub Pages отдаёт файлы с Cache-Control: max-age) — то есть
// "сеть в приоритете" могла на деле тихо вернуть кэшированный диском старый
// файл, даже без обращения к сети. Именно это, по всей видимости, и стояло
// за периодическими жалобами "фикс не подхватился сразу" на протяжении
// разработки. Чтобы гарантировать РЕАЛЬНО свежий ответ, для запросов
// собственных файлов приложения делаем сетевой запрос с {cache: 'no-store'}
// (запрос по URL, а не по исходному Request — конструктор Request не даёт
// переопределить cache для навигационных запросов).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(url.pathname + url.search, { cache: 'no-store' })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
