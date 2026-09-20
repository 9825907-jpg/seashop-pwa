// Слой хранения — IndexedDB вместо SwiftData. Схема повторяет модели
// Swift-приложения (см. SeaShop/Models/*.swift), но со связями по строковым
// id (UUID) вместо object-графа SwiftData.
import { uuid } from './format.js';

const DB_NAME = 'SeaShopDB';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      const clients = db.createObjectStore('clients', { keyPath: 'id' });
      clients.createIndex('name', 'name');

      const suppliers = db.createObjectStore('suppliers', { keyPath: 'id' });
      suppliers.createIndex('name', 'name');

      const products = db.createObjectStore('products', { keyPath: 'id' });
      products.createIndex('name', 'name');
      products.createIndex('category', 'category');

      const variants = db.createObjectStore('variants', { keyPath: 'id' });
      variants.createIndex('productId', 'productId');

      const orders = db.createObjectStore('orders', { keyPath: 'id' });
      orders.createIndex('clientId', 'clientId');
      orders.createIndex('createdAt', 'createdAt');
      orders.createIndex('deliveryDate', 'deliveryDate');
      orders.createIndex('fulfilledAt', 'fulfilledAt');

      const orderItems = db.createObjectStore('orderItems', { keyPath: 'id' });
      orderItems.createIndex('orderId', 'orderId');
      orderItems.createIndex('variantId', 'variantId');

      const orderPayments = db.createObjectStore('orderPayments', { keyPath: 'id' });
      orderPayments.createIndex('orderId', 'orderId');
      orderPayments.createIndex('transferGroupId', 'transferGroupId');

      const purchases = db.createObjectStore('purchases', { keyPath: 'id' });
      purchases.createIndex('supplierId', 'supplierId');
      purchases.createIndex('createdAt', 'createdAt');
      purchases.createIndex('receivedAt', 'receivedAt');

      const purchaseItems = db.createObjectStore('purchaseItems', { keyPath: 'id' });
      purchaseItems.createIndex('purchaseId', 'purchaseId');
      purchaseItems.createIndex('variantId', 'variantId');

      const purchasePayments = db.createObjectStore('purchasePayments', { keyPath: 'id' });
      purchasePayments.createIndex('purchaseId', 'purchaseId');

      const stockLots = db.createObjectStore('stockLots', { keyPath: 'id' });
      stockLots.createIndex('variantId', 'variantId');
      stockLots.createIndex('purchaseItemId', 'purchaseItemId');
      stockLots.createIndex('date', 'date');

      const lotConsumptions = db.createObjectStore('lotConsumptions', { keyPath: 'id' });
      lotConsumptions.createIndex('orderItemId', 'orderItemId');
      lotConsumptions.createIndex('lotId', 'lotId');

      db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeNames, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeNames, mode));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const DB = {
  async getAll(store) {
    const t = await tx([store]);
    return wrap(t.objectStore(store).getAll());
  },
  async getByIndex(store, indexName, value) {
    const t = await tx([store]);
    return wrap(t.objectStore(store).index(indexName).getAll(value));
  },
  async get(store, id) {
    const t = await tx([store]);
    return wrap(t.objectStore(store).get(id));
  },
  async put(store, obj) {
    const t = await tx([store], 'readwrite');
    await wrap(t.objectStore(store).put(obj));
    return obj;
  },
  async putMany(store, objs) {
    const t = await tx([store], 'readwrite');
    const s = t.objectStore(store);
    objs.forEach((o) => s.put(o));
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(objs);
      t.onerror = () => reject(t.error);
    });
  },
  async add(store, obj) {
    if (!obj.id) obj.id = uuid();
    const t = await tx([store], 'readwrite');
    await wrap(t.objectStore(store).add(obj));
    return obj;
  },
  async delete(store, id) {
    const t = await tx([store], 'readwrite');
    await wrap(t.objectStore(store).delete(id));
  },
  async deleteMany(store, ids) {
    const t = await tx([store], 'readwrite');
    const s = t.objectStore(store);
    ids.forEach((id) => s.delete(id));
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
  async clear(store) {
    const t = await tx([store], 'readwrite');
    await wrap(t.objectStore(store).clear());
  },
  // Транзакция сразу по нескольким стораджам (для атомарных операций вроде
  // завершения заказа: списание склада + лоты + платежи одним махом).
  async transaction(storeNames, mode, work) {
    const t = await tx(storeNames, mode);
    const stores = {};
    storeNames.forEach((name) => { stores[name] = t.objectStore(name); });
    const result = await work(stores, t);
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transaction aborted'));
    });
  },
};

function reqAll(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Небольшие синхронные-в-транзакции хелперы поверх сырых object store —
// используются внутри DB.transaction(...), где нельзя await'ить DB.* методы
// (это открыло бы новую транзакцию поверх текущей).
export const raw = {
  getAll: (store) => reqAll(store.getAll()),
  getByIndex: (store, indexName, value) => reqAll(store.index(indexName).getAll(value)),
  get: (store, id) => reqAll(store.get(id)),
  put: (store, obj) => store.put(obj),
  add: (store, obj) => { if (!obj.id) obj.id = uuid(); store.add(obj); return obj; },
  delete: (store, id) => store.delete(id),
};

export { uuid };
