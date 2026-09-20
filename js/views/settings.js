// Настройки: экспорт/импорт данных (JSON), сведения о приложении.
import { h, icon, clear, divider, showToast, confirmAction, openNavDrawer } from '../components.js';
import { navigate } from '../router.js';
import * as dt from '../dataTransfer.js';

export async function render(container) {
  clear(container);
  container.appendChild(h('div', { class: 'appbar-brand' }, [
    h('button', { class: 'icon-btn-ghost', onclick: () => openNavDrawer('settings') }, icon('menu')),
    h('h1', {}, 'Настройки'),
    h('span', { style: 'width:38px' }),
  ]));

  container.appendChild(h('div', { class: 'section-title' }, 'Экспорт данных'));
  const exportSec = h('div', { class: 'section' }, [
    exportRow('Товары', () => dt.exportProducts()),
    divider(),
    exportRow('Заказы', () => dt.exportOrders()),
    divider(),
    exportRow('Закупки', () => dt.exportPurchases()),
  ]);
  container.appendChild(exportSec);

  container.appendChild(h('div', { class: 'section-title', style: 'margin-top:18px' }, 'Импорт данных'));
  container.appendChild(h('p', { class: 'tiny muted', style: 'padding:0 4px 8px' }, 'Сначала импортируйте Товары, потом Закупки и Заказы — недостающие товары создаются автоматически.'));
  const importSec = h('div', { class: 'section' }, [
    importRow('Товары', dt.importProducts),
    divider(),
    importRow('Заказы', dt.importOrders),
    divider(),
    importRow('Закупки', dt.importPurchases),
  ]);
  container.appendChild(importSec);

  container.appendChild(h('div', { class: 'section-title', style: 'margin-top:18px' }, 'О приложении'));
  container.appendChild(h('div', { class: 'section' }, [
    h('div', { class: 'row' }, [h('span', {}, 'SeaShop'), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, 'PWA · данные хранятся локально на этом устройстве')]),
  ]));

  function exportRow(label, fn) {
    const row = h('div', { class: 'row row-link' }, [
      icon('download'), h('span', { style: 'flex:1;margin-left:8px' }, label),
    ]);
    row.addEventListener('click', async () => { await fn(); showToast('Файл скачан'); });
    return row;
  }

  function importRow(label, fn) {
    const fileInput = h('input', { type: 'file', accept: 'application/json', style: 'display:none' });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (!(await confirmAction(`Импортировать «${label}» из файла?`))) return;
      try {
        const count = await fn(file);
        showToast(`Импортировано: ${count}`);
      } catch (e) {
        window.alert(e.message || 'Ошибка импорта');
      }
      fileInput.value = '';
    });
    const row = h('div', { class: 'row row-link' }, [icon('upload'), h('span', { style: 'flex:1;margin-left:8px' }, label), fileInput]);
    row.addEventListener('click', (e) => { if (e.target !== fileInput) fileInput.click(); });
    return row;
  }
}
