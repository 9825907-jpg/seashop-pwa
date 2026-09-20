// Статистика: выручка, себестоимость и прибыль по выданным заказам —
// всего и за текущий месяц, плюс сводка по складу и долгам.
import { DB } from '../db.js';
import { h, icon, clear, divider, openNavDrawer, openActionMenu } from '../components.js';
import { navigate } from '../router.js';
import { formatCurrency } from '../format.js';
import { orderTotal, amountPaidFromPayments, balanceDue, actualCost, actualProfit, estimatedCost } from '../logic.js';

export async function render(container) {
  clear(container);
  container.appendChild(h('div', { class: 'appbar-brand' }, [
    h('button', { class: 'icon-btn-ghost', onclick: () => openNavDrawer('stats') }, icon('menu')),
    h('h1', {}, 'Статистика'),
    h('button', {
      class: 'icon-btn-ghost',
      onclick: () => openActionMenu([
        { label: 'Настройки', onClick: () => navigate('settings') },
      ]),
    }, icon('more')),
  ]));

  const [orders, items, payments, variants, purchases, purchaseItems, purchasePayments] = await Promise.all([
    DB.getAll('orders'), DB.getAll('orderItems'), DB.getAll('orderPayments'), DB.getAll('variants'),
    DB.getAll('purchases'), DB.getAll('purchaseItems'), DB.getAll('purchasePayments'),
  ]);
  const variantsById = Object.fromEntries(variants.map((v) => [v.id, v]));
  const lotConsAll = await DB.getAll('lotConsumptions');
  const lotConsByItem = {};
  lotConsAll.forEach((c) => { (lotConsByItem[c.orderItemId] = lotConsByItem[c.orderItemId] || []).push(c); });

  const fulfilled = orders.filter((o) => o.fulfilledAt);
  const now = new Date();
  const isThisMonth = (d) => { const dt = new Date(d); return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth(); };

  function summarize(list) {
    let revenue = 0, cost = 0;
    list.forEach((o) => {
      const oItems = items.filter((i) => i.orderId === o.id);
      revenue += orderTotal(oItems);
      oItems.forEach((i) => { cost += actualCost(i, variantsById[i.variantId], lotConsByItem[i.id]); });
    });
    return { revenue, cost, profit: revenue - cost, count: list.length };
  }

  const allTime = summarize(fulfilled);
  const thisMonth = summarize(fulfilled.filter((o) => isThisMonth(o.fulfilledAt)));

  container.appendChild(h('div', { class: 'section-title' }, 'За всё время'));
  container.appendChild(statBlock(allTime));
  container.appendChild(h('div', { class: 'section-title', style: 'margin-top:18px' }, 'За этот месяц'));
  container.appendChild(statBlock(thisMonth));

  const totalDebtOrders = orders.reduce((sum, o) => {
    const oItems = items.filter((i) => i.orderId === o.id);
    const oPayments = payments.filter((p) => p.orderId === o.id);
    return sum + balanceDue(orderTotal(oItems), amountPaidFromPayments(oPayments));
  }, 0);
  const totalDebtSuppliers = purchases.reduce((sum, p) => {
    const pItems = purchaseItems.filter((i) => i.purchaseId === p.id);
    const pPayments = purchasePayments.filter((pp) => pp.purchaseId === p.id);
    const total = pItems.reduce((s, i) => s + (i.isSoldByWeight ? (i.weight || 0) * i.unitPrice : i.quantity * i.unitPrice), 0);
    return sum + balanceDue(total, amountPaidFromPayments(pPayments));
  }, 0);

  container.appendChild(h('div', { class: 'section-title', style: 'margin-top:18px' }, 'Долги'));
  container.appendChild(h('div', { class: 'section' }, [
    h('div', { class: 'row' }, [h('span', {}, 'Нам должны клиенты'), h('span', { class: 'spacer' }), h('span', { class: 'bold text-warning' }, formatCurrency(totalDebtOrders))]),
    divider(),
    h('div', { class: 'row' }, [h('span', {}, 'Мы должны поставщикам'), h('span', { class: 'spacer' }), h('span', { class: 'bold text-warning' }, formatCurrency(totalDebtSuppliers))]),
  ]));

  const outOfStock = variants.filter((v) => v.stockQuantity <= 0).length;
  const lowStock = variants.filter((v) => v.stockQuantity > 0 && v.stockQuantity <= 3).length;
  container.appendChild(h('div', { class: 'section-title', style: 'margin-top:18px' }, 'Склад'));
  container.appendChild(h('div', { class: 'section' }, [
    h('div', { class: 'row' }, [h('span', {}, 'Закончились'), h('span', { class: 'spacer' }), h('span', { class: 'bold text-danger' }, String(outOfStock))]),
    divider(),
    h('div', { class: 'row' }, [h('span', {}, 'Заканчиваются'), h('span', { class: 'spacer' }), h('span', { class: 'bold text-warning' }, String(lowStock))]),
  ]));
}

function statBlock(s) {
  return h('div', { class: 'section' }, [
    h('div', { class: 'row' }, [h('span', {}, 'Выручка'), h('span', { class: 'spacer' }), h('span', { class: 'bold' }, formatCurrency(s.revenue))]),
    divider(),
    h('div', { class: 'row' }, [h('span', {}, 'Себестоимость'), h('span', { class: 'spacer' }), h('span', {}, formatCurrency(s.cost))]),
    divider(),
    h('div', { class: 'row' }, [h('span', {}, 'Прибыль'), h('span', { class: 'spacer' }), h('span', { class: 'bold text-success' }, formatCurrency(s.profit))]),
    divider(),
    h('div', { class: 'row' }, [h('span', {}, 'Заказов выдано'), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, String(s.count))]),
  ]);
}
