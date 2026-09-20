// Список клиентов с поиском и быстрым добавлением.
import { DB } from '../db.js';
import { h, icon, clear, divider, openNavDrawer, openActionMenu } from '../components.js';
import { navigate } from '../router.js';
import { clientInitials } from '../logic.js';
import { pickClient } from './pickers.js';

let searchValue = '';

export async function render(container) {
  clear(container);
  const clients = (await DB.getAll('clients')).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const addClient = async () => { const c = await pickClient(); if (c) navigate('client', c.id); };

  container.appendChild(h('div', { class: 'appbar-brand' }, [
    h('button', { class: 'icon-btn-ghost', onclick: () => openNavDrawer('clients') }, icon('menu')),
    h('h1', {}, 'Клиенты'),
    h('button', {
      class: 'icon-btn-ghost',
      onclick: () => openActionMenu([
        { label: 'Настройки', onClick: () => navigate('settings') },
      ]),
    }, icon('more')),
  ]));
  container.appendChild(h('button', { class: 'fab', onclick: addClient }, icon('plus')));

  const search = h('input', { type: 'text', placeholder: 'Поиск клиента' });
  search.value = searchValue;
  container.appendChild(h('div', { class: 'search-bar' }, [icon('search'), search]));

  const listBox = h('div');
  container.appendChild(listBox);

  function renderList() {
    clear(listBox);
    const f = searchValue.trim().toLowerCase();
    const filtered = clients.filter((c) => !f || c.name.toLowerCase().includes(f) || (c.phone || '').includes(f));
    if (filtered.length === 0) {
      listBox.appendChild(h('div', { class: 'empty-state' }, 'Клиентов нет'));
      return;
    }
    const sec = h('div', { class: 'section' });
    filtered.forEach((c, idx) => {
      if (idx > 0) sec.appendChild(divider());
      const row = h('div', { class: 'row row-link' }, [
        h('div', { class: 'icon-badge', style: 'width:38px;height:38px;border-radius:50%;font-size:13px;font-weight:700' }, clientInitials(c.name)),
        h('div', { style: 'flex:1' }, [h('div', { class: 'label' }, c.name), c.phone ? h('div', { class: 'sub' }, c.phone) : null]),
        icon('chevron', 'chevron'),
      ]);
      row.addEventListener('click', () => navigate('client', c.id));
      sec.appendChild(row);
    });
    listBox.appendChild(sec);
  }
  search.addEventListener('input', () => { searchValue = search.value; renderList(); });
  renderList();
}
