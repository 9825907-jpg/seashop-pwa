// Карточка клиента: контакты, редактирование, история заказов, новый заказ.
import { DB } from '../db.js';
import { h, icon, clear, divider, openModal, showToast, confirmAction } from '../components.js';
import { navigate } from '../router.js';
import { formatCurrency, formatDate } from '../format.js';
import { orderTotal, amountPaidFromPayments, balanceDue, orderDisplayStatus, ORDER_STATUS_TITLES, orderItemsSummary, clientInitials } from '../logic.js';
import { openOrderForm } from './orderForm.js';

export async function render(container, clientId) {
  clear(container);
  const client = await DB.get('clients', clientId);
  if (!client) { container.appendChild(h('div', { class: 'empty-state' }, 'Клиент не найден')); return; }

  const [orders, allItems, allPayments] = await Promise.all([
    DB.getByIndex('orders', 'clientId', clientId),
    DB.getAll('orderItems'),
    DB.getAll('orderPayments'),
  ]);
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  container.appendChild(h('div', { class: 'topbar' }, [
    h('button', { class: 'icon-btn', onclick: () => navigate('clients') }, icon('back')),
    h('h1', { style: 'font-size:19px' }, client.name),
    h('button', { class: 'icon-btn', onclick: () => editClient() }, icon('edit')),
  ]));

  const infoSec = h('div', { class: 'section' }, [
    client.phone ? h('div', { class: 'row' }, [h('span', {}, 'Телефон'), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, client.phone)]) : null,
    h('div', { class: 'row' }, [h('span', {}, 'Заказов'), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, String(orders.length))]),
  ]);
  container.appendChild(infoSec);

  const newOrderBtn = h('button', { class: 'btn btn-primary' }, 'Новый заказ');
  newOrderBtn.addEventListener('click', () => openOrderForm({ presetClientId: clientId, onSaved: (id) => navigate('order', id) }));
  container.appendChild(newOrderBtn);

  container.appendChild(h('div', { class: 'section-title', style: 'margin-top:18px' }, 'История заказов'));
  if (orders.length === 0) {
    container.appendChild(h('div', { class: 'empty-state' }, 'Пока нет заказов'));
  } else {
    const sec = h('div', { class: 'section' });
    orders.forEach((o, idx) => {
      if (idx > 0) sec.appendChild(divider());
      const items = allItems.filter((i) => i.orderId === o.id);
      const payments = allPayments.filter((p) => p.orderId === o.id);
      const total = orderTotal(items);
      const amountPaid = amountPaidFromPayments(payments);
      const status = orderDisplayStatus(o, total, amountPaid);
      const row = h('div', { class: 'row row-link' }, [
        h('div', { style: 'flex:1' }, [h('div', { class: 'label' }, orderItemsSummary(items)), h('div', { class: 'sub' }, formatDate(o.createdAt))]),
        h('div', { style: 'text-align:right' }, [h('div', { class: 'bold' }, formatCurrency(total)), h('span', { class: `badge ${status}` }, ORDER_STATUS_TITLES[status])]),
      ]);
      row.addEventListener('click', () => navigate('order', o.id));
      sec.appendChild(row);
    });
    container.appendChild(sec);
  }

  const deleteBtn = h('button', { class: 'btn btn-danger', style: 'margin-top:18px' }, 'Удалить клиента');
  deleteBtn.addEventListener('click', async () => {
    if (orders.length > 0) { window.alert('У клиента есть заказы — сначала удалите их'); return; }
    if (!(await confirmAction('Удалить клиента?'))) return;
    await DB.delete('clients', clientId);
    navigate('clients');
  });
  container.appendChild(deleteBtn);

  function editClient() {
    openModal({
      title: 'Изменить клиента',
      build: (api) => {
        const nameInput = h('input', { type: 'text', class: 'field-full' }); nameInput.value = client.name;
        const phoneInput = h('input', { type: 'tel', class: 'field-full' }); phoneInput.value = client.phone || '';
        const sec = h('div', { class: 'section' }, [
          h('div', { style: 'padding:12px 16px' }, nameInput), divider(), h('div', { style: 'padding:12px 16px' }, phoneInput),
        ]);
        const saveBtn = h('button', { class: 'btn btn-primary', style: 'margin-top:14px' }, 'Сохранить');
        saveBtn.addEventListener('click', async () => {
          client.name = nameInput.value.trim() || client.name;
          client.phone = phoneInput.value.trim();
          await DB.put('clients', client);
          api.close();
          showToast('Сохранено');
          render(container, clientId);
        });
        api.body.appendChild(sec);
        api.body.appendChild(saveBtn);
      },
    });
  }
}
