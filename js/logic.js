// Бизнес-логика — точный порт вычисляемых свойств и денежных/складских
// операций из Models/*.swift и Support/Utilities.swift, CompleteOrderView.swift,
// ReceivePurchaseView.swift. Работает с обычными объектами (а не "живым"
// object-графом SwiftData), поэтому связанные записи передаются или
// подгружаются явно.
import { DB, raw, uuid } from './db.js';
import { formatQuantity, formatCurrency, roundMoney, formatDate, initials } from './format.js';

const LOT_EPSILON = 0.0005;

export const PRODUCT_CATEGORIES = [
  { value: 'caviar', title: 'Икра' },
  { value: 'fish', title: 'Рыба' },
  { value: 'seafood', title: 'Морепродукты' },
  { value: 'other', title: 'Другое' },
];
export function categoryTitle(value) {
  return PRODUCT_CATEGORIES.find((c) => c.value === value)?.title || value;
}

export const PAYMENT_NOTES = {
  fulfillment: 'Оплата при выдаче',
  creditTransferIn: 'Из переплаты по другому заказу',
  creditTransferOut: 'Учтено в другом заказе клиента',
};

export const ORDER_STATUS_TITLES = {
  new: 'Новый',
  pendingPayment: 'Ждёт оплаты',
  completed: 'Завершён',
};

// ---------------------------------------------------------------------------
// Фабрики новых записей
// ---------------------------------------------------------------------------
export function newClient({ name, phone = '', contactIdentifier = null }) {
  return { id: uuid(), name, phone, contactIdentifier, createdAt: new Date().toISOString() };
}
export function newSupplier({ name, phone = '', contactIdentifier = null }) {
  return { id: uuid(), name, phone, contactIdentifier, createdAt: new Date().toISOString() };
}
export function newProduct({ name, category = 'seafood' }) {
  return { id: uuid(), name, category, createdAt: new Date().toISOString(), lastPurchasePricePerKg: 0 };
}
export function newVariant({
  productId, label, unit, pricePerUnit, costPrice = 0, stockQuantity = 0,
  isSoldByWeight = false, averageWeightPerUnit = 0, stockWeight = 0, packageWeightKg = 0,
}) {
  return {
    id: uuid(), productId, label, unit, pricePerUnit, costPrice, stockQuantity,
    isSoldByWeight, averageWeightPerUnit, stockWeight, packageWeightKg,
    createdAt: new Date().toISOString(),
  };
}
export function newOrder({ clientId = null, comment = '' }) {
  return {
    id: uuid(), createdAt: new Date().toISOString(), comment, clientId,
    deliveryDate: null, deliveryTimeFrom: null, deliveryTimeTo: null, fulfilledAt: null,
  };
}
export function newOrderItem({ orderId, variantId = null, productName, unit, quantity, unitPrice, weight = null, isSoldByWeight = false }) {
  return { id: uuid(), orderId, variantId, productName, unit, quantity, unitPrice, weight, isSoldByWeight };
}
export function newOrderPayment({ orderId, amount, date = new Date().toISOString(), note = null, transferGroupId = null }) {
  return { id: uuid(), orderId, amount, date, note, transferGroupId };
}
export function newPurchase({ supplierId = null, supplierName = '', comment = '' }) {
  return { id: uuid(), createdAt: new Date().toISOString(), supplierId, supplierName, comment, receivedAt: null };
}
export function newPurchaseItem({ purchaseId, variantId = null, productName, unit, quantity, unitPrice, weight = null, isSoldByWeight = false }) {
  return { id: uuid(), purchaseId, variantId, productName, unit, quantity, unitPrice, weight, isSoldByWeight };
}
export function newPurchasePayment({ purchaseId, amount, date = new Date().toISOString() }) {
  return { id: uuid(), purchaseId, amount, date };
}
export function newStockLot({ variantId, date = new Date().toISOString(), costPrice, isSoldByWeight, quantity, weight, purchaseItemId = null }) {
  return { id: uuid(), variantId, date, costPrice, isSoldByWeight, remainingQuantity: quantity, remainingWeight: weight, purchaseItemId };
}
export function newLotConsumption({ orderItemId, lotId = null, quantity = 0, weight = 0, costPrice }) {
  return { id: uuid(), orderItemId, lotId, quantity, weight, costPrice };
}

// ---------------------------------------------------------------------------
// Вычисляемые свойства — заказы
// ---------------------------------------------------------------------------
export function orderItemSubtotal(item) {
  if (item.isSoldByWeight) {
    if (item.weight === null || item.weight === undefined) return 0;
    return item.weight * item.unitPrice;
  }
  return item.quantity * item.unitPrice;
}
export function orderTotal(items) { return items.reduce((sum, i) => sum + orderItemSubtotal(i), 0); }
export function amountPaidFromPayments(payments) { return payments.reduce((sum, p) => sum + p.amount, 0); }
export function balanceDue(total, amountPaid) { return Math.max(0, roundMoney(total - amountPaid)); }
export function overpaid(total, amountPaid) { return Math.max(0, roundMoney(amountPaid - total)); }
export function isOrderFulfilled(order) { return !!order.fulfilledAt; }
export function isPaidInFull(total, amountPaid) { return balanceDue(total, amountPaid) <= 0; }

export function orderDisplayStatus(order, total, amountPaid) {
  if (!isOrderFulfilled(order)) return 'new';
  return isPaidInFull(total, amountPaid) ? 'completed' : 'pendingPayment';
}

export function deliveryTimeRange(order) {
  if (!order.deliveryTimeFrom && !order.deliveryTimeTo) return null;
  const base = order.deliveryDate ? new Date(order.deliveryDate) : new Date();
  const defaultStart = new Date(base); defaultStart.setHours(8, 0, 0, 0);
  const defaultEnd = new Date(base); defaultEnd.setHours(20, 0, 0, 0);
  const from = order.deliveryTimeFrom ? new Date(order.deliveryTimeFrom) : defaultStart;
  const to = order.deliveryTimeTo ? new Date(order.deliveryTimeTo) : defaultEnd;
  return { from, to };
}

export function orderItemsSummary(items) {
  if (items.length === 0) return 'Пусто';
  return items
    .map((i) => (i.isSoldByWeight ? `${i.productName} ${formatQuantity(i.weight || 0)} кг` : `${i.productName} ×${formatQuantity(i.quantity)}`))
    .join(', ');
}

export function orderShareText({ order, client, items, payments }) {
  const total = orderTotal(items);
  const paid = amountPaidFromPayments(payments);
  const due = balanceDue(total, paid);
  const lines = [];
  lines.push(`Заказ${client ? ` для ${client.name}` : ''}`);
  if (order.deliveryDate) lines.push(`Доставка: ${formatDate(order.deliveryDate)}`);
  lines.push('');
  items.forEach((i) => {
    const qty = i.isSoldByWeight ? `${formatQuantity(i.weight || 0)} кг` : `${formatQuantity(i.quantity)} × ${formatCurrency(i.unitPrice)}`;
    lines.push(`- ${i.productName}: ${qty} = ${formatCurrency(orderItemSubtotal(i))}`);
  });
  lines.push('');
  lines.push(`Итого: ${formatCurrency(total)}`);
  if (paid > 0) lines.push(`Оплачено: ${formatCurrency(paid)}`);
  lines.push(due > 0 ? `К оплате: ${formatCurrency(due)}` : 'Оплачен полностью');
  if (order.comment) { lines.push(''); lines.push(order.comment); }
  return lines.join('\n');
}

export function estimatedCost(item, variant) {
  if (!variant) return 0;
  return item.isSoldByWeight ? (item.weight || 0) * variant.costPrice : item.quantity * variant.costPrice;
}
export function estimatedProfit(item, variant) { return orderItemSubtotal(item) - estimatedCost(item, variant); }
export function lotConsumptionCost(c) { return c.weight > 0 ? c.weight * c.costPrice : c.quantity * c.costPrice; }
export function actualCost(item, variant, lotConsumptions) {
  if (!lotConsumptions || lotConsumptions.length === 0) return estimatedCost(item, variant);
  return lotConsumptions.reduce((sum, c) => sum + lotConsumptionCost(c), 0);
}
export function actualProfit(item, variant, lotConsumptions) { return orderItemSubtotal(item) - actualCost(item, variant, lotConsumptions); }
export function pendingWeightItems(items) { return items.filter((i) => i.isSoldByWeight && (i.weight === null || i.weight === undefined)); }

// ---------------------------------------------------------------------------
// Вычисляемые свойства — закупки
// ---------------------------------------------------------------------------
export function purchaseItemSubtotal(item) {
  return item.isSoldByWeight ? (item.weight || 0) * item.unitPrice : item.quantity * item.unitPrice;
}
export function purchaseTotal(items) { return items.reduce((s, i) => s + purchaseItemSubtotal(i), 0); }
export function purchaseItemsSummary(items) {
  if (items.length === 0) return 'Пусто';
  return items.map((i) => `${i.productName} ×${formatQuantity(i.quantity)} ${i.unit}`).join(', ');
}
export function purchaseShareText({ purchase, items }) {
  const lines = [`Закупка${purchase.supplierName ? ` у ${purchase.supplierName}` : ''}`, ''];
  items.forEach((i) => {
    const qty = i.isSoldByWeight && i.weight ? `${formatQuantity(i.weight)} кг` : `${formatQuantity(i.quantity)} ${i.unit}`;
    lines.push(`- ${i.productName}: ${qty}`);
  });
  if (purchase.comment) { lines.push(''); lines.push(purchase.comment); }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Вычисляемые свойства — товары/фасовки
// ---------------------------------------------------------------------------
export function variantStockLevel(variant) {
  if (variant.stockQuantity <= 0) return 'out';
  if (variant.stockQuantity <= 3) return 'low';
  return 'inStock';
}
export function variantStockDisplayText(variant) {
  let text = `${formatQuantity(variant.stockQuantity)} шт`;
  if (variant.isSoldByWeight && variant.stockWeight > 0) text += ` · ${formatQuantity(variant.stockWeight)} кг`;
  return text;
}
export function clientInitials(name) { return initials(name); }

// ---------------------------------------------------------------------------
// Агрегирующие загрузчики (для экранов — заказ/закупка со всеми связями)
// ---------------------------------------------------------------------------
export async function loadOrderFull(orderId) {
  const order = await DB.get('orders', orderId);
  if (!order) return null;
  const [items, payments, client] = await Promise.all([
    DB.getByIndex('orderItems', 'orderId', orderId),
    DB.getByIndex('orderPayments', 'orderId', orderId),
    order.clientId ? DB.get('clients', order.clientId) : Promise.resolve(null),
  ]);
  const total = orderTotal(items);
  const amountPaid = amountPaidFromPayments(payments);
  return {
    order, client, items, payments, total, amountPaid,
    balanceDue: balanceDue(total, amountPaid),
    overpaid: overpaid(total, amountPaid),
    status: orderDisplayStatus(order, total, amountPaid),
  };
}

export async function loadPurchaseFull(purchaseId) {
  const purchase = await DB.get('purchases', purchaseId);
  if (!purchase) return null;
  const [items, payments, supplier] = await Promise.all([
    DB.getByIndex('purchaseItems', 'purchaseId', purchaseId),
    DB.getByIndex('purchasePayments', 'purchaseId', purchaseId),
    purchase.supplierId ? DB.get('suppliers', purchase.supplierId) : Promise.resolve(null),
  ]);
  const total = purchaseTotal(items);
  const amountPaid = amountPaidFromPayments(payments);
  return {
    purchase, supplier, items, payments, total, amountPaid,
    balanceDue: balanceDue(total, amountPaid),
    overpaid: overpaid(total, amountPaid),
    isReceived: !!purchase.receivedAt,
  };
}

// Переплата клиента по его ДРУГИМ уже выданным заказам (см. AddOrderPaymentView
// / CompleteOrderView .clientCredit в Swift-приложении).
export async function clientCredit(clientId, excludeOrderId = null) {
  if (!clientId) return 0;
  const orders = await DB.getByIndex('orders', 'clientId', clientId);
  let net = 0;
  for (const o of orders) {
    if (o.id === excludeOrderId || !o.fulfilledAt) continue;
    const [items, payments] = await Promise.all([
      DB.getByIndex('orderItems', 'orderId', o.id),
      DB.getByIndex('orderPayments', 'orderId', o.id),
    ]);
    net += amountPaidFromPayments(payments) - orderTotal(items);
  }
  return Math.max(0, net);
}

// Переплата поставщику по другим закупкам (см. AddPurchasePaymentView.supplierCredit).
export async function supplierCredit(supplierId, excludePurchaseId = null) {
  if (!supplierId) return 0;
  const purchases = await DB.getByIndex('purchases', 'supplierId', supplierId);
  let net = 0;
  for (const p of purchases) {
    if (p.id === excludePurchaseId) continue;
    const [items, payments] = await Promise.all([
      DB.getByIndex('purchaseItems', 'purchaseId', p.id),
      DB.getByIndex('purchasePayments', 'purchaseId', p.id),
    ]);
    net += amountPaidFromPayments(payments) - purchaseTotal(items);
  }
  return Math.max(0, net);
}

// Нехватка склада для завершения заказа (см. CompleteOrderView.StockShortfall) —
// считается по варианту суммарно (несколько строк заказа с одним и тем же
// товаром складываются перед сравнением с остатком).
export async function computeStockShortfalls(orderId) {
  const items = await DB.getByIndex('orderItems', 'orderId', orderId);
  const needed = {};
  for (const i of items) {
    if (!i.variantId) continue;
    needed[i.variantId] = needed[i.variantId] || { quantity: 0, weight: 0 };
    needed[i.variantId].quantity += i.quantity;
    needed[i.variantId].weight += i.weight || 0;
  }
  const shortfalls = [];
  for (const [variantId, need] of Object.entries(needed)) {
    const variant = await DB.get('variants', variantId);
    if (!variant) continue;
    if (variant.isSoldByWeight) {
      if (need.weight > variant.stockWeight + LOT_EPSILON) {
        shortfalls.push({ variantId, variant, neededWeight: need.weight, availableWeight: variant.stockWeight });
      }
    } else if (need.quantity > variant.stockQuantity + LOT_EPSILON) {
      shortfalls.push({ variantId, variant, neededQuantity: need.quantity, availableQuantity: variant.stockQuantity });
    }
  }
  return shortfalls;
}

// ---------------------------------------------------------------------------
// Склад: списание/возврат FIFO (порт ModelContext.consumeStockFIFO / revertStockFIFO)
// stores.* — сырые IDBObjectStore внутри ОБЩЕЙ транзакции (см. DB.transaction).
// ---------------------------------------------------------------------------
export async function consumeStockFIFO(stores, { variant, orderItemId, quantity, weight }) {
  const allLots = await raw.getByIndex(stores.stockLots, 'variantId', variant.id);
  const lots = allLots
    .filter((l) => (l.isSoldByWeight ? l.remainingWeight > LOT_EPSILON : l.remainingQuantity > LOT_EPSILON))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (variant.isSoldByWeight) {
    let remaining = weight || 0;
    for (const lot of lots) {
      if (remaining <= LOT_EPSILON) break;
      const take = Math.min(lot.remainingWeight, remaining);
      const takenQuantity = lot.remainingWeight > 0 ? lot.remainingQuantity * (take / lot.remainingWeight) : 0;
      raw.add(stores.lotConsumptions, newLotConsumption({ orderItemId, lotId: lot.id, quantity: takenQuantity, weight: take, costPrice: lot.costPrice }));
      lot.remainingWeight -= take;
      lot.remainingQuantity -= takenQuantity;
      raw.put(stores.stockLots, lot);
      remaining -= take;
    }
    if (remaining > LOT_EPSILON) {
      raw.add(stores.lotConsumptions, newLotConsumption({ orderItemId, lotId: null, quantity: 0, weight: remaining, costPrice: variant.costPrice }));
    }
  } else {
    let remaining = quantity || 0;
    for (const lot of lots) {
      if (remaining <= LOT_EPSILON) break;
      const take = Math.min(lot.remainingQuantity, remaining);
      raw.add(stores.lotConsumptions, newLotConsumption({ orderItemId, lotId: lot.id, quantity: take, weight: 0, costPrice: lot.costPrice }));
      lot.remainingQuantity -= take;
      raw.put(stores.stockLots, lot);
      remaining -= take;
    }
    if (remaining > LOT_EPSILON) {
      raw.add(stores.lotConsumptions, newLotConsumption({ orderItemId, lotId: null, quantity: remaining, weight: 0, costPrice: variant.costPrice }));
    }
  }
}

export async function revertStockFIFO(stores, orderItemId) {
  const consumptions = await raw.getByIndex(stores.lotConsumptions, 'orderItemId', orderItemId);
  for (const c of consumptions) {
    if (c.lotId) {
      const lot = await raw.get(stores.stockLots, c.lotId);
      if (lot) {
        lot.remainingQuantity += c.quantity;
        lot.remainingWeight += c.weight;
        raw.put(stores.stockLots, lot);
      }
    }
    raw.delete(stores.lotConsumptions, c.id);
  }
}

async function removeStockLotsForItems(stores, purchaseItemIds) {
  for (const itemId of purchaseItemIds) {
    const lots = await raw.getByIndex(stores.stockLots, 'purchaseItemId', itemId);
    for (const l of lots) raw.delete(stores.stockLots, l.id);
  }
}

// ---------------------------------------------------------------------------
// Заказы: завершение выдачи (порт CompleteOrderView.complete())
// ---------------------------------------------------------------------------
// itemWeights: { [orderItemId]: number } — вес весовых позиций, уточнённый
// на экране выдачи (см. CompleteOrderView.pendingWeightItems в Swift-приложении).
export async function completeOrder(orderId, { amount = 0, date = new Date().toISOString(), itemWeights = {} } = {}) {
  return DB.transaction(
    ['orders', 'orderItems', 'orderPayments', 'variants', 'stockLots', 'lotConsumptions'],
    'readwrite',
    async (stores) => {
      const order = await raw.get(stores.orders, orderId);
      if (!order) throw new Error('order not found');
      const items = await raw.getByIndex(stores.orderItems, 'orderId', orderId);

      for (const item of items) {
        if (item.isSoldByWeight && itemWeights[item.id] !== undefined) {
          item.weight = itemWeights[item.id];
          raw.put(stores.orderItems, item);
        }
        if (!item.variantId) continue;
        const variant = await raw.get(stores.variants, item.variantId);
        if (!variant) continue;
        variant.stockQuantity -= item.quantity;
        if (variant.isSoldByWeight) variant.stockWeight -= (item.weight || 0);
        raw.put(stores.variants, variant);
        await consumeStockFIFO(stores, { variant, orderItemId: item.id, quantity: item.quantity, weight: item.weight });
      }

      order.fulfilledAt = new Date().toISOString();
      raw.put(stores.orders, order);

      if (amount > 0) {
        raw.add(stores.orderPayments, newOrderPayment({ orderId, amount, date, note: PAYMENT_NOTES.fulfillment }));
      }

      // Автоматически закрываем остаток переплатами клиента по его другим
      // уже выданным заказам — парой проводок с общим transferGroupId.
      if (order.clientId) {
        const total = orderTotal(items);
        const currentPayments = await raw.getByIndex(stores.orderPayments, 'orderId', orderId);
        let stillNeeded = Math.max(0, roundMoney(total - amountPaidFromPayments(currentPayments)));
        if (stillNeeded > 0) {
          const clientOrders = (await raw.getByIndex(stores.orders, 'clientId', order.clientId))
            .filter((o) => o.id !== orderId && o.fulfilledAt)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          for (const source of clientOrders) {
            if (stillNeeded <= 0) break;
            const [sItems, sPayments] = await Promise.all([
              raw.getByIndex(stores.orderItems, 'orderId', source.id),
              raw.getByIndex(stores.orderPayments, 'orderId', source.id),
            ]);
            const sOverpaid = overpaid(orderTotal(sItems), amountPaidFromPayments(sPayments));
            if (sOverpaid <= 0) continue;
            const take = Math.min(stillNeeded, sOverpaid);
            const transferGroupId = uuid();
            raw.add(stores.orderPayments, newOrderPayment({ orderId: source.id, amount: -take, date: new Date().toISOString(), note: PAYMENT_NOTES.creditTransferOut, transferGroupId }));
            raw.add(stores.orderPayments, newOrderPayment({ orderId, amount: take, date: new Date().toISOString(), note: PAYMENT_NOTES.creditTransferIn, transferGroupId }));
            stillNeeded = roundMoney(stillNeeded - take);
          }
        }
      }
    }
  );
}

export async function cancelFulfillment(orderId) {
  return DB.transaction(
    ['orders', 'orderItems', 'orderPayments', 'variants', 'stockLots', 'lotConsumptions'],
    'readwrite',
    async (stores) => {
      const order = await raw.get(stores.orders, orderId);
      if (!order) return;
      const items = await raw.getByIndex(stores.orderItems, 'orderId', orderId);
      for (const item of items) {
        if (!item.variantId) continue;
        const variant = await raw.get(stores.variants, item.variantId);
        if (variant) {
          variant.stockQuantity += item.quantity;
          if (variant.isSoldByWeight) variant.stockWeight += (item.weight || 0);
          raw.put(stores.variants, variant);
        }
        await revertStockFIFO(stores, item.id);
      }
      const payments = await raw.getByIndex(stores.orderPayments, 'orderId', orderId);
      const removed = new Set();
      for (const p of payments) {
        if (removed.has(p.id)) continue;
        if (p.note === PAYMENT_NOTES.fulfillment) {
          raw.delete(stores.orderPayments, p.id);
          removed.add(p.id);
        } else if (p.transferGroupId) {
          const paired = await raw.getByIndex(stores.orderPayments, 'transferGroupId', p.transferGroupId);
          for (const pp of paired) { raw.delete(stores.orderPayments, pp.id); removed.add(pp.id); }
        }
      }
      order.fulfilledAt = null;
      raw.put(stores.orders, order);
    }
  );
}

export async function deleteOrderAndRestock(orderId) {
  return DB.transaction(
    ['orders', 'orderItems', 'orderPayments', 'variants', 'stockLots', 'lotConsumptions'],
    'readwrite',
    async (stores) => {
      const order = await raw.get(stores.orders, orderId);
      if (!order) return;
      const items = await raw.getByIndex(stores.orderItems, 'orderId', orderId);
      if (order.fulfilledAt) {
        for (const item of items) {
          if (item.variantId) {
            const variant = await raw.get(stores.variants, item.variantId);
            if (variant) {
              variant.stockQuantity += item.quantity;
              if (variant.isSoldByWeight) variant.stockWeight += (item.weight || 0);
              raw.put(stores.variants, variant);
            }
          }
          await revertStockFIFO(stores, item.id);
        }
      }
      for (const item of items) raw.delete(stores.orderItems, item.id);
      const payments = await raw.getByIndex(stores.orderPayments, 'orderId', orderId);
      for (const p of payments) raw.delete(stores.orderPayments, p.id);
      raw.delete(stores.orders, orderId);
    }
  );
}

// ---------------------------------------------------------------------------
// Закупки: проведение прихода (порт ReceivePurchaseView.receive()) и отмены
// ---------------------------------------------------------------------------
// receivedValues: { [purchaseItemId]: { quantity, weight } } — то, что реально
// привезли (по умолчанию — то, что было заказано).
export async function receivePurchase(purchaseId, receivedValues = {}) {
  return DB.transaction(['purchases', 'purchaseItems', 'variants', 'stockLots'], 'readwrite', async (stores) => {
    const purchase = await raw.get(stores.purchases, purchaseId);
    if (!purchase) throw new Error('purchase not found');
    const items = await raw.getByIndex(stores.purchaseItems, 'purchaseId', purchaseId);

    for (const item of items) {
      if (!item.variantId) continue;
      const variant = await raw.get(stores.variants, item.variantId);
      if (!variant) continue;
      const rv = receivedValues[item.id] || {};
      const finalQuantity = rv.quantity !== undefined ? rv.quantity : item.quantity;
      const finalWeight = rv.weight !== undefined ? rv.weight : item.weight;

      variant.stockQuantity += finalQuantity;
      if (variant.isSoldByWeight && item.isSoldByWeight && finalWeight != null) variant.stockWeight += finalWeight;

      const price = item.unitPrice;
      const totalCost = item.isSoldByWeight ? (finalWeight || 0) * price : finalQuantity * price;
      if (item.isSoldByWeight && finalWeight && finalWeight > 0 && finalQuantity > 0) {
        variant.averageWeightPerUnit = finalWeight / finalQuantity;
      }
      if (variant.isSoldByWeight) {
        if (item.isSoldByWeight) variant.costPrice = price;
      } else if (!item.isSoldByWeight) {
        variant.costPrice = price;
      } else if (finalQuantity > 0) {
        variant.costPrice = totalCost / finalQuantity;
      }

      item.quantity = finalQuantity;
      item.weight = item.isSoldByWeight ? finalWeight : item.weight;
      raw.put(stores.variants, variant);
      raw.put(stores.purchaseItems, item);

      raw.add(stores.stockLots, newStockLot({
        variantId: variant.id,
        costPrice: variant.costPrice,
        isSoldByWeight: variant.isSoldByWeight,
        quantity: finalQuantity,
        weight: variant.isSoldByWeight ? (finalWeight || 0) : 0,
        purchaseItemId: item.id,
      }));
    }

    purchase.receivedAt = new Date().toISOString();
    raw.put(stores.purchases, purchase);
  });
}

export async function cancelReceipt(purchaseId) {
  return DB.transaction(['purchases', 'purchaseItems', 'variants', 'stockLots'], 'readwrite', async (stores) => {
    const purchase = await raw.get(stores.purchases, purchaseId);
    if (!purchase) return;
    const items = await raw.getByIndex(stores.purchaseItems, 'purchaseId', purchaseId);
    for (const item of items) {
      if (!item.variantId) continue;
      const variant = await raw.get(stores.variants, item.variantId);
      if (variant) {
        variant.stockQuantity -= item.quantity;
        if (variant.isSoldByWeight) variant.stockWeight -= (item.weight || 0);
        raw.put(stores.variants, variant);
      }
    }
    await removeStockLotsForItems(stores, items.map((i) => i.id));
    purchase.receivedAt = null;
    raw.put(stores.purchases, purchase);
  });
}

export async function deletePurchaseAndRevertStock(purchaseId) {
  return DB.transaction(['purchases', 'purchaseItems', 'purchasePayments', 'variants', 'stockLots'], 'readwrite', async (stores) => {
    const purchase = await raw.get(stores.purchases, purchaseId);
    if (!purchase) return;
    const items = await raw.getByIndex(stores.purchaseItems, 'purchaseId', purchaseId);
    if (purchase.receivedAt) {
      for (const item of items) {
        if (item.variantId) {
          const variant = await raw.get(stores.variants, item.variantId);
          if (variant) {
            variant.stockQuantity -= item.quantity;
            if (variant.isSoldByWeight) variant.stockWeight -= (item.weight || 0);
            raw.put(stores.variants, variant);
          }
        }
      }
      await removeStockLotsForItems(stores, items.map((i) => i.id));
    }
    for (const item of items) raw.delete(stores.purchaseItems, item.id);
    const payments = await raw.getByIndex(stores.purchasePayments, 'purchaseId', purchaseId);
    for (const p of payments) raw.delete(stores.purchasePayments, p.id);
    raw.delete(stores.purchases, purchaseId);
  });
}

// Приход товара "напрямую" по варианту, без закупки (порт ReceiveStockView —
// для весовых товаров: штуки + общий вес партии + сумма по счёту, цена/кг
// считается автоматически и заменяет текущую закупочную цену).
export async function receiveStockDirect(variantId, { count, weight, amount }) {
  const variant = await DB.get('variants', variantId);
  if (!variant) throw new Error('variant not found');
  const pricePerKg = weight > 0 ? amount / weight : 0;
  variant.stockQuantity += count;
  variant.stockWeight += weight;
  variant.costPrice = pricePerKg;
  if (count > 0) variant.averageWeightPerUnit = weight / count;
  await DB.put('variants', variant);
  return variant;
}
