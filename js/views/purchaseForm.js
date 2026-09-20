// Создание/редактирование закупки: поставщик, позиции, комментарий.
import { DB } from '../db.js';
import { h, icon, openModal, divider, showToast } from '../components.js';
import { formatQuantity, formatCurrency } from '../format.js';
import { newPurchase, newPurchaseItem, purchaseTotal, purchaseItemSubtotal, loadPurchaseFull } from '../logic.js';
import { pickSupplier } from './pickers.js';
import { pickItems } from './itemPicker.js';

export async function openPurchaseForm({ purchaseId = null, onSaved } = {}) {
  let purchase = null;
  let supplier = null;
  let items = [];
  const isEditing = !!purchaseId;

  if (isEditing) {
    const full = await loadPurchaseFull(purchaseId);
    if (!full) { showToast('Закупка не найдена'); return; }
    purchase = full.purchase;
    supplier = full.supplier;
    items = full.items.map((i) => ({ ...i, _existing: true }));
  } else {
    purchase = newPurchase({});
  }
  const locked = isEditing && !!purchase.receivedAt;

  openModal({ title: isEditing ? 'Закупка' : 'Новая закупка', build: (api) => render(api) });

  function render(api) {
    api.body.innerHTML = '';
    const supplierRow = h('div', { class: 'row row-link' }, [
      h('span', {}, 'Поставщик'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted' }, supplier ? supplier.name : (purchase.supplierName || 'Не выбран')),
      icon('chevron', 'chevron'),
    ]);
    supplierRow.addEventListener('click', async () => {
      const picked = await pickSupplier();
      if (picked) { supplier = picked; purchase.supplierId = picked.id; purchase.supplierName = picked.name; render(api); }
    });
    api.body.appendChild(h('div', { class: 'section' }, [supplierRow]));

    api.body.appendChild(h('div', { class: 'section-title' }, 'Товары'));
    const itemsSection = h('div', { class: 'section' });
    function renderItems() {
      itemsSection.innerHTML = '';
      if (items.length === 0) itemsSection.appendChild(h('div', { class: 'empty-state tiny' }, 'Нет товаров'));
      items.forEach((it, idx) => {
        if (idx > 0) itemsSection.appendChild(divider());
        itemsSection.appendChild(h('div', { class: 'row' }, [
          h('div', { style: 'flex:1' }, [
            h('div', { class: 'label' }, it.productName),
            h('div', { class: 'sub' }, it.isSoldByWeight ? `${formatQuantity(it.weight || 0)} кг × ${formatCurrency(it.unitPrice)}` : `${formatQuantity(it.quantity)} × ${formatCurrency(it.unitPrice)}`),
          ]),
          h('div', { class: 'bold' }, formatCurrency(purchaseItemSubtotal(it))),
          !locked ? h('button', { class: 'icon-btn', onclick: () => { items.splice(idx, 1); renderItems(); renderTotal(); } }, icon('trash')) : null,
        ]));
      });
    }
    const addBtn = !locked ? h('button', { class: 'btn btn-secondary', style: 'margin-top:10px' }, [icon('plus'), ' Добавить товар']) : null;
    if (addBtn) addBtn.addEventListener('click', async () => {
      const picked = await pickItems({ mode: 'purchase' });
      items = items.concat(picked);
      renderItems();
      renderTotal();
    });

    const totalRow = h('div', { class: 'row' });
    function renderTotal() {
      totalRow.innerHTML = '';
      totalRow.appendChild(h('span', { class: 'bold' }, 'Итого'));
      totalRow.appendChild(h('span', { class: 'spacer' }));
      totalRow.appendChild(h('span', { class: 'bold' }, formatCurrency(purchaseTotal(items))));
    }
    const totalSection = h('div', { class: 'section' }, [totalRow]);

    const commentInput = h('textarea', { class: 'field-textarea', placeholder: 'Комментарий' });
    commentInput.value = purchase.comment || '';
    const commentSection = h('div', { class: 'section' }, [h('div', { style: 'padding:10px 16px' }, commentInput)]);

    const saveBtn = h('button', { class: 'btn btn-primary', style: 'margin-top:4px' }, 'Сохранить');
    saveBtn.addEventListener('click', async () => {
      if (items.length === 0) { window.alert('Добавьте хотя бы один товар'); return; }
      purchase.comment = commentInput.value.trim();
      if (isEditing) {
        await DB.put('purchases', purchase);
        if (!locked) {
          const existingIds = new Set(items.filter((i) => i._existing).map((i) => i.id));
          const original = await DB.getByIndex('purchaseItems', 'purchaseId', purchase.id);
          for (const orig of original) if (!existingIds.has(orig.id)) await DB.delete('purchaseItems', orig.id);
          for (const it of items) {
            if (it._existing) { const { _existing, ...rest } = it; await DB.put('purchaseItems', rest); }
            else await DB.add('purchaseItems', newPurchaseItem({ purchaseId: purchase.id, ...it }));
          }
        }
      } else {
        await DB.add('purchases', purchase);
        for (const it of items) await DB.add('purchaseItems', newPurchaseItem({ purchaseId: purchase.id, ...it }));
      }
      api.close();
      showToast('Закупка сохранена');
      if (onSaved) onSaved(purchase.id);
    });

    api.body.appendChild(itemsSection);
    if (addBtn) api.body.appendChild(addBtn);
    api.body.appendChild(h('div', { style: 'height:14px' }));
    api.body.appendChild(totalSection);
    api.body.appendChild(commentSection);
    api.body.appendChild(saveBtn);
    renderItems();
    renderTotal();
  }
}
