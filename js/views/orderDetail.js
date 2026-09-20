// Детали заказа: состав, оплаты, статус, действия — завершить выдачу
// (со сверкой склада и переносом переплаты), оплатить, редактировать,
// поделиться, отменить выдачу, удалить. Порт OrderDetailView + CompleteOrderView.
import { DB } from '../db.js';
import { h, icon, clear, divider, openModal, showToast, confirmAction, calculatorInput } from '../components.js';
import { navigate } from '../router.js';
import { formatCurrency, formatDate, formatTime, formatQuantity, normalizedDouble } from '../format.js';
import {
  loadOrderFull, ORDER_STATUS_TITLES, orderShareText, estimatedProfit, actualProfit,
  pendingWeightItems, computeStockShortfalls, completeOrder, cancelFulfillment,
  deleteOrderAndRestock, clientCredit, newOrderPayment, orderItemSubtotal,
} from '../logic.js';
import { openOrderForm } from './orderForm.js';

export async function render(container, orderId) {
  clear(container);
  const full = await loadOrderFull(orderId);
  if (!full) {
    container.appendChild(h('div', { class: 'empty-state' }, 'Заказ не найден'));
    return;
  }
  const { order, client, items, payments, total, amountPaid, balanceDue: due, status } = full;

  const variants = await Promise.all(items.map((i) => (i.variantId ? DB.get('variants', i.variantId) : Promise.resolve(null))));
  const lotConsByItem = {};
  await Promise.all(items.map(async (i, idx) => {
    lotConsByItem[i.id] = await DB.getByIndex('lotConsumptions', 'orderItemId', i.id);
  }));

  container.appendChild(h('div', { class: 'topbar' }, [
    h('button', { class: 'icon-btn', onclick: () => navigate('home') }, icon('back')),
    h('h1', { style: 'font-size:19px' }, client ? client.name : 'Заказ'),
    h('button', { class: 'icon-btn', onclick: () => shareOrder() }, icon('share')),
  ]));

  const headerSec = h('div', { class: 'section' }, [
    h('div', { class: 'row' }, [h('span', {}, 'Статус'), h('span', { class: 'spacer' }), h('span', { class: `badge ${status}` }, ORDER_STATUS_TITLES[status])]),
    divider(),
    h('div', { class: 'row' }, [h('span', {}, 'Создан'), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, formatDate(order.createdAt))]),
    order.deliveryDate ? divider() : null,
    order.deliveryDate ? h('div', { class: 'row' }, [h('span', {}, 'Доставка'), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, formatDate(order.deliveryDate))]) : null,
  ]);
  container.appendChild(headerSec);

  container.appendChild(h('div', { class: 'section-title' }, 'Товары'));
  const itemsSec = h('div', { class: 'section' });
  items.forEach((it, idx) => {
    if (idx > 0) itemsSec.appendChild(divider());
    const variant = variants[idx];
    const profit = order.fulfilledAt ? actualProfit(it, variant, lotConsByItem[it.id]) : estimatedProfit(it, variant);
    itemsSec.appendChild(h('div', { class: 'row' }, [
      h('div', { style: 'flex:1' }, [
        h('div', { class: 'label' }, it.productName),
        h('div', { class: 'sub' }, it.isSoldByWeight ? `${formatQuantity(it.weight || 0)} кг × ${formatCurrency(it.unitPrice)}` : `${formatQuantity(it.quantity)} × ${formatCurrency(it.unitPrice)}`),
      ]),
      h('div', { style: 'text-align:right' }, [
        h('div', { class: 'bold' }, formatCurrency(orderItemSubtotal(it))),
        h('div', { class: 'tiny text-success' }, `+${formatCurrency(profit)}`),
      ]),
    ]));
  });
  container.appendChild(itemsSec);

  container.appendChild(h('div', { class: 'section-title' }, 'Оплата'));
  const paySec = h('div', { class: 'section' });
  paySec.appendChild(h('div', { class: 'row' }, [h('span', {}, 'Итого'), h('span', { class: 'spacer' }), h('span', { class: 'bold' }, formatCurrency(total))]));
  paySec.appendChild(divider());
  paySec.appendChild(h('div', { class: 'row' }, [h('span', {}, 'Оплачено'), h('span', { class: 'spacer' }), h('span', {}, formatCurrency(amountPaid))]));
  if (due > 0) {
    paySec.appendChild(divider());
    paySec.appendChild(h('div', { class: 'row' }, [h('span', {}, 'Остаток'), h('span', { class: 'spacer' }), h('span', { class: 'bold text-warning' }, formatCurrency(due))]));
  }
  payments.forEach((p) => {
    paySec.appendChild(divider());
    paySec.appendChild(h('div', { class: 'row' }, [
      h('div', { style: 'flex:1' }, [
        h('div', { class: 'sub' }, formatDate(p.date)),
        p.note ? h('div', { class: 'tiny muted' }, p.note) : null,
      ]),
      h('span', { class: p.amount < 0 ? 'text-danger' : '' }, formatCurrency(p.amount)),
    ]));
  });
  container.appendChild(paySec);

  if (order.comment) {
    container.appendChild(h('div', { class: 'section-title' }, 'Комментарий'));
    container.appendChild(h('div', { class: 'section' }, [h('div', { class: 'row' }, [h('span', {}, order.comment)])]));
  }

  const actions = h('div', { style: 'display:flex;flex-direction:column;gap:10px;margin-top:6px' });
  if (!order.fulfilledAt) {
    const completeBtn = h('button', { class: 'btn btn-primary' }, 'Завершить выдачу');
    completeBtn.addEventListener('click', () => openCompleteFlow(full));
    actions.appendChild(completeBtn);
    const editBtn = h('button', { class: 'btn btn-secondary' }, 'Изменить заказ');
    editBtn.addEventListener('click', () => openOrderForm({ orderId, onSaved: () => render(container, orderId) }));
    actions.appendChild(editBtn);
  } else {
    if (due > 0) {
      const payBtn = h('button', { class: 'btn btn-primary' }, 'Внести оплату');
      payBtn.addEventListener('click', () => openAddPayment());
      actions.appendChild(payBtn);
    }
    const cancelBtn = h('button', { class: 'btn btn-secondary' }, 'Отменить выдачу');
    cancelBtn.addEventListener('click', async () => {
      if (!(await confirmAction('Отменить выдачу? Склад и платежи по выдаче вернутся.'))) return;
      await cancelFulfillment(orderId);
      showToast('Выдача отменена');
      render(container, orderId);
    });
    actions.appendChild(cancelBtn);
  }
  const deleteBtn = h('button', { class: 'btn btn-danger' }, 'Удалить заказ');
  deleteBtn.addEventListener('click', async () => {
    if (!(await confirmAction('Удалить заказ безвозвратно?'))) return;
    await deleteOrderAndRestock(orderId);
    showToast('Заказ удалён');
    navigate('home');
  });
  actions.appendChild(deleteBtn);
  container.appendChild(actions);

  function shareOrder() {
    const text = orderShareText({ order, client, items, payments });
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text);
      showToast('Текст скопирован');
    }
  }

  function openAddPayment() {
    openModal({
      title: 'Оплата',
      build: async (api) => {
        const credit = await clientCredit(order.clientId, order.id);
        let amountText = formatQuantity(due);
        const amountInput = calculatorInput({ value: amountText, label: 'Сумма оплаты', onChange: (v) => { amountText = v; } });
        const body = [];
        if (credit > 0) {
          body.push(h('div', { class: 'section' }, [h('div', { class: 'row' }, [
            h('div', { style: 'flex:1' }, [
              h('div', { class: 'sub' }, `У клиента переплата ${formatCurrency(credit)} по другим заказам. Она учтётся автоматически, если останется долг после этой оплаты.`),
            ]),
          ])]));
        }
        body.push(h('div', { class: 'section' }, [
          h('div', { class: 'row' }, [h('span', {}, 'Сумма'), h('span', { class: 'spacer' }), amountInput, h('span', {}, '₽')]),
        ]));
        const saveBtn = h('button', { class: 'btn btn-primary' }, 'Сохранить');
        saveBtn.addEventListener('click', async () => {
          const amount = normalizedDouble(amountText);
          if (amount <= 0) return;
          await DB.add('orderPayments', newOrderPayment({ orderId, amount, date: new Date().toISOString() }));
          api.close();
          showToast('Оплата добавлена');
          render(container, orderId);
        });
        body.push(saveBtn);
        body.forEach((n) => api.body.appendChild(n));
      },
    });
  }

  async function openCompleteFlow(fullOrder) {
    const pending = pendingWeightItems(fullOrder.items);
    const shortfalls = await computeStockShortfalls(orderId);
    const weightValues = {};
    pending.forEach((i) => { weightValues[i.id] = ''; });

    openModal({
      title: 'Завершить выдачу',
      build: async (api) => {
        const credit = await clientCredit(fullOrder.order.clientId, fullOrder.order.id);
        let amountText = formatQuantity(fullOrder.balanceDue);
        const nodes = [];

        if (shortfalls.length > 0) {
          nodes.push(h('div', { class: 'section' }, shortfalls.map((s, idx) => h('div', {}, [
            idx > 0 ? divider() : null,
            h('div', { class: 'row' }, [h('span', { class: 'text-danger' }, `Нехватка на складе: ${s.variant.label}`)]),
          ]))));
          nodes.push(h('p', { class: 'tiny muted', style: 'padding:0 4px' }, 'Недостаточно товара на складе для завершения этого заказа. Пополните склад через закупку.'));
        }

        if (pending.length > 0) {
          nodes.push(h('div', { class: 'section-title' }, 'Укажите фактический вес'));
          const sec = h('div', { class: 'section' });
          pending.forEach((it, idx) => {
            if (idx > 0) sec.appendChild(divider());
            const wInput = calculatorInput({ value: '', label: `${it.productName} — вес, кг`, onChange: (v) => { weightValues[it.id] = v; } });
            sec.appendChild(h('div', { class: 'row' }, [h('span', {}, it.productName), h('span', { class: 'spacer' }), wInput, h('span', {}, 'кг')]));
          });
          nodes.push(sec);
        }

        if (credit > 0) {
          nodes.push(h('div', { class: 'section' }, [h('div', { class: 'row' }, [h('div', {}, `Переплата клиента ${formatCurrency(credit)} автоматически учтётся, если её не хватит оплатой ниже.`)])]));
        }

        const amountInput = calculatorInput({ value: amountText, label: 'Сумма оплаты при выдаче', onChange: (v) => { amountText = v; } });
        nodes.push(h('div', { class: 'section' }, [h('div', { class: 'row' }, [h('span', {}, 'Оплачено при выдаче'), h('span', { class: 'spacer' }), amountInput, h('span', {}, '₽')])]));

        const canComplete = shortfalls.length === 0;
        const confirmBtn = h('button', { class: 'btn btn-primary' }, 'Подтвердить выдачу');
        confirmBtn.disabled = !canComplete;
        confirmBtn.addEventListener('click', async () => {
          const missingWeight = pending.some((i) => normalizedDouble(weightValues[i.id]) <= 0);
          if (missingWeight) { window.alert('Укажите вес для всех весовых позиций'); return; }
          const itemWeights = {};
          Object.entries(weightValues).forEach(([id, v]) => { itemWeights[id] = normalizedDouble(v); });
          await completeOrder(orderId, { amount: normalizedDouble(amountText), date: new Date().toISOString(), itemWeights });
          api.close();
          showToast('Заказ выдан');
          render(container, orderId);
        });
        nodes.push(confirmBtn);
        nodes.forEach((n) => api.body.appendChild(n));
      },
    });
  }
}
