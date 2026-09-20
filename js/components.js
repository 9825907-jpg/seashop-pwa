// Мелкие переиспользуемые UI-хелперы: создание DOM-узлов, модалки/шиты,
// тосты, иконки (простые inline SVG), числовой калькулятор для полей ввода.

import { navigate } from './router.js';

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = v;
    else if (k === 'disabled') el.disabled = v;
    else el.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return el;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// ---------------------------------------------------------------------------
// Иконки
// ---------------------------------------------------------------------------
const ICONS = {
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-6h4v6"/>',
  orders: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  clients: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15.7 14.3c2.5.4 4.3 2.6 4.3 5.2"/>',
  products: '<path d="M3.5 8 12 3.5 20.5 8 12 12.5 3.5 8Z"/><path d="M3.5 8v8L12 20.5 20.5 16V8"/><path d="M12 12.5V20.5"/>',
  purchases: '<path d="M3 7h13l3 4v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"/><path d="M16 7V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2"/><circle cx="7.5" cy="19.5" r="1.4"/><circle cx="16.5" cy="19.5" r="1.4"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.9 7.9 0 0 0 0-2l2-1.5-2-3.4-2.4.7a8 8 0 0 0-1.7-1L14.8 3h-3.9l-.5 2.8a8 8 0 0 0-1.7 1l-2.4-.7-2 3.4L6.3 11a7.9 7.9 0 0 0 0 2l-2 1.5 2 3.4 2.4-.7a8 8 0 0 0 1.7 1l.5 2.8h3.9l.5-2.8a8 8 0 0 0 1.7-1l2.4.7 2-3.4-2-1.5Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M13.5 6.5l3 3"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  share: '<circle cx="18" cy="5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="M8.2 10.7 15.8 6.3M8.2 13.3l7.6 4.4"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.4"/><path d="M2.5 9.5h19"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  truck: '<path d="M2 7h11v9H2z"/><path d="M13 10h4l3.5 3.5V16H13z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
  box: '<path d="M3.5 8 12 3.5 20.5 8 12 12.5 3.5 8Z"/><path d="M3.5 8v8L12 20.5 20.5 16V8"/><path d="M12 12.5V20.5"/>',
  scale: '<path d="M12 3v18M6 8h12M6 8l-3 6a3.2 3.2 0 0 0 6 0L6 8ZM18 8l-3 6a3.2 3.2 0 0 0 6 0L18 8Z"/>',
  download: '<path d="M12 3v13M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  upload: '<path d="M12 20V7M7 12l5-5 5 5"/><path d="M4 20h16"/>',
  phone: '<path d="M6 3h3l1.5 4.5L8.5 9a11 11 0 0 0 6.5 6.5l1.5-2 4.5 1.5V18a2 2 0 0 1-2 2C11 20 4 13 4 5a2 2 0 0 1 2-2Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `icon ${cls}`;
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span.firstChild ? span : span;
}
export function iconSVG(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

// ---------------------------------------------------------------------------
// Секции/строки (аналог GlassSection/row в Swift)
// ---------------------------------------------------------------------------
export function section(children, title = null) {
  const wrap = document.createDocumentFragment();
  if (title) wrap.appendChild(h('div', { class: 'section-title' }, title));
  wrap.appendChild(h('div', { class: 'section' }, children));
  return wrap;
}

export function row(children, opts = {}) {
  return h('div', { class: `row${opts.link ? ' row-link' : ''}`, onclick: opts.onclick }, children);
}

export function divider() { return h('div', { class: 'divider' }); }

// ---------------------------------------------------------------------------
// Модалка/шит
// ---------------------------------------------------------------------------
let modalStack = [];

export function openModal({ title, build, onClose }) {
  const overlay = h('div', { class: 'modal-overlay' });
  const sheet = h('div', { class: 'modal-sheet' });
  const header = h('div', { class: 'modal-header' }, [
    h('button', { class: 'icon-btn', onclick: () => closeModal() }, icon('close')),
    h('h2', {}, title || ''),
    h('span', { style: 'width:36px' }),
  ]);
  const body = h('div', { class: 'modal-body' });
  sheet.appendChild(header);
  sheet.appendChild(body);
  overlay.appendChild(sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  modalStack.push({ overlay, onClose });
  const api = {
    body,
    setTitle: (t) => { header.querySelector('h2').textContent = t; },
    close: () => closeModal(),
  };
  build(api);
  return api;
}

export function closeModal() {
  const top = modalStack.pop();
  if (!top) return;
  if (top.onClose) top.onClose();
  top.overlay.remove();
}

export function closeAllModals() {
  while (modalStack.length) closeModal();
}

// ---------------------------------------------------------------------------
// Боковое меню-шторка (гамбургер) — общая навигация по разделам приложения.
// Пока сосуществует с нижним таб-баром (см. app.js): это предпросмотр нового
// стиля навигации на экране «Главная», таб-бар оставлен рабочим, чтобы можно
// было попасть на остальные, ещё не переоформленные экраны.
// ---------------------------------------------------------------------------
const NAV_SECTIONS = [
  { id: 'home', label: 'Главная', icon: 'home' },
  { id: 'clients', label: 'Клиенты', icon: 'clients' },
  { id: 'products', label: 'Товары', icon: 'products' },
  { id: 'purchases', label: 'Закупка', icon: 'purchases' },
  { id: 'stats', label: 'Статистика', icon: 'stats' },
  { id: 'settings', label: 'Настройки', icon: 'settings' },
];

export function openNavDrawer(activeId) {
  const overlay = h('div', { class: 'drawer-overlay' });
  const panel = h('div', { class: 'drawer-panel' });
  NAV_SECTIONS.forEach((item) => {
    const btn = h('button', {
      class: `drawer-item${item.id === activeId ? ' active' : ''}`,
      onclick: () => { close(); navigate(item.id); },
    }, [icon(item.icon), h('span', {}, item.label)]);
    panel.appendChild(btn);
  });
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  function close() { overlay.remove(); }
  document.body.appendChild(overlay);
}

// Маленькое меню действий снизу (аналог "..." в шапке) — переиспользует
// стили модалки-шита, чтобы не плодить лишний CSS.
export function openActionMenu(items) {
  const overlay = h('div', { class: 'modal-overlay' });
  const sheet = h('div', { class: 'modal-sheet' });
  const body = h('div', { class: 'modal-body' });
  items.forEach((item) => {
    const btn = h('button', {
      class: 'btn btn-secondary',
      style: 'margin-bottom:10px',
      onclick: () => { close(); item.onClick(); },
    }, item.label);
    body.appendChild(btn);
  });
  sheet.appendChild(body);
  overlay.appendChild(sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  function close() { overlay.remove(); }
  document.body.appendChild(overlay);
}

export function showToast(message) {
  const t = h('div', { class: 'toast' }, message);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ---------------------------------------------------------------------------
// Числовой калькулятор поверх текстового поля (аналог CalculatorField.swift)
// ---------------------------------------------------------------------------
export function calculatorInput({ value = '', placeholder = '0', label = '', onChange, width = '90px' }) {
  // Раньше это был <input readonly inputmode="none">. На iOS даже
  // readonly-поле остаётся выделяемым текстом — долгий тап/небольшой
  // сдвиг пальца при тапе запускал системное выделение с лупой, которое
  // перехватывало жесты и сбивало нажатия по цифрам калькулятора ниже
  // (нажимаешь "9" — срабатывает "6" и т.п.), а сам экран визуально
  // "прыгал". Обычный <div> с ролью кнопки никогда не участвует в
  // нативном выделении/лупе/аксессуарной панели клавиатуры — проблема
  // устранена на уровне разметки, а не попыткой заглушить её через CSS.
  let current = value;
  const field = h('div', {
    class: 'calc-field',
    role: 'button',
    tabindex: '0',
    style: `width:${width}`,
  });
  const paint = () => {
    const empty = current === '' || current === null || current === undefined;
    field.textContent = empty ? placeholder : current;
    field.classList.toggle('calc-field-empty', empty);
  };
  paint();
  field.addEventListener('click', () => {
    openCalculatorPad({
      value: current,
      label,
      fieldEl: field,
      onChange: (v) => {
        current = v;
        paint();
        if (onChange) onChange(v);
      },
    });
  });
  return field;
}

// Короткий щелчок нажатия клавиши калькулятора — генерируется на лету
// через Web Audio API, без аудиофайлов (важно для офлайн-PWA). AudioContext
// создаётся один раз и переиспользуется; создание/resume происходит внутри
// обработчика клика (жест пользователя), как того требует iOS Safari.
let calcAudioCtx = null;
function playKeyClick() {
  try {
    if (!calcAudioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      calcAudioCtx = new Ctx();
    }
    if (calcAudioCtx.state === 'suspended') calcAudioCtx.resume();
    const now = calcAudioCtx.currentTime;
    const osc = calcAudioCtx.createOscillator();
    const gain = calcAudioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    osc.connect(gain);
    gain.connect(calcAudioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  } catch (e) {
    // Звук — не критичная функция, тихо игнорируем (например, если
    // Web Audio недоступен или заблокирован политикой автовоспроизведения).
  }
}

function openCalculatorPad({ value, label, fieldEl, onChange }) {
  const overlay = h('div', { class: 'calc-pad-overlay' });
  let current = value || '';

  // Большое поле-дисплей прямо над клавиатурой калькулятора — показывает
  // вводимое значение всегда, независимо от того, что сейчас закрыто самой
  // клавиатурой (клавиатура выезжает снизу и может перекрывать исходное
  // поле в форме). Раньше пользователь мог не видеть, что печатает — теперь
  // ввод виден прямо в самом калькуляторе.
  const display = h('div', { class: 'calc-pad-display' });
  const paintDisplay = () => {
    const empty = current === '' || current === null || current === undefined;
    display.textContent = empty ? '0' : current;
    display.classList.toggle('calc-pad-display-empty', empty);
  };

  const render = () => {
    paintDisplay();
    if (onChange) onChange(current);
  };

  const pressKey = (key) => {
    if (key === 'back') {
      current = current.slice(0, -1);
    } else if (key === '.') {
      if (!current.includes('.')) current = current === '' ? '0.' : current + '.';
    } else {
      if (current === '0') current = key;
      else current += key;
    }
    render();
  };

  const keys = ['1','2','3','4','5','6','7','8','9','.','0','back'];
  const grid = h('div', { class: 'calc-grid' });
  keys.forEach((k) => {
    const btn = h('button', {
      class: `calc-key${k === 'back' ? ' func' : ''}`,
      type: 'button',
      onclick: (e) => { e.preventDefault(); playKeyClick(); pressKey(k); },
    }, k === 'back' ? '⌫' : k);
    grid.appendChild(btn);
  });

  const doneBtn = h('button', { class: 'btn btn-primary', style: 'margin-top:8px', onclick: () => { playKeyClick(); close(); } }, 'Готово');

  paintDisplay();
  const pad = h('div', { class: 'calc-pad' }, [
    label ? h('div', { class: 'calc-pad-label' }, label) : null,
    display,
    grid,
    doneBtn,
  ]);
  overlay.appendChild(pad);

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Enter') close();
  }
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);

  // Доп. подстраховка: если исходное поле формы (за которым открыли
  // калькулятор) сейчас закрыто самой клавиатурой или уходит за верхний
  // край экрана — плавно подскроллить его в видимую область над клавиатурой.
  // Основной способ увидеть ввод — дисплей внутри калькулятора (above);
  // это лишь даёт заодно видеть контекст (остальные поля формы).
  if (fieldEl) {
    requestAnimationFrame(() => {
      try {
        const padRect = pad.getBoundingClientRect();
        const fieldRect = fieldEl.getBoundingClientRect();
        const visibleBottom = padRect.top;
        if (fieldRect.bottom > visibleBottom - 8 || fieldRect.top < 0) {
          const scrollParent = fieldEl.closest('.modal-body') || document.scrollingElement || document.documentElement;
          if (scrollParent) {
            const fieldCenter = fieldRect.top + fieldRect.height / 2;
            const desiredCenter = visibleBottom / 2;
            const delta = fieldCenter - desiredCenter;
            scrollParent.scrollTo({ top: scrollParent.scrollTop + delta, behavior: 'smooth' });
          }
        }
      } catch (e) {
        // Подстраховка не критична — молча пропускаем.
      }
    });
  }
}

export function confirmAction(message) {
  return Promise.resolve(window.confirm(message));
}
