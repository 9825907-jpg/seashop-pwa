// Простой hash-роутер: "#tab" или "#tab/id". Пять вкладок таб-бара —
// главная/заказы/клиенты/товары/закупки/статистика (см. app.js).
const routes = {};
let onChangeCallback = null;

export function registerRoute(tab, handler) { routes[tab] = handler; }

export function parseHash() {
  const raw = (window.location.hash || '#home').slice(1);
  const [tab, id] = raw.split('/');
  return { tab: tab || 'home', id: id || null };
}

export function navigate(tab, id = null) {
  window.location.hash = id ? `${tab}/${id}` : tab;
}

export function startRouter(onChange) {
  onChangeCallback = onChange;
  window.addEventListener('hashchange', dispatch);
  dispatch();
}

async function dispatch() {
  const { tab, id } = parseHash();
  const handler = routes[tab] || routes.home;
  if (onChangeCallback) onChangeCallback(tab);
  if (handler) await handler(id);
}
