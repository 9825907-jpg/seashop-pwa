// Общий "пикер" позиции для заказа и закупки — выбор товара/фасовки и ввод
// количества/веса/цены через калькулятор (аналог OrderProductPickerSheet /
// PurchaseProductPickerSheet в нативном приложении). Возвращает промис со
// списком добавленных за сессию позиций.
import { DB } from '../db.js';
import { h, icon, openModal, calculatorInput, divider } from '../components.js';
import { formatQuantity, formatCurrency, normalizedDouble } from '../format.js';
import { categoryTitle, variantStockDisplayText } from '../logic.js';

export async function pickItems({ mode = 'order', title = 'Добавить товар' } = {}) {
  const [products, variants] = await Promise.all([DB.getAll('products'), DB.getAll('variants')]);
  const variantsByProduct = {};
  variants.forEach((v) => { (variantsByProduct[v.productId] = variantsByProduct[v.productId] || []).push(v); });
  products.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const added = [];
  let searchValue = '';

  return new Promise((resolve) => {
    const modal = openModal({ title, onClose: () => resolve(added), build: (api) => showMain(api) });

    function showMain(api) {
      api.setTitle(title);
      api.body.innerHTML = '';

      const search = h('input', { type: 'text', class: 'field-full', placeholder: 'Поиск товара' });
      search.value = searchValue;
      const searchBar = h('div', { class: 'search-bar' }, [icon('search'), search]);
      const addedBox = h('div');
      const list = h('div');
      api.body.appendChild(searchBar);
      api.body.appendChild(addedBox);
      api.body.appendChild(list);

      function renderAdded() {
        addedBox.innerHTML = '';
        if (added.length === 0) return;
        addedBox.appendChild(h('div', { class: 'section-title' }, `Добавлено: ${added.length}`));
        const sec = h('div', { class: 'section' });
        added.forEach((it, idx) => {
          if (idx > 0) sec.appendChild(divider());
          sec.appendChild(h('div', { class: 'row' }, [
            h('div', { style: 'flex:1' }, [
              h('div', { class: 'label' }, it.productName),
              h('div', { class: 'sub' }, it.isSoldByWeight ? `${formatQuantity(it.weight || 0)} кг` : `${formatQuantity(it.quantity)} × ${formatCurrency(it.unitPrice)}`),
            ]),
            h('button', { class: 'icon-btn', onclick: () => { added.splice(idx, 1); renderAdded(); } }, icon('trash')),
          ]));
        });
        addedBox.appendChild(sec);
      }

      function renderList() {
        list.innerHTML = '';
        const f = searchValue.trim().toLowerCase();
        const filtered = products.filter((p) => !f || p.name.toLowerCase().includes(f));
        if (filtered.length === 0) {
          list.appendChild(h('div', { class: 'empty-state' }, 'Ничего не найдено'));
          return;
        }
        const sec = h('div', { class: 'section' });
        filtered.forEach((p, idx) => {
          if (idx > 0) sec.appendChild(divider());
          const vs = variantsByProduct[p.id] || [];
          sec.appendChild(h('div', { class: 'row row-link', onclick: () => onPickProduct(p, vs) }, [
            h('div', { style: 'flex:1' }, [
              h('div', { class: 'label' }, p.name),
              h('div', { class: 'sub' }, `${categoryTitle(p.category)} · ${vs.length} фасовк${vs.length === 1 ? 'a' : 'и'}`),
            ]),
            icon('chevron', 'chevron'),
          ]));
        });
        list.appendChild(sec);
      }

      search.addEventListener('input', () => { searchValue = search.value; renderList(); });
      renderAdded();
      renderList();

      function onPickProduct(product, vs) {
        if (vs.length === 0) { window.alert('У товара нет фасовок'); return; }
        if (vs.length === 1) { showConfig(api, product, vs[0]); return; }
        showVariantList(api, product, vs);
      }
    }

    function showVariantList(api, product, vs) {
      api.setTitle(product.name);
      api.body.innerHTML = '';
      api.body.appendChild(h('button', { class: 'btn-text', onclick: () => showMain(api) }, '← Назад'));
      const sec = h('div', { class: 'section', style: 'margin-top:10px' });
      vs.forEach((v, idx) => {
        if (idx > 0) sec.appendChild(divider());
        sec.appendChild(h('div', { class: 'row row-link', onclick: () => showConfig(api, product, v) }, [
          h('div', { style: 'flex:1' }, [
            h('div', { class: 'label' }, v.label),
            h('div', { class: 'sub' }, variantStockDisplayText(v)),
          ]),
          h('div', { class: 'bold' }, formatCurrency(mode === 'order' ? v.pricePerUnit : v.costPrice)),
        ]));
      });
      api.body.appendChild(sec);
    }

    function showConfig(api, product, variant) {
      api.setTitle(product.name);
      api.body.innerHTML = '';
      let quantityText = '';
      let weightText = '';
      let isSoldByWeight = variant.isSoldByWeight;
      const defaultPrice = mode === 'order' ? variant.pricePerUnit : (variant.costPrice || variant.pricePerUnit);
      let priceText = formatQuantity(defaultPrice);

      const subtotalEl = h('div', { class: 'bold' }, '0 ₽');
      const updateSubtotal = () => {
        const q = normalizedDouble(quantityText);
        const w = normalizedDouble(weightText);
        const price = normalizedDouble(priceText);
        subtotalEl.textContent = formatCurrency(isSoldByWeight ? w * price : q * price);
      };

      const weightRowHolder = h('div');
      function renderWeightRow() {
        weightRowHolder.innerHTML = '';
        if (!isSoldByWeight) return;
        weightRowHolder.appendChild(divider());
        const wInput = calculatorInput({ value: weightText, label: `${product.name} — вес, кг`, onChange: (v) => { weightText = v; updateSubtotal(); } });
        weightRowHolder.appendChild(h('div', { class: 'row' }, [h('span', {}, 'Вес, кг'), h('span', { class: 'spacer' }), wInput]));
      }

      const qInput = calculatorInput({ value: quantityText, label: `${product.name} — количество`, onChange: (v) => { quantityText = v; updateSubtotal(); } });
      const pInput = calculatorInput({ value: priceText, label: `${product.name} — цена`, onChange: (v) => { priceText = v; updateSubtotal(); } });

      const sec = h('div', { class: 'section' }, [
        h('div', { class: 'row' }, [h('span', {}, `Количество, ${variant.unit}`), h('span', { class: 'spacer' }), qInput]),
        weightRowHolder,
        divider(),
        h('div', { class: 'row' }, [h('span', {}, mode === 'order' ? 'Цена' : 'Цена закупки'), h('span', { class: 'spacer' }), pInput, h('span', {}, '₽')]),
      ]);
      renderWeightRow();

      const toggleRow = mode === 'purchase' ? h('div', { class: 'row' }, [
        h('span', {}, 'Весовой товар в этой закупке'),
        h('span', { class: 'spacer' }),
        h('input', { type: 'checkbox', checked: isSoldByWeight, onchange: (e) => { isSoldByWeight = e.target.checked; renderWeightRow(); updateSubtotal(); } }),
      ]) : null;

      const summarySec = h('div', { class: 'section' }, [
        h('div', { class: 'row' }, [h('span', {}, 'Сумма'), h('span', { class: 'spacer' }), subtotalEl]),
      ]);

      const addBtn = h('button', { class: 'btn btn-primary', style: 'margin-top:14px' }, mode === 'order' ? 'Добавить в заказ' : 'Добавить в закупку');
      addBtn.addEventListener('click', () => {
        const q = normalizedDouble(quantityText);
        const w = isSoldByWeight ? normalizedDouble(weightText) : null;
        const price = normalizedDouble(priceText);
        if (q <= 0 && !(isSoldByWeight && w > 0)) { window.alert('Укажите количество'); return; }
        added.push({ variantId: variant.id, productName: product.name, unit: variant.unit, quantity: q, unitPrice: price, weight: w, isSoldByWeight });
        showMain(api);
      });

      api.body.appendChild(h('button', { class: 'btn-text', onclick: () => showMain(api) }, '← Назад'));
      api.body.appendChild(h('div', { style: 'height:10px' }));
      api.body.appendChild(sec);
      if (toggleRow) api.body.appendChild(toggleRow);
      api.body.appendChild(summarySec);
      api.body.appendChild(addBtn);
      updateSubtotal();
    }
  });
}
