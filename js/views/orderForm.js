// Создание/редактирование заказа: клиент, позиции (через itemPicker),
// доставка (дата/время), комментарий. Аналог NewOrderView/EditOrderView.
import { DB } from '../db.js';
import { h, icon, openModal, divider, showToast } from '../components.js';
import { formatQuantity, formatCurrency } from '../format.js';
import { newOrder, newOrderItem, orderTotal, orderItemSubtotal, loadOrderFull } from '../logic.js';
import { pickClient } from './pickers.js';
import { pickItems } from './itemPicker.js';

export async function openOrderForm({ orderId = null, presetClientId = null, onSaved } = {}) {
  let order = null;
  let client = null;
  let items = [];
  const isEditing = !!orderId;
  const isFulfilled = false;

  if (isEditing) {
    const full = await loadOrderFull(orderId);
    if (!full) { showToast('Заказ не найден'); return; }
    order = full.order;
    client = full.client;
    items = full.items.map((i) => ({ ...i, _existing: true }));
  } else {
    order = newOrder({ clientId: presetClientId || null });
    if (presetClientId) client = await DB.get('clients', presetClientId);
  }

  const locked = isEditing && !!order.fulfilledAt;

  openModal({
    title: isEditing ? 'Заказ' : 'Новый заказ',
    build: (api) => render(api),
  });

  function render(api) {
    api.body.innerHTML = '';

    const clientRow = h('div', { class: 'row row-link' }, [
      h('span', {}, 'Клиент'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted' }, client ? client.name : 'Без клиента'),
      icon('chevron', 'chevron'),
    ]);
    clientRow.addEventListener('click', async () => {
      const picked = await pickClient();
      if (picked) { client = picked; order.clientId = picked.id; render(api); }
    });
    const clientSection = h('div', { class: 'section' }, [clientRow]);

    const dateInput = h('input', { type: 'date', class: 'field-full' });
    dateInput.value = order.deliveryDate ? order.deliveryDate.slice(0, 10) : '';
    const fromInput = h('input', { type: 'time', class: 'field-input' });
    fromInput.value = order.deliveryTimeFrom ? new Date(order.deliveryTimeFrom).toTimeString().slice(0, 5) : '';
    const toInput = h('input', { type: 'time', class: 'field-input' });
    toInput.value = order.deliveryTimeTo ? new Date(order.deliveryTimeTo).toTimeString().slice(0, 5) : '';

    const deliverySection = h('div', { class: 'section' }, [
      h('div', { class: 'row' }, [h('span', {}, 'Дата доставки'), h('span', { class: 'spacer' }), dateInput]),
      divider(),
      h('div', { class: 'row' }, [h('span', {}, 'Время'), h('span', { class: 'spacer' }), fromInput, h('span', {}, '—'), toInput]),
    ]);

    const itemsSectionTitle = h('div', { class: 'section-title' }, 'Товары');
    const itemsSection = h('div', { class: 'section' });
    function renderItems() {
      itemsSection.innerHTML = '';
      if (items.length === 0) {
        itemsSection.appendChild(h('div', { class: 'empty-state tiny' }, 'Нет товаров'));
      }
      items.forEach((it, idx) => {
        if (idx > 0) itemsSection.appendChild(divider());
        itemsSection.appendChild(h('div', { class: 'row' }, [
          h('div', { style: 'flex:1' }, [
            h('div', { class: 'label' }, it.productName),
            h('div', { class: 'sub' }, it.isSoldByWeight ? `${formatQuantity(it.weight || 0)} кг × ${formatCurrency(it.unitPrice)}` : `${formatQuantity(it.quantity)} × ${formatCurrency(it.unitPrice)}`),
          ]),
          h('div', { class: 'bold' }, formatCurrency(orderItemSubtotal(it))),
          !locked ? h('button', { class: 'icon-btn', onclick: () => { items.splice(idx, 1); renderItems(); renderTotal(); } }, icon('trash')) : null,
        ]));
      });
    }
    const addItemsBtn = !locked ? h('button', { class: 'btn btn-secondary', style: 'margin-top:10px' }, [icon('plus'), ' Добавить товар']) : null;
    if (addItemsBtn) addItemsBtn.addEventListener('click', async () => {
      const picked = await pickItems({ mode: 'order' });
      items = items.concat(picked);
      renderItems();
      renderTotal();
    });

    const totalRow = h('div', { class: 'row' });
    const totalSection = h('div', { class: 'section' }, [totalRow]);
    function renderTotal() {
      totalRow.innerHTML = '';
      totalRow.appendChild(h('span', { class: 'bold' }, 'Итого'));
      totalRow.appendChild(h('span', { class: 'spacer' }));
      totalRow.appendChild(h('span', { class: 'bold' }, formatCurrency(orderTotal(items))));
    }

    const commentInput = h('textarea', { class: 'field-textarea', placeholder: 'Комментарий' });
    commentInput.value = order.comment || '';
    const commentSection = h('div', { class: 'section' }, [h('div', { style: 'padding:10px 16px' }, commentInput)]);

    const saveBtn = h('button', { class: 'btn btn-primary', style: 'margin-top:4px' }, 'Сохранить');
    saveBtn.addEventListener('click', async () => {
      if (items.length === 0) { window.alert('Добавьте хотя бы один товар'); return; }
      order.comment = commentInput.value.trim();
      order.deliveryDate = dateInput.value ? new Date(dateInput.value + 'T00:00:00').toISOString() : null;
      if (order.deliveryDate && fromInput.value) {
        const [h1, m1] = fromInput.value.split(':').map(Number);
        const d = new Date(order.deliveryDate); d.setHours(h1, m1, 0, 0);
        order.deliveryTimeFrom = d.toISOString();
      } else { order.deliveryTimeFrom = null; }
      if (order.deliveryDate && toInput.value) {
        const [h2, m2] = toInput.value.split(':').map(Number);
        const d = new Date(order.deliveryDate); d.setHours(h2, m2, 0, 0);
        order.deliveryTimeTo = d.toISOString();
      } else { order.deliveryTimeTo = null; }

      if (isEditing) {
        await DB.put('orders', order);
        if (!locked) {
          const existingIds = new Set(items.filter((i) => i._existing).map((i) => i.id));
          const original = (await DB.getByIndex('orderItems', 'orderId', order.id));
          for (const orig of original) if (!existingIds.has(orig.id)) await DB.delete('orderItems', orig.id);
          for (const it of items) {
            if (it._existing) {
              const { _existing, ...rest } = it;
              await DB.put('orderItems', rest);
            } else {
              await DB.add('orderItems', newOrderItem({ orderId: order.id, ...it }));
            }
          }
        }
      } else {
        await DB.add('orders', order);
        for (const it of items) await DB.add('orderItems', newOrderItem({ orderId: order.id, ...it }));
      }
      api.close();
      showToast('Заказ сохранён');
      if (onSaved) onSaved(order.id);
    });

    api.body.appendChild(clientSection);
    api.body.appendChild(deliverySection);
    api.body.appendChild(itemsSectionTitle);
    api.body.appendChild(itemsSection);
    if (addItemsBtn) api.body.appendChild(addItemsBtn);
    api.body.appendChild(h('div', { style: 'height:14px' }));
    api.body.appendChild(totalSection);
    api.body.appendChild(commentSection);
    api.body.appendChild(saveBtn);
    renderItems();
    renderTotal();
  }
}
