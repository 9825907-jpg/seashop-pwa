// Детали закупки: состав, оплаты, проведение прихода (с уточнением
// количества/веса), отмена прихода, оплата поставщику, удаление.
import { DB } from '../db.js';
import { h, icon, clear, divider, openModal, showToast, confirmAction, calculatorInput } from '../components.js';
import { navigate } from '../router.js';
import { formatCurrency, formatDate, formatQuantity, normalizedDouble } from '../format.js';
import {
  loadPurchaseFull, purchaseShareText, purchaseItemSubtotal, receivePurchase, cancelReceipt,
  deletePurchaseAndRevertStock, supplierCredit, newPurchasePayment,
} from '../logic.js';
import { openPurchaseForm } from './purchaseForm.js';

export async function render(container, purchaseId) {
  clear(container);
  const full = await loadPurchaseFull(purchaseId);
  if (!full) { container.appendChild(h('div', { class: 'empty-state' }, 'Закупка не найдена')); return; }
  const { purchase, supplier, items, payments, total, amountPaid, balanceDue: due, isReceived } = full;

  container.appendChild(h('div', { class: 'topbar' }, [
    h('button', { class: 'icon-btn', onclick: () => navigate('purchases') }, icon('back')),
    h('h1', { style: 'font-size:19px' }, purchase.supplierName || 'Закупка'),
    h('button', { class: 'icon-btn', onclick: () => shareIt() }, icon('share')),
  ]));

  const headerSec = h('div', { class: 'section' }, [
    h('div', { class: 'row' }, [h('span', {}, 'Статус'), h('span', { class: 'spacer' }), h('span', { class: `badge ${isReceived ? 'completed' : 'new'}` }, isReceived ? 'Принята' : 'Ожидается')]),
    divider(),
    h('div', { class: 'row' }, [h('span', {}, 'Создана'), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, formatDate(purchase.createdAt))]),
  ]);
  container.appendChild(headerSec);

  container.appendChild(h('div', { class: 'section-title' }, 'Товары'));
  const itemsSec = h('div', { class: 'section' });
  items.forEach((it, idx) => {
    if (idx > 0) itemsSec.appendChild(divider());
    itemsSec.appendChild(h('div', { class: 'row' }, [
      h('div', { style: 'flex:1' }, [
        h('div', { class: 'label' }, it.productName),
        h('div', { class: 'sub' }, it.isSoldByWeight ? `${formatQuantity(it.weight || 0)} кг × ${formatCurrency(it.unitPrice)}` : `${formatQuantity(it.quantity)} × ${formatCurrency(it.unitPrice)}`),
      ]),
      h('div', { class: 'bold' }, formatCurrency(purchaseItemSubtotal(it))),
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
    paySec.appendChild(h('div', { class: 'row' }, [h('span', { class: 'sub' }, formatDate(p.date)), h('span', { class: 'spacer' }), h('span', {}, formatCurrency(p.amount))]));
  });
  container.appendChild(paySec);

  if (purchase.comment) {
    container.appendChild(h('div', { class: 'section-title' }, 'Комментарий'));
    container.appendChild(h('div', { class: 'section' }, [h('div', { class: 'row' }, [h('span', {}, purchase.comment)])]));
  }

  const actions = h('div', { style: 'display:flex;flex-direction:column;gap:10px;margin-top:6px' });
  if (!isReceived) {
    const receiveBtn = h('button', { class: 'btn btn-primary' }, 'Провести закупку');
    receiveBtn.addEventListener('click', () => openReceiveFlow());
    actions.appendChild(receiveBtn);
    const editBtn = h('button', { class: 'btn btn-secondary' }, 'Изменить закупку');
    editBtn.addEventListener('click', () => openPurchaseForm({ purchaseId, onSaved: () => render(container, purchaseId) }));
    actions.appendChild(editBtn);
  } else {
    if (due > 0) {
      const payBtn = h('button', { class: 'btn btn-primary' }, 'Оплатить поставщику');
      payBtn.addEventListener('click', () => openAddPayment());
      actions.appendChild(payBtn);
    }
    const cancelBtn = h('button', { class: 'btn btn-secondary' }, 'Отменить приход');
    cancelBtn.addEventListener('click', async () => {
      if (!(await confirmAction('Отменить приход? Склад будет уменьшен обратно.'))) return;
      await cancelReceipt(purchaseId);
      showToast('Приход отменён');
      render(container, purchaseId);
    });
    actions.appendChild(cancelBtn);
  }
  const deleteBtn = h('button', { class: 'btn btn-danger' }, 'Удалить закупку');
  deleteBtn.addEventListener('click', async () => {
    if (!(await confirmAction('Удалить закупку безвозвратно?'))) return;
    await deletePurchaseAndRevertStock(purchaseId);
    showToast('Закупка удалена');
    navigate('purchases');
  });
  actions.appendChild(deleteBtn);
  container.appendChild(actions);

  function shareIt() {
    const text = purchaseShareText({ purchase, items });
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else { navigator.clipboard?.writeText(text); showToast('Текст скопирован'); }
  }

  function openAddPayment() {
    openModal({
      title: 'Оплата поставщику',
      build: async (api) => {
        const credit = await supplierCredit(purchase.supplierId, purchase.id);
        let amountText = formatQuantity(due);
        const amountInput = calculatorInput({ value: amountText, label: 'Сумма оплаты', onChange: (v) => { amountText = v; } });
        const nodes = [];
        if (credit > 0) {
          nodes.push(h('div', { class: 'section' }, [h('div', { class: 'row' }, [h('div', {}, `Есть переплата ${formatCurrency(credit)} по другим закупкам этого поставщика`)])]));
        }
        nodes.push(h('div', { class: 'section' }, [h('div', { class: 'row' }, [h('span', {}, 'Сумма'), h('span', { class: 'spacer' }), amountInput, h('span', {}, '₽')])]));
        const saveBtn = h('button', { class: 'btn btn-primary' }, 'Сохранить');
        saveBtn.addEventListener('click', async () => {
          const amount = normalizedDouble(amountText);
          if (amount <= 0) return;
          await DB.add('purchasePayments', newPurchasePayment({ purchaseId, amount, date: new Date().toISOString() }));
          api.close();
          showToast('Оплата добавлена');
          render(container, purchaseId);
        });
        nodes.push(saveBtn);
        nodes.forEach((n) => api.body.appendChild(n));
      },
    });
  }

  function openReceiveFlow() {
    const receivedValues = {};
    items.forEach((it) => { receivedValues[it.id] = { quantity: it.quantity, weight: it.weight }; });

    openModal({
      title: 'Провести закупку',
      build: (api) => {
        api.body.appendChild(h('p', { class: 'tiny muted', style: 'padding:0 4px 8px' }, 'Сверьте с тем, что реально привезли'));
        const sec = h('div', { class: 'section' });
        items.forEach((it, idx) => {
          if (idx > 0) sec.appendChild(divider());
          const qInput = calculatorInput({
            value: formatQuantity(it.quantity), label: `${it.productName} — количество`,
            onChange: (v) => { receivedValues[it.id].quantity = normalizedDouble(v); }, width: '70px',
          });
          const rowChildren = [
            h('div', { style: 'flex:1' }, [h('div', { class: 'label' }, it.productName)]),
            h('span', { class: 'sub' }, it.unit), qInput,
          ];
          sec.appendChild(h('div', { class: 'row' }, rowChildren));
          if (it.isSoldByWeight) {
            const wInput = calculatorInput({
              value: it.weight ? formatQuantity(it.weight) : '', label: `${it.productName} — вес партии, кг`,
              onChange: (v) => { receivedValues[it.id].weight = normalizedDouble(v); }, width: '70px',
            });
            sec.appendChild(h('div', { class: 'row' }, [h('span', { class: 'sub' }, 'Вес партии, кг'), h('span', { class: 'spacer' }), wInput]));
          }
        });
        api.body.appendChild(sec);
        const confirmBtn = h('button', { class: 'btn btn-primary', style: 'margin-top:14px' }, 'Провести');
        confirmBtn.addEventListener('click', async () => {
          const invalid = items.some((it) => {
            const rv = receivedValues[it.id];
            if (!(rv.quantity > 0)) return true;
            if (it.isSoldByWeight && !(rv.weight > 0)) return true;
            return false;
          });
          if (invalid) { window.alert('Заполните количество и вес для всех позиций'); return; }
          await receivePurchase(purchaseId, receivedValues);
          api.close();
          showToast('Закупка проведена');
          render(container, purchaseId);
        });
        api.body.appendChild(confirmBtn);
      },
    });
  }
}
