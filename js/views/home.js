// Главный экран: новый заказ, доставки на сегодня, полный список заказов
// с поиском и фильтром по статусу (аналог HomeView + OrdersListView).
//
// Оформление обновлено по референсу пользователя (жёлтая шапка с гамбургером,
// ряд быстрых переходов иконками, секции с серым заголовком и карандашом).
// Пока это предпросмотр нового стиля только на «Главной» — нижний таб-бар
// (см. app.js) оставлен рабочим, чтобы не терять навигацию на остальных,
// ещё не переоформленных экранах.
import { DB } from '../db.js';
import { h, icon, clear, divider, openNavDrawer, openActionMenu } from '../components.js';
import { navigate } from '../router.js';
import { formatCurrency, formatDate, formatTime, isSameDay } from '../format.js';
import { orderTotal, amountPaidFromPayments, balanceDue, orderDisplayStatus, ORDER_STATUS_TITLES, orderItemsSummary, deliveryTimeRange } from '../logic.js';
import { openOrderForm } from './orderForm.js';

let searchValue = '';
let statusFilter = 'all';
let summaryPeriod = 'today'; // 'today' | 'month' — переключается карандашом в «Сводке»

export async function render(container) {
  clear(container);
  const [orders, clients, allItems, allPayments] = await Promise.all([
    DB.getAll('orders'),
    DB.getAll('clients'),
    DB.getAll('orderItems'),
    DB.getAll('orderPayments'),
  ]);
  const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const itemsByOrder = groupBy(allItems, 'orderId');
  const paymentsByOrder = groupBy(allPayments, 'orderId');

  const enriched = orders.map((o) => {
    const items = itemsByOrder[o.id] || [];
    const payments = paymentsByOrder[o.id] || [];
    const total = orderTotal(items);
    const amountPaid = amountPaidFromPayments(payments);
    return {
      order: o, items, payments, total, amountPaid,
      balanceDue: balanceDue(total, amountPaid),
      status: orderDisplayStatus(o, total, amountPaid),
      client: o.clientId ? clientsById[o.clientId] : null,
    };
  }).sort((a, b) => new Date(b.order.createdAt) - new Date(a.order.createdAt));

  const today = new Date();
  const todayDeliveries = enriched
    .filter((e) => e.order.deliveryDate && isSameDay(e.order.deliveryDate, today))
    .sort((a, b) => new Date(a.order.deliveryDate) - new Date(b.order.deliveryDate));

  // «Сводка» считается за выбранный период (сегодня/месяц) — по дате создания
  // заказа, переключается карандашом в заголовке секции.
  const isThisMonth = (d) => {
    const dt = new Date(d);
    return dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth();
  };
  const periodOrders = summaryPeriod === 'today'
    ? enriched.filter((e) => isSameDay(e.order.createdAt, today))
    : enriched.filter((e) => isThisMonth(e.order.createdAt));
  const periodSum = periodOrders.reduce((sum, e) => sum + e.total, 0);
  const periodPending = periodOrders.filter((e) => e.status === 'pendingPayment').length;
  const periodLabel = summaryPeriod === 'today' ? 'Сегодня' : 'За месяц';

  // ---- Жёлтая шапка: гамбургер (боковое меню) / заголовок / "..." ----
  container.appendChild(h('div', { class: 'appbar-brand' }, [
    h('button', { class: 'icon-btn-ghost', onclick: () => openNavDrawer('home') }, icon('menu')),
    h('h1', {}, 'Главная'),
    h('button', {
      class: 'icon-btn-ghost',
      onclick: () => openActionMenu([
        { label: 'Настройки', onClick: () => navigate('settings') },
      ]),
    }, icon('more')),
  ]));

  // ---- Ряд быстрых переходов по разделам ----
  container.appendChild(h('div', { class: 'quick-nav' }, [
    quickNavItem('clients', 'Клиенты', 'clients'),
    quickNavItem('products', 'Товары', 'products'),
    quickNavItem('purchases', 'Закупки', 'purchases'),
    quickNavItem('stats', 'Статистика', 'stats'),
  ]));

  const newOrderBtn = h('button', { class: 'card-btn' }, [
    h('div', { class: 'icon-badge' }, icon('plus')),
    h('div', {}, [h('strong', {}, 'Новый заказ'), h('div', { class: 'sub' }, 'Создать заказ для клиента')]),
  ]);
  newOrderBtn.addEventListener('click', () => openOrderForm({ onSaved: (id) => navigate('order', id) }));
  container.appendChild(newOrderBtn);

  // ---- Сводка (аналог блока "Остатки" на референсе) — карандаш переключает
  // период сегодня/месяц, числа пересчитываются по дате создания заказа.
  container.appendChild(sectionV2('Сводка', [
    summaryRow('orders', 'Заказов', String(periodOrders.length)),
    summaryRow('stats', 'Сумма заказов', formatCurrency(periodSum)),
    summaryRow('card', 'Ждут оплаты', String(periodPending), periodPending > 0 ? 'text-warning' : ''),
  ], {
    meta: periodLabel,
    onEdit: () => { summaryPeriod = summaryPeriod === 'today' ? 'month' : 'today'; render(container); },
  }));

  if (todayDeliveries.length > 0) {
    container.appendChild(sectionV2('Доставки сегодня', todayDeliveries.map(orderRow)));
  }

  const search = h('input', { type: 'text', placeholder: 'Поиск по клиенту или товару' });
  search.value = searchValue;

  const seg = h('div', { class: 'segmented' });
  const filters = [
    ['all', 'Все'],
    ['new', 'Новые'],
    ['pendingPayment', 'Ждут оплаты'],
    ['completed', 'Завершёны'],
  ];
  filters.forEach(([value, labelText]) => {
    const btn = h('button', { class: value === statusFilter ? 'active' : '' }, labelText);
    btn.addEventListener('click', () => { statusFilter = value; render(container); });
    seg.appendChild(btn);
  });

  container.appendChild(h('div', { class: 'section-title', style: 'margin-top:4px' }, 'Все заказы'));
  container.appendChild(h('div', { class: 'search-bar' }, [icon('search'), search]));
  container.appendChild(seg);

  const listBox = h('div');
  container.appendChild(listBox);

  function applyFilters() {
    const f = searchValue.trim().toLowerCase();
    return enriched.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (!f) return true;
      const clientName = e.client ? e.client.name.toLowerCase() : '';
      const productNames = e.items.map((i) => i.productName.toLowerCase()).join(' ');
      return clientName.includes(f) || productNames.includes(f);
    });
  }

  function renderList() {
    clear(listBox);
    const filtered = applyFilters();
    if (filtered.length === 0) {
      listBox.appendChild(h('div', { class: 'empty-state' }, 'Заказов нет'));
      return;
    }
    const sec = h('div', { class: 'section' });
    filtered.forEach((e, idx) => {
      if (idx > 0) sec.appendChild(divider());
      sec.appendChild(orderRow(e));
    });
    listBox.appendChild(sec);
  }

  search.addEventListener('input', () => { searchValue = search.value; renderList(); });
  renderList();
}

function quickNavItem(routeId, label, iconName) {
  return h('button', { class: 'quick-nav-item', onclick: () => navigate(routeId) }, [
    h('div', { class: 'badge-icon' }, icon(iconName)),
    h('span', {}, label),
  ]);
}

// Секция с серым заголовком (и опционально карандашом) в стиле референса —
// переиспользуется для «Сводки» и «Доставок сегодня».
function sectionV2(title, rows, opts = {}) {
  const wrap = h('div', { class: 'section-v2' });
  const head = h('div', { class: 'section-v2-head' }, [
    h('span', { class: 'title' }, title),
    h('div', { style: 'display:flex;align-items:center;gap:8px' }, [
      opts.meta ? h('span', { class: 'tiny muted' }, opts.meta) : null,
      opts.onEdit ? h('button', { class: 'icon-btn-ghost small', onclick: opts.onEdit }, icon('edit')) : null,
    ]),
  ]);
  wrap.appendChild(head);
  const body = h('div', { class: 'section-v2-body' });
  rows.forEach((r, idx) => { if (idx > 0) body.appendChild(divider()); body.appendChild(r); });
  wrap.appendChild(body);
  return wrap;
}

function summaryRow(iconName, label, value, valueClass = '') {
  return h('div', { class: 'row' }, [
    icon(iconName),
    h('span', { class: 'label', style: 'flex:1' }, label),
    h('span', { class: `bold ${valueClass}` }, value),
  ]);
}

function orderRow(e) {
  const row = h('div', { class: 'row row-link' }, [
    icon('orders'),
    h('div', { style: 'flex:1;min-width:0' }, [
      h('div', { class: 'label bold' }, e.client ? e.client.name : 'Без клиента'),
      h('div', { class: 'sub' }, orderItemsSummary(e.items)),
      e.order.deliveryDate ? h('div', { class: 'sub' }, `Доставка: ${formatDate(e.order.deliveryDate)}${deliveryLabel(e.order)}`) : null,
    ]),
    h('div', { style: 'text-align:right' }, [
      h('div', { class: 'bold' }, formatCurrency(e.total)),
      h('span', { class: `badge ${e.status}` }, ORDER_STATUS_TITLES[e.status]),
    ]),
  ]);
  row.addEventListener('click', () => navigate('order', e.order.id));
  return row;
}

function deliveryLabel(order) {
  const range = deliveryTimeRange(order);
  if (!range) return '';
  return `, ${formatTime(range.from)}–${formatTime(range.to)}`;
}

function groupBy(arr, key) {
  const out = {};
  arr.forEach((item) => { (out[item[key]] = out[item[key]] || []).push(item); });
  return out;
}
