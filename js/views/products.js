// Список товаров с поиском, остатком и быстрым переходом к приходу (ReceiveStockView).
import { DB } from '../db.js';
import { h, icon, clear, divider, openModal, showToast, calculatorInput, openNavDrawer, openActionMenu } from '../components.js';
import { navigate } from '../router.js';
import { formatQuantity, formatCurrency, normalizedDouble } from '../format.js';
import { categoryTitle, variantStockLevel, variantStockDisplayText, receiveStockDirect } from '../logic.js';
import { openProductForm } from './productForm.js';

let searchValue = '';

export async function render(container) {
  clear(container);
  const [products, variants] = await Promise.all([DB.getAll('products'), DB.getAll('variants')]);
  products.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const variantsByProduct = {};
  variants.forEach((v) => { (variantsByProduct[v.productId] = variantsByProduct[v.productId] || []).push(v); });

  container.appendChild(h('div', { class: 'appbar-brand' }, [
    h('button', { class: 'icon-btn-ghost', onclick: () => openNavDrawer('products') }, icon('menu')),
    h('h1', {}, 'Товары'),
    h('button', {
      class: 'icon-btn-ghost',
      onclick: () => openActionMenu([
        { label: 'Настройки', onClick: () => navigate('settings') },
      ]),
    }, icon('more')),
  ]));
  container.appendChild(h('button', { class: 'fab', onclick: () => openProductForm({ onSaved: () => render(container) }) }, icon('plus')));

  const search = h('input', { type: 'text', placeholder: 'Поиск товара' });
  search.value = searchValue;
  container.appendChild(h('div', { class: 'search-bar' }, [icon('search'), search]));

  const listBox = h('div');
  container.appendChild(listBox);

  function renderList() {
    clear(listBox);
    const f = searchValue.trim().toLowerCase();
    const filtered = products.filter((p) => !f || p.name.toLowerCase().includes(f));
    if (filtered.length === 0) { listBox.appendChild(h('div', { class: 'empty-state' }, 'Товаров нет')); return; }
    const sec = h('div', { class: 'section' });
    filtered.forEach((p, idx) => {
      if (idx > 0) sec.appendChild(divider());
      const vs = variantsByProduct[p.id] || [];
      const worstLevel = vs.some((v) => variantStockLevel(v) === 'out') ? 'out' : (vs.some((v) => variantStockLevel(v) === 'low') ? 'low' : 'inStock');
      const row = h('div', { class: 'row row-link' }, [
        h('div', { style: 'flex:1' }, [
          h('div', { class: 'label' }, p.name),
          h('div', { class: 'sub' }, `${categoryTitle(p.category)} · ${vs.length} фасовк${vs.length === 1 ? 'a' : 'и'}`),
        ]),
        h('span', { class: `badge ${worstLevel}` }, worstLevel === 'out' ? 'Нет' : worstLevel === 'low' ? 'Мало' : 'В наличии'),
        icon('chevron', 'chevron'),
      ]);
      row.addEventListener('click', () => openProductForm({ productId: p.id, onSaved: () => render(container) }));
      sec.appendChild(row);
    });
    listBox.appendChild(sec);
  }
  search.addEventListener('input', () => { searchValue = search.value; renderList(); });
  renderList();
}
