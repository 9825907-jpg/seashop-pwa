// Точка входа PWA: каркас (область экрана), регистрация service worker'а,
// подключение экранов к роутеру. Навигация — гамбургер-меню (боковая
// шторка, см. components.js openNavDrawer) на каждом из основных разделов:
// Главная, Клиенты, Товары, Закупка, Статистика, Настройки. Раньше здесь
// был нижний таб-бар — убран после того, как гамбургер-меню появилось на
// всех основных экранах и стало основной навигацией (см. pwa-status.md).
import { registerRoute, startRouter } from './router.js';
import { h } from './components.js';
import * as home from './views/home.js';
import * as orderDetail from './views/orderDetail.js';
import * as clients from './views/clients.js';
import * as clientDetail from './views/clientDetail.js';
import * as products from './views/products.js';
import * as purchases from './views/purchases.js';
import * as purchaseDetail from './views/purchaseDetail.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js?v=e88f37a';

const app = document.getElementById('app');
const screen = h('div', { class: 'screen', id: 'screen' });
app.appendChild(screen);

registerRoute('home', (id) => home.render(screen, id));
registerRoute('order', (id) => orderDetail.render(screen, id));
registerRoute('clients', (id) => clients.render(screen, id));
registerRoute('client', (id) => clientDetail.render(screen, id));
registerRoute('products', (id) => products.render(screen, id));
registerRoute('purchases', (id) => purchases.render(screen, id));
registerRoute('purchase', (id) => purchaseDetail.render(screen, id));
registerRoute('stats', (id) => stats.render(screen, id));
registerRoute('settings', (id) => settings.render(screen, id));

startRouter(() => { screen.scrollTop = 0; });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Офлайн-кэш — не критично для работы: данные и так лежат в IndexedDB.
    });
  });
}

// ---------------------------------------------------------------------------
// iOS (standalone PWA) баг: после сворачивания приложения (свайп вверх,
// переключение на другое приложение и возврат) WebKit иногда «замораживает»
// компоновку/хит-тестинг для position:fixed-элементов с backdrop-filter —
// таб-бар и т.п. визуально остаются на месте, но перестают реагировать на
// нажатия, либо съезжают. Принудительный reflow при возврате приложения на
// передний план чинит это.
// ---------------------------------------------------------------------------
function forceReflow() {
  const prev = document.body.style.display;
  document.body.style.display = 'none';
  void document.body.offsetHeight; // синхронный reflow
  document.body.style.display = prev;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestAnimationFrame(forceReflow);
});
window.addEventListener('pageshow', () => requestAnimationFrame(forceReflow));

// ---------------------------------------------------------------------------
// Двойной тап по экрану в iOS Safari/standalone-PWA может запускать
// нативный жест "двойной тап — зум" даже при user-scalable=no/maximum-scale=1
// в viewport-мета и touch-action: manipulation в CSS (это не всегда
// достаточно на практике в WebKit). После такого зума позиции кнопок на
// экране визуально расходятся с их реальной областью нажатия. Дополнительно
// перехватываем сам жест на уровне JS — если второй тап происходит быстрее
// 350мс после предыдущего, отменяем его действие по умолчанию (в том числе
// зум), не давая жесту сработать вообще.
// ---------------------------------------------------------------------------
let lastTouchEnd = 0;
let lastTouchX = 0;
let lastTouchY = 0;
document.addEventListener(
  'touchend',
  (event) => {
    const now = Date.now();
    const touch = event.changedTouches && event.changedTouches[0];
    if (touch) {
      const dx = touch.clientX - lastTouchX;
      const dy = touch.clientY - lastTouchY;
      const sameSpot = Math.hypot(dx, dy) < 40;
      // Отменяем именно повторный тап рядом с предыдущим (настоящий
      // double-tap), а не любые два быстрых тапа по разным местам —
      // иначе быстрые последовательные нажатия на разные кнопки/вкладки
      // тоже начали бы глотаться.
      if (now - lastTouchEnd <= 350 && sameSpot) {
        event.preventDefault();
      }
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
    }
    lastTouchEnd = now;
  },
  { passive: false }
);

document.addEventListener('gesturestart', (event) => event.preventDefault());
