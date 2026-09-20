// Добавление/редактирование товара и его фасовок (аналог AddProductView).
import { DB } from '../db.js';
import { h, icon, openModal, divider, showToast, confirmAction, calculatorInput } from '../components.js';
import { formatQuantity, normalizedDouble } from '../format.js';
import { PRODUCT_CATEGORIES, newProduct, newVariant, variantStockDisplayText } from '../logic.js';

export async function openProductForm({ productId = null, onSaved } = {}) {
  let product = productId ? await DB.get('products', productId) : newProduct({ name: '' });
  let variants = productId ? await DB.getByIndex('variants', 'productId', productId) : [];
  variants = variants.map((v) => ({ ...v, _existing: true }));

  openModal({
    title: productId ? 'Товар' : 'Новый товар',
    build: (api) => render(api),
  });

  function render(api) {
    api.body.innerHTML = '';
    const nameInput = h('input', { type: 'text', class: 'field-full', placeholder: 'Название' });
    nameInput.value = product.name;
    const categorySelect = h('select', { class: 'field-select field-full' });
    PRODUCT_CATEGORIES.forEach((c) => {
      const opt = h('option', { value: c.value }, c.title);
      if (c.value === product.category) opt.selected = true;
      categorySelect.appendChild(opt);
    });

    const mainSec = h('div', { class: 'section' }, [
      h('div', { style: 'padding:12px 16px' }, nameInput), divider(), h('div', { style: 'padding:12px 16px' }, categorySelect),
    ]);

    const variantsSec = h('div', { class: 'section' });
    function renderVariants() {
      variantsSec.innerHTML = '';
      if (variants.length === 0) variantsSec.appendChild(h('div', { class: 'empty-state tiny' }, 'Нет фасовок'));
      variants.forEach((v, idx) => {
        if (idx > 0) variantsSec.appendChild(divider());
        const row = h('div', { class: 'row row-link' }, [
          h('div', { style: 'flex:1' }, [h('div', { class: 'label' }, v.label || 'Фасовка'), h('div', { class: 'sub' }, variantStockDisplayText(v))]),
          h('button', { class: 'icon-btn', onclick: (e) => { e.stopPropagation(); variants.splice(idx, 1); renderVariants(); } }, icon('trash')),
        ]);
        row.addEventListener('click', () => openVariantEditor(v, () => renderVariants()));
        variantsSec.appendChild(row);
      });
    }
    const addVariantBtn = h('button', { class: 'btn btn-secondary', style: 'margin-top:10px' }, [icon('plus'), ' Добавить фасовку']);
    addVariantBtn.addEventListener('click', () => {
      const v = { label: '', unit: 'шт', pricePerUnit: 0, costPrice: 0, stockQuantity: 0, isSoldByWeight: false, averageWeightPerUnit: 0, stockWeight: 0, packageWeightKg: 0 };
      variants.push(v);
      openVariantEditor(v, () => renderVariants());
    });

    const saveBtn = h('button', { class: 'btn btn-primary', style: 'margin-top:16px' }, 'Сохранить');
    saveBtn.addEventListener('click', async () => {
      product.name = nameInput.value.trim();
      product.category = categorySelect.value;
      if (!product.name) { window.alert('Укажите название'); return; }
      if (variants.length === 0) { window.alert('Добавьте хотя бы одну фасовку'); return; }
      if (productId) {
        await DB.put('products', product);
        const existingIds = new Set(variants.filter((v) => v._existing).map((v) => v.id));
        const original = await DB.getByIndex('variants', 'productId', productId);
        for (const orig of original) if (!existingIds.has(orig.id)) await DB.delete('variants', orig.id);
        for (const v of variants) {
          if (v._existing) { const { _existing, ...rest } = v; await DB.put('variants', rest); }
          else { const { _existing, ...rest } = v; await DB.add('variants', newVariant({ ...rest, productId })); }
        }
      } else {
        await DB.add('products', product);
        for (const v of variants) { const { _existing, ...rest } = v; await DB.add('variants', newVariant({ ...rest, productId: product.id })); }
      }
      api.close();
      showToast('Сохранено');
      if (onSaved) onSaved(product.id);
    });

    api.body.appendChild(mainSec);
    api.body.appendChild(h('div', { class: 'section-title', style: 'margin-top:16px' }, 'Фасовки'));
    api.body.appendChild(variantsSec);
    api.body.appendChild(addVariantBtn);
    if (productId) {
      const delBtn = h('button', { class: 'btn btn-danger', style: 'margin-top:16px' }, 'Удалить товар');
      delBtn.addEventListener('click', async () => {
        if (!(await confirmAction('Удалить товар и все его фасовки?'))) return;
        for (const v of variants) if (v._existing) await DB.delete('variants', v.id);
        await DB.delete('products', productId);
        api.close();
        showToast('Товар удалён');
        if (onSaved) onSaved(null);
      });
      api.body.appendChild(delBtn);
    }
    api.body.appendChild(saveBtn);
    renderVariants();
  }

  function openVariantEditor(variant, onDone) {
    openModal({
      title: variant.label || 'Фасовка',
      build: (api) => {
        const labelInput = h('input', { type: 'text', class: 'field-full', placeholder: 'Название фасовки (напр. 250 г)' });
        labelInput.value = variant.label || '';
        const unitInput = h('input', { type: 'text', class: 'field-full', placeholder: 'Единица (шт, кг)' });
        unitInput.value = variant.unit || 'шт';

        let priceText = formatQuantity(variant.pricePerUnit || 0);
        let costText = formatQuantity(variant.costPrice || 0);
        let stockText = formatQuantity(variant.stockQuantity || 0);
        let stockWeightText = formatQuantity(variant.stockWeight || 0);
        let packageWeightText = formatQuantity(variant.packageWeightKg || 0);
        let isSoldByWeight = !!variant.isSoldByWeight;

        const priceInput = calculatorInput({ value: priceText, label: 'Цена продажи', onChange: (v) => { priceText = v; } });
        const costInput = calculatorInput({ value: costText, label: 'Закупочная цена', onChange: (v) => { costText = v; } });
        const stockInput = calculatorInput({ value: stockText, label: 'Остаток, шт', onChange: (v) => { stockText = v; } });
        const stockWeightHolder = h('div');
        const packageWeightHolder = h('div');
        function renderWeightFields() {
          stockWeightHolder.innerHTML = '';
          packageWeightHolder.innerHTML = '';
          if (!isSoldByWeight) return;
          const swInput = calculatorInput({ value: stockWeightText, label: 'Остаток, кг', onChange: (v) => { stockWeightText = v; } });
          stockWeightHolder.appendChild(divider());
          stockWeightHolder.appendChild(h('div', { class: 'row' }, [h('span', {}, 'Остаток, кг'), h('span', { class: 'spacer' }), swInput]));
          const pwInput = calculatorInput({ value: packageWeightText, label: 'Вес упаковки, кг', onChange: (v) => { packageWeightText = v; } });
          packageWeightHolder.appendChild(divider());
          packageWeightHolder.appendChild(h('div', { class: 'row' }, [h('span', {}, 'Вес упаковки, кг'), h('span', { class: 'spacer' }), pwInput]));
        }

        const sec = h('div', { class: 'section' }, [
          h('div', { style: 'padding:12px 16px' }, labelInput), divider(), h('div', { style: 'padding:12px 16px' }, unitInput),
        ]);
        const weightToggleRow = h('div', { class: 'row' }, [
          h('span', {}, 'Продаётся на вес'),
          h('span', { class: 'spacer' }),
          h('input', { type: 'checkbox', checked: isSoldByWeight, onchange: (e) => { isSoldByWeight = e.target.checked; renderWeightFields(); } }),
        ]);
        const numbersSec = h('div', { class: 'section' }, [
          h('div', { class: 'row' }, [h('span', {}, 'Цена продажи'), h('span', { class: 'spacer' }), priceInput, h('span', {}, '₽')]),
          divider(),
          h('div', { class: 'row' }, [h('span', {}, 'Закупочная цена'), h('span', { class: 'spacer' }), costInput, h('span', {}, '₽')]),
          divider(),
          h('div', { class: 'row' }, [h('span', {}, 'Остаток, шт'), h('span', { class: 'spacer' }), stockInput]),
          stockWeightHolder,
          packageWeightHolder,
        ]);
        renderWeightFields();

        const saveBtn = h('button', { class: 'btn btn-primary', style: 'margin-top:14px' }, 'Готово');
        saveBtn.addEventListener('click', () => {
          variant.label = labelInput.value.trim() || unitInput.value.trim();
          variant.unit = unitInput.value.trim() || 'шт';
          variant.pricePerUnit = normalizedDouble(priceText);
          variant.costPrice = normalizedDouble(costText);
          variant.stockQuantity = normalizedDouble(stockText);
          variant.isSoldByWeight = isSoldByWeight;
          variant.stockWeight = isSoldByWeight ? normalizedDouble(stockWeightText) : 0;
          variant.packageWeightKg = isSoldByWeight ? normalizedDouble(packageWeightText) : 0;
          api.close();
          onDone();
        });

        api.body.appendChild(sec);
        api.body.appendChild(h('div', { class: 'section', style: 'margin-top:12px' }, [weightToggleRow]));
        api.body.appendChild(numbersSec);
        api.body.appendChild(saveBtn);
      },
    });
  }
}
