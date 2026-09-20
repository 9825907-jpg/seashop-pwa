// Экспорт/импорт данных (JSON) — порт Support/DataTransfer.swift. Раздельно
// по товарам, заказам и закупкам; клиент/поставщик — по имени и телефону,
// без синтетических id для связи "один ко многим". Импорт восстанавливает
// записи КАК ЕСТЬ (включая уже проставленные даты выдачи/проведения) и НЕ
// списывает/пополняет склад повторно — это исторические факты бэкапа.
// Порядок импорта: сначала "Товары", потом "Закупки" и "Заказы".
import { DB } from './db.js';
import { newProduct, newVariant, newClient, newSupplier, newOrder, newOrderItem, newOrderPayment, newPurchase, newPurchaseItem, newPurchasePayment } from './logic.js';

function download(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportProducts() {
  const [products, variants] = await Promise.all([DB.getAll('products'), DB.getAll('variants')]);
  const data = products.map((p) => ({
    name: p.name,
    category: p.category,
    variants: variants.filter((v) => v.productId === p.id).map((v) => ({
      label: v.label, unit: v.unit, pricePerUnit: v.pricePerUnit, costPrice: v.costPrice,
      stockQuantity: v.stockQuantity, isSoldByWeight: v.isSoldByWeight,
      averageWeightPerUnit: v.averageWeightPerUnit, stockWeight: v.stockWeight, packageWeightKg: v.packageWeightKg,
    })),
  }));
  download('seashop-products.json', data);
}

export async function exportOrders() {
  const [orders, items, payments, clients] = await Promise.all([
    DB.getAll('orders'), DB.getAll('orderItems'), DB.getAll('orderPayments'), DB.getAll('clients'),
  ]);
  const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const variants = await DB.getAll('variants');
  const variantsById = Object.fromEntries(variants.map((v) => [v.id, v]));
  const products = await DB.getAll('products');
  const productsById = Object.fromEntries(products.map((p) => [p.id, p]));

  const data = orders.map((o) => {
    const client = o.clientId ? clientsById[o.clientId] : null;
    return {
      createdAt: o.createdAt,
      comment: o.comment,
      clientName: client ? client.name : null,
      clientPhone: client ? client.phone : null,
      deliveryDate: o.deliveryDate,
      deliveryTimeFrom: o.deliveryTimeFrom,
      deliveryTimeTo: o.deliveryTimeTo,
      fulfilledAt: o.fulfilledAt,
      items: items.filter((i) => i.orderId === o.id).map((i) => {
        const v = i.variantId ? variantsById[i.variantId] : null;
        const vProduct = v ? productsById[v.productId] : null;
        return {
          productName: i.productName, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice,
          weight: i.weight, isSoldByWeight: i.isSoldByWeight,
          variantProductName: vProduct ? vProduct.name : null,
          variantLabel: v ? v.label : null,
        };
      }),
      payments: payments.filter((p) => p.orderId === o.id).map((p) => ({ amount: p.amount, date: p.date, note: p.note, transferGroupId: p.transferGroupId })),
    };
  });
  download('seashop-orders.json', data);
}

export async function exportPurchases() {
  const [purchases, items, payments, suppliers] = await Promise.all([
    DB.getAll('purchases'), DB.getAll('purchaseItems'), DB.getAll('purchasePayments'), DB.getAll('suppliers'),
  ]);
  const suppliersById = Object.fromEntries(suppliers.map((s) => [s.id, s]));
  const variants = await DB.getAll('variants');
  const variantsById = Object.fromEntries(variants.map((v) => [v.id, v]));
  const products = await DB.getAll('products');
  const productsById = Object.fromEntries(products.map((p) => [p.id, p]));

  const data = purchases.map((p) => {
    const supplier = p.supplierId ? suppliersById[p.supplierId] : null;
    return {
      createdAt: p.createdAt,
      comment: p.comment,
      supplierName: supplier ? supplier.name : p.supplierName,
      supplierPhone: supplier ? supplier.phone : null,
      receivedAt: p.receivedAt,
      items: items.filter((i) => i.purchaseId === p.id).map((i) => {
        const v = i.variantId ? variantsById[i.variantId] : null;
        const vProduct = v ? productsById[v.productId] : null;
        return {
          productName: i.productName, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice,
          weight: i.weight, isSoldByWeight: i.isSoldByWeight,
          variantProductName: vProduct ? vProduct.name : null,
          variantLabel: v ? v.label : null,
        };
      }),
      payments: payments.filter((pp) => pp.purchaseId === p.id).map((pp) => ({ amount: pp.amount, date: pp.date })),
    };
  });
  download('seashop-purchases.json', data);
}

async function resolveVariant(entry, cache) {
  const productName = entry.variantProductName || entry.productName;
  const label = entry.variantLabel || entry.unit;
  let product = cache.products.find((p) => p.name.toLowerCase() === productName.toLowerCase());
  if (!product) {
    product = newProduct({ name: productName, category: 'seafood' });
    await DB.add('products', product);
    cache.products.push(product);
  }
  let variant = cache.variants.find((v) => v.productId === product.id && v.label.toLowerCase() === label.toLowerCase());
  if (!variant) {
    variant = newVariant({ productId: product.id, label, unit: entry.unit, pricePerUnit: entry.unitPrice, stockQuantity: 0, isSoldByWeight: entry.isSoldByWeight });
    await DB.add('variants', variant);
    cache.variants.push(variant);
  }
  return variant;
}

async function resolveClient(name, phone, cache) {
  if (!name) return null;
  let match = phone ? cache.find((c) => c.phone === phone) : null;
  if (!match) match = cache.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (match) return match;
  const client = newClient({ name, phone: phone || '' });
  await DB.add('clients', client);
  cache.push(client);
  return client;
}

async function resolveSupplier(name, phone, cache) {
  if (!name) return null;
  let match = phone ? cache.find((s) => s.phone === phone) : null;
  if (!match) match = cache.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (match) return match;
  const supplier = newSupplier({ name, phone: phone || '' });
  await DB.add('suppliers', supplier);
  cache.push(supplier);
  return supplier;
}

export async function importProducts(file) {
  const text = await file.text();
  let items;
  try { items = JSON.parse(text); } catch { throw new Error('Неверный файл'); }
  const existingProducts = await DB.getAll('products');
  const existingVariants = await DB.getAll('variants');
  for (const entry of items) {
    let product = existingProducts.find((p) => p.name.toLowerCase() === entry.name.toLowerCase());
    if (!product) { product = newProduct({ name: entry.name, category: entry.category || 'seafood' }); await DB.add('products', product); existingProducts.push(product); }
    else { product.category = entry.category || product.category; await DB.put('products', product); }
    for (const ve of entry.variants || []) {
      let variant = existingVariants.find((v) => v.productId === product.id && v.label.toLowerCase() === ve.label.toLowerCase());
      if (variant) {
        Object.assign(variant, { unit: ve.unit, pricePerUnit: ve.pricePerUnit, costPrice: ve.costPrice, stockQuantity: ve.stockQuantity, isSoldByWeight: ve.isSoldByWeight, averageWeightPerUnit: ve.averageWeightPerUnit, stockWeight: ve.stockWeight, packageWeightKg: ve.packageWeightKg || 0 });
        await DB.put('variants', variant);
      } else {
        variant = newVariant({ productId: product.id, ...ve });
        await DB.add('variants', variant);
        existingVariants.push(variant);
      }
    }
  }
  return items.length;
}

export async function importOrders(file) {
  const text = await file.text();
  let items;
  try { items = JSON.parse(text); } catch { throw new Error('Неверный файл'); }
  const clientsCache = await DB.getAll('clients');
  const productsCache = await DB.getAll('products');
  const variantsCache = await DB.getAll('variants');
  for (const entry of items) {
    const client = await resolveClient(entry.clientName, entry.clientPhone, clientsCache);
    const order = newOrder({ clientId: client ? client.id : null, comment: entry.comment || '' });
    order.createdAt = entry.createdAt;
    order.deliveryDate = entry.deliveryDate;
    order.deliveryTimeFrom = entry.deliveryTimeFrom;
    order.deliveryTimeTo = entry.deliveryTimeTo;
    order.fulfilledAt = entry.fulfilledAt;
    await DB.add('orders', order);
    for (const ie of entry.items || []) {
      const variant = await resolveVariant(ie, { products: productsCache, variants: variantsCache });
      await DB.add('orderItems', newOrderItem({ orderId: order.id, variantId: variant.id, productName: ie.productName, unit: ie.unit, quantity: ie.quantity, unitPrice: ie.unitPrice, weight: ie.weight, isSoldByWeight: ie.isSoldByWeight }));
    }
    for (const pe of entry.payments || []) {
      await DB.add('orderPayments', newOrderPayment({ orderId: order.id, amount: pe.amount, date: pe.date, note: pe.note || null, transferGroupId: pe.transferGroupId || null }));
    }
  }
  return items.length;
}

export async function importPurchases(file) {
  const text = await file.text();
  let items;
  try { items = JSON.parse(text); } catch { throw new Error('Неверный файл'); }
  const suppliersCache = await DB.getAll('suppliers');
  const productsCache = await DB.getAll('products');
  const variantsCache = await DB.getAll('variants');
  for (const entry of items) {
    const supplier = await resolveSupplier(entry.supplierName, entry.supplierPhone, suppliersCache);
    const purchase = newPurchase({ supplierId: supplier ? supplier.id : null, supplierName: entry.supplierName || (supplier ? supplier.name : ''), comment: entry.comment || '' });
    purchase.createdAt = entry.createdAt;
    purchase.receivedAt = entry.receivedAt;
    await DB.add('purchases', purchase);
    for (const ie of entry.items || []) {
      const variant = await resolveVariant(ie, { products: productsCache, variants: variantsCache });
      await DB.add('purchaseItems', newPurchaseItem({ purchaseId: purchase.id, variantId: variant.id, productName: ie.productName, unit: ie.unit, quantity: ie.quantity, unitPrice: ie.unitPrice, weight: ie.weight, isSoldByWeight: ie.isSoldByWeight }));
    }
    for (const pe of entry.payments || []) {
      await DB.add('purchasePayments', newPurchasePayment({ purchaseId: purchase.id, amount: pe.amount, date: pe.date }));
    }
  }
  return items.length;
}
