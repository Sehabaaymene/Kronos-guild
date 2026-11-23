import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/types';
import { adjustStock } from '../src/domain/adjustments';
import { runAlertChecks, listNotifications } from '../src/domain/alerts';
import { exportTables, importTables, makeBackup, validateBackup } from '../src/domain/backup';
import { getProduct, listProducts, searchBrands, searchModels, updateProduct } from '../src/domain/catalog';
import { BusinessError } from '../src/domain/core';
import { addDays, today } from '../src/domain/dates';
import { createExpense, deleteExpense, listExpenseCategories, listExpenses, updateExpense } from '../src/domain/expenses';
import { getInventorySnapshot, getPeriodMetrics, getReceivables, getSeries, salesByBrand } from '../src/domain/finance';
import { checkGoalMilestones, createGoal, goalProgress, updateGoal, type Goal } from '../src/domain/goals';
import { dzd, formatMoney, parseMoney } from '../src/domain/money';
import { createPurchase, deletePurchase, getBatch, listBatches, updatePurchase } from '../src/domain/purchases';
import { addPayment, cancelSale, createSale, getSale, updateSale } from '../src/domain/sales';
import { purchasesCSV, toCSV } from '../src/domain/exports';
import { freshDb } from './helpers/nodeDb';

const ALL = { from: null, to: null };
const D = '2026-10-10';

async function buy(db: Db, qty: number, cost: number, opts: Partial<Parameters<typeof createPurchase>[1]> = {}) {
  return createPurchase(db, {
    brandName: 'Casio',
    model: 'G-Shock GA-2100',
    quantity: qty,
    unitCost: dzd(cost),
    expectedSellingPrice: dzd(12000),
    purchaseDate: D,
    ...opts,
  });
}

async function stockOf(db: Db, batchId: string) {
  return (await getBatch(db, batchId))!.quantity_remaining;
}

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

// ---------------------------------------------------------------- FINANCIAL ACCURACY (spec example)
describe('financial accuracy — reference scenario', () => {
  it('5 @ 8,000 + 3 @ 9,000, sell 2 from first batch @ 12,000', async () => {
    const a = await buy(db, 5, 8000, { purchaseDate: '2026-10-10' });
    const b = await buy(db, 3, 9000, { purchaseDate: '2026-10-20' });
    await createSale(db, {
      saleDate: '2026-10-25',
      items: [{ batchId: a.batchId, quantity: 2, unitPrice: dzd(12000) }],
      amountReceived: dzd(24000),
    });

    const m = await getPeriodMetrics(db, ALL);
    expect(m.revenue).toBe(dzd(24000));
    expect(m.cogs).toBe(dzd(16000));
    expect(m.grossProfit).toBe(dzd(8000));
    expect(await stockOf(db, a.batchId)).toBe(3);
    expect(await stockOf(db, b.batchId)).toBe(3);

    const inv = await getInventorySnapshot(db);
    expect(inv.unitsInStock).toBe(6);
    expect(inv.inventoryValue).toBe(dzd(51000));
    expect(m.netProfit).toBe(dzd(8000));
    expect(m.avgProfitPerWatch).toBe(dzd(4000));
  });
});

// ---------------------------------------------------------------- PURCHASES
describe('purchases', () => {
  it('creates a brand and a model on first purchase', async () => {
    await buy(db, 5, 8000);
    const brands = await searchBrands(db, 'cas');
    expect(brands.map((b) => b.name)).toEqual(['Casio']);
    const models = await searchModels(db, 'casio', '');
    expect(models.map((m) => m.model)).toEqual(['G-Shock GA-2100']);
  });

  it('same model at a different price creates a second batch without overwriting the first', async () => {
    const a = await buy(db, 5, 8000);
    const b = await buy(db, 3, 9000, { brandName: '  casio ', model: 'g-shock ga-2100' });
    const products = await listProducts(db);
    expect(products).toHaveLength(1);
    expect(products[0].stock).toBe(8);
    expect((await getBatch(db, a.batchId))!.unit_cost).toBe(dzd(8000));
    expect((await getBatch(db, b.batchId))!.unit_cost).toBe(dzd(9000));
    expect(a.reference).toBe('P-0001');
    expect(b.reference).toBe('P-0002');
  });

  it('a double-submitted form never creates a duplicate purchase', async () => {
    const first = await buy(db, 5, 8000, { requestId: 'req-1' });
    const second = await buy(db, 5, 8000, { requestId: 'req-1' });
    expect(second.duplicate).toBe(true);
    expect(second.batchId).toBe(first.batchId);
    expect((await listBatches(db)).length).toBe(1);
  });

  it('rejects invalid input', async () => {
    await expect(buy(db, 0, 8000)).rejects.toThrow(BusinessError);
    await expect(buy(db, 2, 8000, { brandName: '  ' })).rejects.toThrow('Brand is required');
    await expect(buy(db, 2, 8000, { purchaseDate: '2026-02-30' })).rejects.toThrow('date');
  });

  it('edit recalculates stock and refuses quantities below what was sold', async () => {
    const a = await buy(db, 5, 8000);
    await createSale(db, { saleDate: D, items: [{ batchId: a.batchId, quantity: 2, unitPrice: dzd(12000) }], amountReceived: 0 });
    const base = { id: a.batchId, brandName: 'Casio', model: 'G-Shock GA-2100', unitCost: dzd(8000), expectedSellingPrice: dzd(12000), purchaseDate: D };
    await expect(updatePurchase(db, { ...base, quantity: 1 })).rejects.toThrow('cannot be lower than 2');
    await updatePurchase(db, { ...base, quantity: 7 });
    expect(await stockOf(db, a.batchId)).toBe(5);
    await updatePurchase(db, { ...base, quantity: 2 });
    expect(await stockOf(db, a.batchId)).toBe(0);
  });

  it('cost correction keeps historical sale cost unless asked to apply it', async () => {
    const a = await buy(db, 5, 8000);
    await createSale(db, { saleDate: D, items: [{ batchId: a.batchId, quantity: 2, unitPrice: dzd(12000) }], amountReceived: 0 });
    const base = { id: a.batchId, brandName: 'Casio', model: 'G-Shock GA-2100', quantity: 5, expectedSellingPrice: dzd(12000), purchaseDate: D };
    await updatePurchase(db, { ...base, unitCost: dzd(7000) });
    expect((await getPeriodMetrics(db, ALL)).cogs).toBe(dzd(16000)); // snapshot preserved
    expect((await getInventorySnapshot(db)).inventoryValue).toBe(dzd(21000)); // remaining stock at corrected cost
    await updatePurchase(db, { ...base, unitCost: dzd(7000), applyCostToExistingSales: true });
    const m = await getPeriodMetrics(db, ALL);
    expect(m.cogs).toBe(dzd(14000));
    expect(m.grossProfit).toBe(dzd(10000));
  });

  it('model correction moves the batch and its sales to the right model', async () => {
    const a = await buy(db, 3, 8000, { model: 'GA-210' }); // typo
    await createSale(db, { saleDate: D, items: [{ batchId: a.batchId, quantity: 1, unitPrice: dzd(12000) }], amountReceived: 0 });
    await updatePurchase(db, { id: a.batchId, brandName: 'Casio', model: 'GA-2100', quantity: 3, unitCost: dzd(8000), expectedSellingPrice: dzd(12000), purchaseDate: D });
    const products = await listProducts(db);
    expect(products.map((p) => p.model)).toEqual(['GA-2100']);
    expect(products[0].quantity_sold).toBe(1);
    expect(products[0].stock).toBe(2);
  });

  it('additional costs: inventory mode raises unit cost; expense mode creates a linked expense', async () => {
    const a = await buy(db, 4, 8000, { additionalCost: dzd(2000), additionalCostMode: 'inventory' });
    expect((await getInventorySnapshot(db)).inventoryValue).toBe(dzd(34000));
    await createSale(db, { saleDate: D, items: [{ batchId: a.batchId, quantity: 1, unitPrice: dzd(12000) }], amountReceived: 0 });
    expect((await getPeriodMetrics(db, ALL)).cogs).toBe(dzd(8500));

    const db2 = await freshDb();
    const b = await buy(db2, 4, 8000, { additionalCost: dzd(2000), additionalCostMode: 'expense' });
    expect((await getInventorySnapshot(db2)).inventoryValue).toBe(dzd(32000));
    const exps = await listExpenses(db2);
    expect(exps).toHaveLength(1);
    expect(exps[0].amount).toBe(dzd(2000));
    expect((await getPeriodMetrics(db2, ALL)).operatingExpenses).toBe(dzd(2000));
    // Switching to inventory mode removes the linked expense (never counted twice).
    await updatePurchase(db2, { id: b.batchId, brandName: 'Casio', model: 'G-Shock GA-2100', quantity: 4, unitCost: dzd(8000), expectedSellingPrice: dzd(12000), purchaseDate: D, additionalCost: dzd(2000), additionalCostMode: 'inventory' });
    expect(await listExpenses(db2)).toHaveLength(0);
    expect((await getInventorySnapshot(db2)).inventoryValue).toBe(dzd(34000));
  });

  it('purchases are inventory (an asset), not an operating expense', async () => {
    await buy(db, 5, 8000);
    const m = await getPeriodMetrics(db, ALL);
    expect(m.operatingExpenses).toBe(0);
    expect(m.netProfit).toBe(0);
    expect(m.purchasesSpent).toBe(dzd(40000));
  });

  it('a purchase with sales cannot be deleted; an untouched one can', async () => {
    const a = await buy(db, 2, 8000);
    const b = await buy(db, 2, 8000);
    await createSale(db, { saleDate: D, items: [{ batchId: a.batchId, quantity: 1, unitPrice: dzd(12000) }], amountReceived: 0 });
    await expect(deletePurchase(db, a.batchId)).rejects.toThrow(BusinessError);
    await deletePurchase(db, b.batchId);
    expect(await listBatches(db)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- SALES
describe('sales', () => {
  it('sells several watches from one batch', async () => {
    const a = await buy(db, 5, 8000);
    await createSale(db, { saleDate: D, items: [{ batchId: a.batchId, quantity: 3, unitPrice: dzd(11000) }], amountReceived: dzd(33000) });
    expect(await stockOf(db, a.batchId)).toBe(2);
    const m = await getPeriodMetrics(db, ALL);
    expect(m.revenue).toBe(dzd(33000));
    expect(m.grossProfit).toBe(dzd(9000));
  });

  it('sells from multiple batches in one transaction with each batch cost', async () => {
    const a = await buy(db, 5, 8000);
    const b = await buy(db, 3, 9000);
    const { saleId } = await createSale(db, {
      saleDate: D,
      items: [
        { batchId: a.batchId, quantity: 1, unitPrice: dzd(12000) },
        { batchId: b.batchId, quantity: 2, unitPrice: dzd(12500) },
      ],
      amountReceived: 0,
    });
    const s = (await getSale(db, saleId))!;
    expect(s.sale.total_revenue).toBe(dzd(37000));
    expect(s.sale.total_cost).toBe(dzd(26000));
    expect(s.sale.gross_profit).toBe(dzd(11000));
    expect(await stockOf(db, a.batchId)).toBe(4);
    expect(await stockOf(db, b.batchId)).toBe(1);
  });

  it('saves the real negotiated price, not the product default', async () => {
    const a = await buy(db, 2, 8000);
    const { saleId } = await createSale(db, { saleDate: D, items: [{ batchId: a.batchId, quantity: 1, unitPrice: dzd(10500) }], amountReceived: 0 });
    const p = (await listProducts(db))[0];
    await updateProduct(db, { id: p.id, brandName: 'Casio', model: p.model, defaultSellingPrice: dzd(15000), lowStockThreshold: 1 });
    expect((await getSale(db, saleId))!.items[0].unit_selling_price).toBe(dzd(10500));
  });

  it('refuses to sell more than available and leaves nothing half-done', async () => {
    const a = await buy(db, 2, 8000);
    const b = await buy(db, 1, 9000);
    await expect(
      createSale(db, {
        saleDate: D,
        items: [
          { batchId: a.batchId, quantity: 1, unitPrice: dzd(12000) },
          { batchId: b.batchId, quantity: 2, unitPrice: dzd(12000) },
        ],
        amountReceived: 0,
      }),
    ).rejects.toThrow('Not enough stock');
    expect(await stockOf(db, a.batchId)).toBe(2);
    expect(await stockOf(db, b.batchId)).toBe(1);
    expect((await getPeriodMetrics(db, ALL)).salesCount).toBe(0);
    // Same batch split over two lines is checked as a total
    await expect(
      createSale(db, { saleDate: D, items: [{ batchId: a.batchId, quantity: 2, unitPrice: 1 }, { batchId: a.batchId, quantity: 1, unitPrice: 1 }], amountReceived: 0 }),
    ).rejects.toThrow('Not enough stock');
  });

  it('cancel restores the exact quantities to the original batches and removes revenue', async () => {
    const a = await buy(db, 5, 8000);
    const b = await buy(db, 3, 9000);
    const { saleId } = await createSale(db, {
      saleDate: D,
      items: [{ batchId: a.batchId, quantity: 2, unitPrice: dzd(12000) }, { batchId: b.batchId, quantity: 1, unitPrice: dzd(12000) }],
      amountReceived: dzd(36000),
    });
    await cancelSale(db, saleId, 'Customer refused delivery');
    expect(await stockOf(db, a.batchId)).toBe(5);
    expect(await stockOf(db, b.batchId)).toBe(3);
    const m = await getPeriodMetrics(db, ALL);
    expect(m.revenue).toBe(0);
    expect(m.grossProfit).toBe(0);
    expect(m.cashCollected).toBe(0); // refund recorded
    const s = (await getSale(db, saleId))!;
    expect(s.sale.status).toBe('cancelled');
    expect(s.items).toHaveLength(2); // history kept
    expect(s.payments.map((p) => p.kind)).toEqual(['payment', 'refund']);
    await expect(cancelSale(db, saleId)).rejects.toThrow('already cancelled');
  });

  it('editing a sale changes batch, quantity and price with stock re-balanced', async () => {
    const a = await buy(db, 5, 8000);
    const b = await buy(db, 3, 9000);
    const { saleId } = await createSale(db, { saleDate: D, items: [{ batchId: a.batchId, quantity: 2, unitPrice: dzd(12000) }], amountReceived: 0 });
    await updateSale(db, { id: saleId, saleDate: D, items: [{ batchId: b.batchId, quantity: 3, unitPrice: dzd(13000) }], amountReceived: dzd(10000) });
    expect(await stockOf(db, a.batchId)).toBe(5);
    expect(await stockOf(db, b.batchId)).toBe(0);
    const s = (await getSale(db, saleId))!.sale;
    expect(s.total_revenue).toBe(dzd(39000));
    expect(s.total_cost).toBe(dzd(27000));
    expect(s.payment_status).toBe('partial');
    // An invalid edit rolls back completely
    await expect(updateSale(db, { id: saleId, saleDate: D, items: [{ batchId: a.batchId, quantity: 9, unitPrice: 1 }], amountReceived: 0 })).rejects.toThrow();
    expect(await stockOf(db, b.batchId)).toBe(0);
    expect(await stockOf(db, a.batchId)).toBe(5);
  });

  it('unpaid sales are revenue but not cash; partial payments tracked separately', async () => {
    const a = await buy(db, 5, 8000);
    const { saleId } = await createSale(db, { saleDate: D, items: [{ batchId: a.batchId, quantity: 1, unitPrice: dzd(12000) }], deliveryFeeCharged: dzd(500), amountReceived: 0 });
    let m = await getPeriodMetrics(db, ALL);
    expect(m.revenue).toBe(dzd(12500));
    expect(m.cashCollected).toBe(0);
    expect((await getReceivables(db)).outstanding).toBe(dzd(12500));
    await addPayment(db, { saleId, amount: dzd(5000), paymentDate: D });
    expect((await getSale(db, saleId))!.sale.payment_status).toBe('partial');
    await expect(addPayment(db, { saleId, amount: dzd(8000), paymentDate: D })).rejects.toThrow('exceeds');
    await addPayment(db, { saleId, amount: dzd(7500), paymentDate: D });
    expect((await getSale(db, saleId))!.sale.payment_status).toBe('paid');
    m = await getPeriodMetrics(db, ALL);
    expect(m.cashCollected).toBe(dzd(12500));
    expect((await getReceivables(db)).outstanding).toBe(0);
  });

  it('double-submitted sale is recorded once', async () => {
    const a = await buy(db, 5, 8000);
    const input = { requestId: 'sale-req', saleDate: D, items: [{ batchId: a.batchId, quantity: 1, unitPrice: dzd(12000) }], amountReceived: 0 };
    await createSale(db, input);
    const again = await createSale(db, input);
    expect(again.duplicate).toBe(true);
    expect(await stockOf(db, a.batchId)).toBe(4);
  });

  it('stock adjustments: losses reduce net profit, stock never negative', async () => {
    const a = await buy(db, 3, 8000);
    await adjustStock(db, { batchId: a.batchId, quantityChange: -1, reason: 'damaged', date: D });
    expect(await stockOf(db, a.batchId)).toBe(2);
    expect((await getPeriodMetrics(db, ALL)).netProfit).toBe(-dzd(8000));
    await expect(adjustStock(db, { batchId: a.batchId, quantityChange: -3, reason: 'lost', date: D })).rejects.toThrow();
    await expect(adjustStock(db, { batchId: a.batchId, quantityChange: 2, reason: 'found', date: D })).rejects.toThrow('Only 1 unit');
    await adjustStock(db, { batchId: a.batchId, quantityChange: 1, reason: 'found', date: D });
    expect((await getPeriodMetrics(db, ALL)).netProfit).toBe(0);
  });
});

// ---------------------------------------------------------------- EXPENSES
describe('expenses', () => {
  it('add, edit and delete expenses update net profit', async () => {
    const a = await buy(db, 5, 8000);
    await createSale(db, { saleDate: D, items: [{ batchId: a.batchId, quantity: 2, unitPrice: dzd(12000) }], amountReceived: 0 });
    const ads = (await listExpenseCategories(db)).find((c) => c.name === 'Instagram/Facebook ads')!;
    const e = await createExpense(db, { categoryId: ads.id, title: 'Boosted post', amount: dzd(3000), expenseDate: D });
    expect((await getPeriodMetrics(db, ALL)).netProfit).toBe(dzd(5000));
    await updateExpense(db, e.id, { categoryId: ads.id, title: 'Boosted post', amount: dzd(1000), expenseDate: D });
    expect((await getPeriodMetrics(db, ALL)).netProfit).toBe(dzd(7000));
    await deleteExpense(db, e.id);
    expect((await getPeriodMetrics(db, ALL)).netProfit).toBe(dzd(8000));
  });

  it('respects the selected period', async () => {
    const cat = (await listExpenseCategories(db))[0];
    await createExpense(db, { categoryId: cat.id, title: 'Old', amount: dzd(100), expenseDate: '2026-01-05' });
    await createExpense(db, { categoryId: cat.id, title: 'New', amount: dzd(200), expenseDate: '2026-10-05' });
    expect((await getPeriodMetrics(db, { from: '2026-10-01', to: '2026-10-31' })).operatingExpenses).toBe(dzd(200));
    expect((await getPeriodMetrics(db, ALL)).operatingExpenses).toBe(dzd(300));
  });
});

// ---------------------------------------------------------------- GOALS & ALERTS
describe('goals and alerts', () => {
  it('progress follows real transactions; milestones notify once; cancellations count down', async () => {
    const t = today();
    const a = await buy(db, 10, 8000, { purchaseDate: t });
    const id = await createGoal(db, { title: 'Monthly profit', metric: 'net_profit', period: 'monthly', targetValue: dzd(10000), startDate: addDays(t, -1), endDate: addDays(t, 10) });
    const goal = () => db.get<Goal>('SELECT * FROM goals WHERE id = ?', [id]) as Promise<Goal>;

    const s1 = await createSale(db, { saleDate: t, items: [{ batchId: a.batchId, quantity: 2, unitPrice: dzd(11000) }], amountReceived: 0 }); // +6000 = 60%
    let p = await goalProgress(db, await goal(), t);
    expect(p.percent).toBe(60);
    expect(p.remaining).toBe(dzd(4000));
    let events = await checkGoalMilestones(db, t);
    expect(events.map((e) => e.title)).toEqual(['50% of “Monthly profit”']);
    expect(await checkGoalMilestones(db, t)).toEqual([]); // no repeat

    await createSale(db, { saleDate: t, items: [{ batchId: a.batchId, quantity: 2, unitPrice: dzd(11000) }], amountReceived: 0 }); // 120%
    events = await checkGoalMilestones(db, t);
    expect(events.map((e) => e.title)).toEqual(['75% of “Monthly profit”', 'Goal reached: Monthly profit', 'Goal exceeded: Monthly profit']);

    await cancelSale(db, s1.saleId);
    p = await goalProgress(db, await goal(), t);
    expect(p.percent).toBe(60);
    expect(await checkGoalMilestones(db, t)).toEqual([]);

    // Raising the target re-arms milestones against the new target
    const g = await goal();
    await updateGoal(db, id, { title: g.title, metric: g.metric, period: g.period, targetValue: dzd(12000), startDate: g.start_date, endDate: g.end_date });
    expect((await checkGoalMilestones(db, t)).map((e) => e.title)).toEqual(['50% of “Monthly profit”']);
  });

  it('units-sold and revenue goals', async () => {
    const t = today();
    const a = await buy(db, 10, 8000, { purchaseDate: t });
    await createSale(db, { saleDate: t, items: [{ batchId: a.batchId, quantity: 3, unitPrice: dzd(12000) }], amountReceived: 0 });
    const units = await createGoal(db, { title: 'Weekly watches', metric: 'units_sold', period: 'weekly', targetValue: 4, startDate: t, endDate: t });
    const rev = await createGoal(db, { title: 'Revenue', metric: 'revenue', period: 'yearly', targetValue: dzd(72000), startDate: t, endDate: t });
    const cash = await createGoal(db, { title: 'Cash', metric: 'cash_collected', period: 'monthly', targetValue: dzd(1000), startDate: t, endDate: t });
    const get = async (id: string) => goalProgress(db, (await db.get<Goal>('SELECT * FROM goals WHERE id=?', [id]))!, t);
    expect((await get(units)).percent).toBe(75);
    expect((await get(rev)).percent).toBe(50);
    expect((await get(cash)).current).toBe(0); // unpaid ≠ cash
  });

  it('low-stock alerts fire once per drop and re-arm after restock', async () => {
    const a = await buy(db, 3, 8000);
    const p = (await listProducts(db))[0];
    await updateProduct(db, { id: p.id, brandName: 'Casio', model: p.model, defaultSellingPrice: dzd(12000), lowStockThreshold: 2 });
    expect((await runAlertChecks(db)).filter((e) => e.kind === 'stock')).toHaveLength(0);
    await createSale(db, { saleDate: D, items: [{ batchId: a.batchId, quantity: 1, unitPrice: dzd(12000) }], amountReceived: dzd(12000) });
    expect((await runAlertChecks(db)).map((e) => e.title)).toEqual(['Low stock: Casio G-Shock GA-2100']);
    expect((await runAlertChecks(db)).filter((e) => e.kind === 'stock')).toHaveLength(0);
    await createSale(db, { saleDate: D, items: [{ batchId: a.batchId, quantity: 2, unitPrice: dzd(12000) }], amountReceived: dzd(24000) });
    expect((await runAlertChecks(db)).map((e) => e.title)).toEqual(['Out of stock: Casio G-Shock GA-2100']);
    await buy(db, 5, 8000);
    await runAlertChecks(db);
    expect((await getProduct(db, p.id))!.stock_alert_state).toBe('ok');
    const notes = await listNotifications(db);
    expect(notes.filter((n) => n.type === 'low_stock')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- REPORTS, BACKUP, MONEY
describe('reports, backup and money formatting', () => {
  it('series and breakdowns use real data', async () => {
    const a = await buy(db, 5, 8000, { purchaseDate: '2026-10-01' });
    const b = await buy(db, 2, 20000, { brandName: 'Seiko', model: '5 SRPD', purchaseDate: '2026-10-01' });
    await createSale(db, { saleDate: '2026-10-02', items: [{ batchId: a.batchId, quantity: 1, unitPrice: dzd(12000) }], amountReceived: 0 });
    await createSale(db, { saleDate: '2026-10-05', items: [{ batchId: b.batchId, quantity: 1, unitPrice: dzd(30000) }], amountReceived: 0 });
    const { points } = await getSeries(db, { from: '2026-10-01', to: '2026-10-07' }, 'day');
    expect(points).toHaveLength(7);
    expect(points.find((p) => p.key === '2026-10-05')!.netProfit).toBe(dzd(10000));
    const brands = await salesByBrand(db, ALL);
    expect(brands.map((r) => [r.label, r.profit])).toEqual([['Seiko', dzd(10000)], ['Casio', dzd(4000)]]);
  });

  it('backup → wipe → restore returns identical data', async () => {
    const a = await buy(db, 5, 8000);
    await createSale(db, { saleDate: D, items: [{ batchId: a.batchId, quantity: 2, unitPrice: dzd(12000) }], amountReceived: dzd(24000) });
    const before = await getPeriodMetrics(db, ALL);
    const { tables } = await exportTables(db);
    const backup = validateBackup(JSON.parse(JSON.stringify(makeBackup(tables, { 'images/x.jpg': 'AAAA' }))));
    const other = await freshDb();
    await importTables(other, backup);
    expect(await getPeriodMetrics(other, ALL)).toEqual(before);
    expect((await getInventorySnapshot(other)).inventoryValue).toBe(dzd(24000));
    expect(() => validateBackup({ hello: 1 })).toThrow('not a Watch Business backup');
  });

  it('CSV export is spreadsheet-safe', async () => {
    await buy(db, 1, 8000, { notes: '=HYPERLINK("x")', supplierName: 'Ali, "Best" watches' });
    const csv = await purchasesCSV(db);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(`"Ali, ""Best"" watches"`);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(toCSV(['a'], [[-5]])).toContain('-5');
  });

  it('parses and formats DZD amounts without floating point errors', () => {
    expect(parseMoney('12 000')).toBe(1_200_000);
    expect(parseMoney('12,000')).toBe(1_200_000);
    expect(parseMoney('8500.5')).toBe(850_050);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('-5')).toBeNull();
    expect(formatMoney(dzd(51000))).toBe('51,000 DZD');
    expect(formatMoney(-dzd(1234.5))).toBe('−1,234.50 DZD');
    expect(dzd(0.1) + dzd(0.2)).toBe(dzd(0.3));
  });
});
