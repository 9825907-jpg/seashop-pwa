// Регрессионные тесты бизнес-логики (js/logic.js) против fake-indexeddb —
// без браузера, но с настоящим движком IndexedDB-совместимого API.
// Запуск: cd tests && npm install && node logic.test.mjs
import 'fake-indexeddb/auto';
import { DB } from '../js/db.js';
import {
  newProduct, newVariant, newPurchase, newPurchaseItem, newOrder, newOrderItem,
  newClient, receivePurchase, completeOrder, cancelFulfillment, deleteOrderAndRestock,
  loadOrderFull, clientCredit,
} from '../js/logic.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('OK:', msg);
}

async function testFifoAndReceiving() {
  const product = newProduct({ name: 'Форель', category: 'fish' });
  await DB.add('products', product);
  const variant = newVariant({ productId: product.id, label: 'Целиком', unit: 'шт', pricePerUnit: 900, isSoldByWeight: true });
  await DB.add('variants', variant);

  const purchase = newPurchase({ supplierName: 'ООО Рыбфлот' });
  await DB.add('purchases', purchase);
  const pItem = newPurchaseItem({ purchaseId: purchase.id, variantId: variant.id, productName: 'Форель', unit: 'шт', quantity: 10, unitPrice: 200, isSoldByWeight: true });
  pItem.weight = 25;
  await DB.add('purchaseItems', pItem);
  await receivePurchase(purchase.id, { [pItem.id]: { quantity: 10, weight: 25 } });

  const v1 = await DB.get('variants', variant.id);
  assert(v1.stockQuantity === 10 && v1.stockWeight === 25, 'receivePurchase: stock updated (10 шт / 25 кг)');
  assert(Math.abs(v1.costPrice - 200) < 1e-9, 'receivePurchase: costPrice = 200/кг');
  assert(Math.abs(v1.averageWeightPerUnit - 2.5) < 1e-9, 'receivePurchase: averageWeightPerUnit = 2.5');

  const client = newClient({ name: 'Иван Иванов' });
  await DB.add('clients', client);
  const order = newOrder({ clientId: client.id });
  await DB.add('orders', order);
  const oItem = newOrderItem({ orderId: order.id, variantId: variant.id, productName: 'Форель', unit: 'шт', quantity: 4, unitPrice: 900, isSoldByWeight: true, weight: 10 });
  await DB.add('orderItems', oItem);
  await completeOrder(order.id, { amount: 9000 });

  const v2 = await DB.get('variants', variant.id);
  assert(Math.abs(v2.stockWeight - 15) < 1e-9, 'completeOrder: stockWeight decremented FIFO (15 кг осталось)');
  assert(Math.abs(v2.stockQuantity - 6) < 1e-9, 'completeOrder: stockQuantity decremented proportionally (6 шт осталось)');

  const lotCons = await DB.getByIndex('lotConsumptions', 'orderItemId', oItem.id);
  assert(lotCons.length === 1 && Math.abs(lotCons[0].costPrice - 200) < 1e-9, 'completeOrder: списание по себестоимости партии (200/кг)');
}

async function testCreditTransfer() {
  const product = newProduct({ name: 'Судак', category: 'fish' });
  await DB.add('products', product);
  const variant = newVariant({ productId: product.id, label: 'шт', unit: 'шт', pricePerUnit: 900, costPrice: 200, stockQuantity: 100 });
  await DB.add('variants', variant);
  const client = newClient({ name: 'Пётр' });
  await DB.add('clients', client);

  const order1 = newOrder({ clientId: client.id });
  await DB.add('orders', order1);
  await DB.add('orderItems', newOrderItem({ orderId: order1.id, variantId: variant.id, productName: 'Судак', unit: 'шт', quantity: 5, unitPrice: 900 }));
  await completeOrder(order1.id, { amount: 5000 }); // total 4500, оплачено 5000 -> переплата 500

  const order2 = newOrder({ clientId: client.id });
  await DB.add('orders', order2);
  await DB.add('orderItems', newOrderItem({ orderId: order2.id, variantId: variant.id, productName: 'Судак', unit: 'шт', quantity: 5, unitPrice: 900 })); // total 4500
  await completeOrder(order2.id, { amount: 0 });

  const full2 = await loadOrderFull(order2.id);
  assert(full2.amountPaid === 500 && full2.balanceDue === 4000, 'completeOrder: переплата 500 с order1 автоматически перенесена на order2');

  await cancelFulfillment(order2.id);
  const full1After = await loadOrderFull(order1.id);
  assert(full1After.overpaid === 500, 'cancelFulfillment: перенос переплаты откатывается парой проводок обратно');
}

async function testCancelAndDelete() {
  const product = newProduct({ name: 'Икра осетровая', category: 'caviar' });
  await DB.add('products', product);
  const variant = newVariant({ productId: product.id, label: '100г', unit: 'шт', pricePerUnit: 3000, costPrice: 1500, stockQuantity: 20 });
  await DB.add('variants', variant);
  const order = newOrder({});
  await DB.add('orders', order);
  const item = newOrderItem({ orderId: order.id, variantId: variant.id, productName: 'Икра осетровая', unit: 'шт', quantity: 3, unitPrice: 3000 });
  await DB.add('orderItems', item);
  await completeOrder(order.id, { amount: 9000 });
  assert((await DB.get('variants', variant.id)).stockQuantity === 17, 'completeOrder: списано 3 шт со склада');
  await cancelFulfillment(order.id);
  assert((await DB.get('variants', variant.id)).stockQuantity === 20, 'cancelFulfillment: склад восстановлен');
  assert((await DB.getByIndex('orderPayments', 'orderId', order.id)).length === 0, 'cancelFulfillment: платёж по выдаче удалён');

  await completeOrder(order.id, { amount: 9000 });
  await deleteOrderAndRestock(order.id);
  assert((await DB.get('variants', variant.id)).stockQuantity === 20, 'deleteOrderAndRestock: склад восстановлен при удалении');
  assert(!(await DB.get('orders', order.id)), 'deleteOrderAndRestock: заказ удалён');
}

async function testReceivingUnitMismatch() {
  const product = newProduct({ name: 'Креветка', category: 'seafood' });
  await DB.add('products', product);
  const variant = newVariant({ productId: product.id, label: 'кор.', unit: 'шт', pricePerUnit: 50, isSoldByWeight: false });
  await DB.add('variants', variant);
  const purchase = newPurchase({ supplierName: 'Test' });
  await DB.add('purchases', purchase);
  const item = newPurchaseItem({ purchaseId: purchase.id, variantId: variant.id, productName: 'Креветка', unit: 'кг', quantity: 20, unitPrice: 300, isSoldByWeight: true, weight: 3 });
  await DB.add('purchaseItems', item);
  await receivePurchase(purchase.id, { [item.id]: { quantity: 20, weight: 3 } });
  const v = await DB.get('variants', variant.id);
  assert(Math.abs(v.costPrice - 45) < 1e-9, 'receivePurchase: конвертация цены при несовпадении единиц (900/20=45)');
}

await testFifoAndReceiving();
await testCreditTransfer();
await testCancelAndDelete();
await testReceivingUnitMismatch();

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
