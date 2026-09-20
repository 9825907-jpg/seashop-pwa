// Список закупок с поиском по поставщику.
import { DB } from '../db.js';
import { h, icon, clear, divider, openNavDrawer, openActionMenu } from '../components.js';
import { navigate } from '../router.js';
import { formatCurrency, formatDate } from '../format.js';
import { purchaseTotal, amountPaidFromPayments, purchaseItemsSummary } from '../logic.js';
import { openPurchaseForm } from './purchaseForm.js';

let searchValue = '';

export async function render(container) {
  clear(container);
  const [purchases, allItems, allPayments] = await Promise.all([
    DB.getAll('purchases'), DB.getAll('purchaseItems'), DB.getAll('purchasePayments'),
  ]);
  purchases.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  container.appendChild(h('div', { class: 'appbar-brand' }, [
    h('button', { class: 'icon-btn-ghost', onclick: () => openNavDrawer('purchases') }, icon('menu')),
    h('h1', {}, 'Закупка'),
    h('button', {
      class: 'icon-btn-ghost',
      onclick: () => openActionMenu([
        { label: 'Настройки', onClick: () => navigate('settings') },
      ]),
    }, icon('more')),
  ]));
  container.appendChild(h('button', { class: 'fab', onclick: () => openPurchaseForm({ onSaved: (id) => navigate('purchase', id) }) }, icon('plus')));

  const search = h('input', { type: 'text', placeholder: 'Поиск по поставщику' });
  search.value = searchValue;
  container.appendChild(h('div', { class: 'search-bar' }, [icon('search'), search]));

  const listBox = h('div');
  container.appendChild(listBox);

  function renderList() {
    clear(listBox);
    const f = searchValue.trim().toLowerCase();
    const filtered = purchases.filter((p) => !f || (p.supplierName || '').toLowerCase().includes(f));
    if (filtered.length === 0) { listBox.appendChild(h('div', { class: 'empty-state' }, 'Закупок нет')); return; }
    const sec = h('div', { class: 'section' });
    filtered.forEach((p, idx) => {
      if (idx > 0) sec.appendChild(divider());
      const items = allItems.filter((i) => i.purchaseId === p.id);
      const payments = allPayments.filter((pp) => pp.purchaseId === p.id);
      const total = purchaseTotal(items);
      const amountPaid = amountPaidFromPayments(payments);
      const row = h('div', { class: 'row row-link' }, [
        h('div', { style: 'flex:1' }, [
          h('div', { class: 'label bold' }, p.supplierName || 'Без поставщика'),
          h('div', { class: 'sub' }, purchaseItemsSummary(items)),
          h('div', { class: 'sub' }, formatDate(p.createdAt)),
        ]),
        h('div', { style: 'text-align:right' }, [
          h('div', { class: 'bold' }, formatCurrency(total)),
          h('span', { class: `badge ${p.receivedAt ? 'completed' : 'new'}` }, p.receivedAt ? 'Принята' : 'Ожидается'),
        ]),
      ]);
      row.addEventListener('click', () => navigate('purchase', p.id));
      sec.appendChild(row);
    });
    listBox.appendChild(sec);
  }
  search.addEventListener('input', () => { searchValue = search.value; renderList(); });
  renderList();
}
