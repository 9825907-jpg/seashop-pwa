// Пикер клиента/поставщика: поиск по существующим + быстрое создание нового.
import { DB } from '../db.js';
import { h, icon, openModal, divider } from '../components.js';
import { newClient, newSupplier, clientInitials } from '../logic.js';

function genericPicker({ store, title, makeNew, emptyHint }) {
  return new Promise(async (resolve) => {
    const items = await DB.getAll(store);
    items.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    let resolved = false;

    const modal = openModal({
      title,
      onClose: () => { if (!resolved) resolve(null); },
      build: (api) => {
        const search = h('input', { type: 'text', class: 'field-full', placeholder: 'Поиск по имени' });
        const searchBar = h('div', { class: 'search-bar' }, [icon('search'), search]);

        const nameInput = h('input', { type: 'text', class: 'field-full', placeholder: 'Имя' });
        const phoneInput = h('input', { type: 'tel', class: 'field-full', placeholder: 'Телефон (необязательно)' });
        const createBtn = h('button', { class: 'btn btn-primary', style: 'margin-top:10px' }, 'Создать');
        createBtn.addEventListener('click', async () => {
          const name = nameInput.value.trim();
          if (!name) { window.alert('Введите имя'); return; }
          const record = makeNew({ name, phone: phoneInput.value.trim() });
          await DB.add(store, record);
          resolved = true;
          resolve(record);
          api.close();
        });
        const newSection = h('div', { class: 'section', style: 'margin-top:12px' }, [
          h('div', { style: 'padding:12px 16px 4px' }, nameInput),
          h('div', { style: 'padding:4px 16px 12px' }, phoneInput),
          h('div', { style: 'padding:0 16px 14px' }, createBtn),
        ]);

        const list = h('div');
        function renderList() {
          list.innerHTML = '';
          const f = search.value.trim().toLowerCase();
          const filtered = items.filter((c) => !f || c.name.toLowerCase().includes(f) || (c.phone || '').includes(f));
          if (filtered.length === 0) {
            list.appendChild(h('div', { class: 'empty-state tiny' }, emptyHint));
            return;
          }
          const sec = h('div', { class: 'section' });
          filtered.forEach((c, idx) => {
            if (idx > 0) sec.appendChild(divider());
            sec.appendChild(h('div', { class: 'row row-link', onclick: () => { resolved = true; resolve(c); api.close(); } }, [
              h('div', { style: 'flex:1' }, [
                h('div', { class: 'label' }, c.name),
                c.phone ? h('div', { class: 'sub' }, c.phone) : null,
              ]),
            ]));
          });
          list.appendChild(sec);
        }
        search.addEventListener('input', renderList);
        api.body.appendChild(searchBar);
        api.body.appendChild(list);
        api.body.appendChild(h('div', { class: 'section-title', style: 'margin-top:6px' }, 'Новый'));
        api.body.appendChild(newSection);
        renderList();
      },
    });
  });
}

export function pickClient() {
  return genericPicker({
    store: 'clients',
    title: 'Клиент',
    makeNew: newClient,
    emptyHint: 'Клиенты не найдены',
  });
}

export function pickSupplier() {
  return genericPicker({
    store: 'suppliers',
    title: 'Поставщик',
    makeNew: newSupplier,
    emptyHint: 'Поставщики не найдены',
  });
}
