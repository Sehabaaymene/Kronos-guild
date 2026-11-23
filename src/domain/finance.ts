import type { Db, SqlValue } from '../db/types';
import { BATCH_VALUE_SQL } from './catalog';
import { bucketForRange, bucketKey, bucketLabel, daysBetween, nextBucket, today, type Bucket, type DateRange } from './dates';
import type { Money } from './money';

/**
 * ACCOUNTING RULES (single source of truth for every figure in the app)
 *
 *  Revenue            = value of COMPLETED sales in the period (watch prices + delivery fees charged).
 *                       Cancelled sales never count. Unpaid sales DO count as revenue (they are sold),
 *                       but are NOT counted as cash received.
 *  COGS               = the actual purchase cost of the exact batches the sold watches came from
 *                       (+ their share of additional costs allocated to inventory).
 *  Gross profit       = Revenue − COGS
 *  Operating expenses = expenses recorded in the period (ads, delivery, packaging...)
 *  Inventory losses   = cost of units removed by stock adjustments (damaged/lost...) minus units found
 *  Net profit         = Gross profit − Operating expenses − Inventory losses
 *  Inventory value    = Σ per batch (remaining units × that batch's unit cost [+ allocated extras])
 *  Cash collected     = payments actually received in the period (refunds are negative)
 *
 *  Buying stock is NOT an expense: it becomes inventory (an asset), and only turns into
 *  cost (COGS) when the watch is sold. This way the same purchase cost is never subtracted twice.
 */
export type PeriodMetrics = {
  revenue: Money;
  itemsRevenue: Money;
  deliveryRevenue: Money;
  cogs: Money;
  grossProfit: Money;
  operatingExpenses: Money;
  inventoryLosses: Money;
  netProfit: Money;
  unitsSold: number;
  salesCount: number;
  avgProfitPerWatch: Money;
  avgSellingPrice: Money;
  cashCollected: Money;
  purchasesSpent: Money;
  unitsPurchased: number;
};

export type InventorySnapshot = {
  unitsInStock: number;
  inventoryValue: Money;
  activeModels: number;
  totalModels: number;
  lowStockCount: number;
  outOfStockCount: number;
  expectedRevenueOfStock: Money;
};

export type ReceivablesSnapshot = {
  outstanding: Money; // money customers still owe (completed sales)
  unpaidSalesCount: number;
  receivedAllTime: Money;
};

function rangeWhere(column: string, range: DateRange, params: SqlValue[]): string {
  const parts: string[] = [];
  if (range.from) {
    parts.push(`${column} >= ?`);
    params.push(range.from);
  }
  if (range.to) {
    parts.push(`${column} <= ?`);
    params.push(range.to);
  }
  return parts.length ? parts.join(' AND ') : '1=1';
}

export async function getPeriodMetrics(db: Db, range: DateRange): Promise<PeriodMetrics> {
  const p1: SqlValue[] = [];
  const sales = await db.get<{ revenue: number; items: number; delivery: number; cogs: number; n: number }>(
    `SELECT COALESCE(SUM(total_revenue),0) AS revenue, COALESCE(SUM(items_revenue),0) AS items,
            COALESCE(SUM(delivery_fee_charged),0) AS delivery, COALESCE(SUM(total_cost),0) AS cogs, COUNT(*) AS n
     FROM sales WHERE status = 'completed' AND ${rangeWhere('sale_date', range, p1)}`,
    p1,
  );
  const p2: SqlValue[] = [];
  const items = await db.get<{ units: number; profit: number }>(
    `SELECT COALESCE(SUM(si.quantity),0) AS units, COALESCE(SUM(si.gross_profit),0) AS profit
     FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status = 'completed' AND ${rangeWhere('s.sale_date', range, p2)}`,
    p2,
  );
  const p3: SqlValue[] = [];
  const exp = await db.get<{ total: number }>(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE ${rangeWhere('expense_date', range, p3)}`, p3);
  const p4: SqlValue[] = [];
  const adj = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(value_change),0) AS total FROM inventory_adjustments WHERE ${rangeWhere('adjustment_date', range, p4)}`,
    p4,
  );
  const p5: SqlValue[] = [];
  const cash = await db.get<{ total: number }>(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE ${rangeWhere('payment_date', range, p5)}`, p5);
  const p6: SqlValue[] = [];
  const bought = await db.get<{ spent: number; units: number }>(
    `SELECT COALESCE(SUM(quantity_purchased * unit_cost + additional_cost),0) AS spent, COALESCE(SUM(quantity_purchased),0) AS units
     FROM purchase_batches WHERE ${rangeWhere('purchase_date', range, p6)}`,
    p6,
  );

  const revenue = sales?.revenue ?? 0;
  const cogs = sales?.cogs ?? 0;
  const grossProfit = revenue - cogs;
  const operatingExpenses = exp?.total ?? 0;
  const inventoryLosses = -(adj?.total ?? 0);
  const unitsSold = items?.units ?? 0;
  return {
    revenue,
    itemsRevenue: sales?.items ?? 0,
    deliveryRevenue: sales?.delivery ?? 0,
    cogs,
    grossProfit,
    operatingExpenses,
    inventoryLosses,
    netProfit: grossProfit - operatingExpenses - inventoryLosses,
    unitsSold,
    salesCount: sales?.n ?? 0,
    avgProfitPerWatch: unitsSold ? Math.round((items?.profit ?? 0) / unitsSold) : 0,
    avgSellingPrice: unitsSold ? Math.round((sales?.items ?? 0) / unitsSold) : 0,
    cashCollected: cash?.total ?? 0,
    purchasesSpent: bought?.spent ?? 0,
    unitsPurchased: bought?.units ?? 0,
  };
}

export async function getInventorySnapshot(db: Db): Promise<InventorySnapshot> {
  const inv = await db.get<{ units: number; value: number }>(
    `SELECT COALESCE(SUM(b.quantity_remaining),0) AS units, COALESCE(SUM(${BATCH_VALUE_SQL}),0) AS value FROM purchase_batches b`,
  );
  const prods = await db.all<{ stock: number; threshold: number; price: number }>(
    `SELECT COALESCE((SELECT SUM(quantity_remaining) FROM purchase_batches b WHERE b.product_id = p.id),0) AS stock,
            p.low_stock_threshold AS threshold, p.default_selling_price AS price
     FROM products p`,
  );
  return {
    unitsInStock: inv?.units ?? 0,
    inventoryValue: inv?.value ?? 0,
    activeModels: prods.filter((p) => p.stock > 0).length,
    totalModels: prods.length,
    lowStockCount: prods.filter((p) => p.stock > 0 && p.stock <= p.threshold).length,
    outOfStockCount: prods.filter((p) => p.stock <= 0).length,
    expectedRevenueOfStock: prods.reduce((s, p) => s + p.stock * p.price, 0),
  };
}

export async function getReceivables(db: Db): Promise<ReceivablesSnapshot> {
  const r = await db.get<{ outstanding: number; n: number }>(
    `SELECT COALESCE(SUM(total_revenue - amount_paid),0) AS outstanding, COUNT(*) AS n
     FROM sales WHERE status = 'completed' AND total_revenue > amount_paid`,
  );
  const paid = await db.get<{ total: number }>(`SELECT COALESCE(SUM(amount),0) AS total FROM payments`);
  return { outstanding: r?.outstanding ?? 0, unpaidSalesCount: r?.n ?? 0, receivedAllTime: paid?.total ?? 0 };
}

// ---------------------------------------------------------------- time series
export type SeriesPoint = {
  key: string;
  label: string;
  revenue: Money;
  cogs: Money;
  grossProfit: Money;
  expenses: Money;
  losses: Money;
  netProfit: Money;
  units: number;
  cash: Money;
};

/** Resolves an open range to concrete dates using the first recorded transaction. */
export async function resolveRange(db: Db, range: DateRange): Promise<{ from: string; to: string }> {
  let from = range.from;
  if (!from) {
    const first = await db.get<{ d: string | null }>(
      `SELECT MIN(d) AS d FROM (
         SELECT MIN(sale_date) AS d FROM sales UNION ALL SELECT MIN(expense_date) FROM expenses
         UNION ALL SELECT MIN(purchase_date) FROM purchase_batches)`,
    );
    from = first?.d ?? today();
  }
  const to = range.to ?? today();
  return { from: from <= to ? from : to, to };
}

export async function getSeries(db: Db, range: DateRange, bucket?: Bucket): Promise<{ bucket: Bucket; points: SeriesPoint[] }> {
  const r = await resolveRange(db, range);
  let b = bucket ?? bucketForRange(r.from, r.to);
  // Keep charts readable and never truncate data: use a coarser bucket for very long ranges.
  const days = daysBetween(r.from, r.to);
  const order: Bucket[] = ['day', 'week', 'month', 'year'];
  const approx = (x: Bucket) => days / { day: 1, week: 7, month: 30, year: 365 }[x];
  while (approx(b) > 400 && b !== 'year') b = order[order.indexOf(b) + 1];
  const map = new Map<string, SeriesPoint>();
  let k = bucketKey(r.from, b);
  const last = bucketKey(r.to, b);
  let guard = 0;
  while (k <= last && guard++ < 500) {
    map.set(k, { key: k, label: bucketLabel(k, b), revenue: 0, cogs: 0, grossProfit: 0, expenses: 0, losses: 0, netProfit: 0, units: 0, cash: 0 });
    k = nextBucket(k, b);
  }
  const at = (date: string) => map.get(bucketKey(date, b));
  const params = [r.from, r.to];
  const sales = await db.all<{ d: string; revenue: number; cost: number }>(
    `SELECT sale_date AS d, total_revenue AS revenue, total_cost AS cost FROM sales WHERE status='completed' AND sale_date BETWEEN ? AND ?`,
    params,
  );
  for (const s of sales) {
    const p = at(s.d);
    if (p) {
      p.revenue += s.revenue;
      p.cogs += s.cost;
    }
  }
  const units = await db.all<{ d: string; q: number }>(
    `SELECT s.sale_date AS d, si.quantity AS q FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.status='completed' AND s.sale_date BETWEEN ? AND ?`,
    params,
  );
  for (const u of units) {
    const p = at(u.d);
    if (p) p.units += u.q;
  }
  const exps = await db.all<{ d: string; a: number }>(`SELECT expense_date AS d, amount AS a FROM expenses WHERE expense_date BETWEEN ? AND ?`, params);
  for (const e of exps) {
    const p = at(e.d);
    if (p) p.expenses += e.a;
  }
  const adjs = await db.all<{ d: string; v: number }>(
    `SELECT adjustment_date AS d, value_change AS v FROM inventory_adjustments WHERE adjustment_date BETWEEN ? AND ?`,
    params,
  );
  for (const a of adjs) {
    const p = at(a.d);
    if (p) p.losses += -a.v;
  }
  const pays = await db.all<{ d: string; a: number }>(`SELECT payment_date AS d, amount AS a FROM payments WHERE payment_date BETWEEN ? AND ?`, params);
  for (const x of pays) {
    const p = at(x.d);
    if (p) p.cash += x.a;
  }
  const points = [...map.values()];
  for (const p of points) {
    p.grossProfit = p.revenue - p.cogs;
    p.netProfit = p.grossProfit - p.expenses - p.losses;
  }
  return { bucket: b, points };
}

// ---------------------------------------------------------------- breakdowns
export type BreakdownRow = { key: string; label: string; units: number; revenue: Money; cost: Money; profit: Money; image_path?: string | null };

export async function salesByBrand(db: Db, range: DateRange): Promise<BreakdownRow[]> {
  const params: SqlValue[] = [];
  const w = rangeWhere('s.sale_date', range, params);
  return db.all<BreakdownRow>(
    `SELECT br.id AS key, br.name AS label, SUM(si.quantity) AS units, SUM(si.total_revenue) AS revenue,
            SUM(si.total_cost) AS cost, SUM(si.gross_profit) AS profit
     FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id JOIN brands br ON br.id = p.brand_id
     WHERE s.status = 'completed' AND ${w}
     GROUP BY br.id ORDER BY profit DESC`,
    params,
  );
}

export async function salesByModel(db: Db, range: DateRange): Promise<BreakdownRow[]> {
  const params: SqlValue[] = [];
  const w = rangeWhere('s.sale_date', range, params);
  return db.all<BreakdownRow>(
    `SELECT p.id AS key, br.name || ' ' || p.model AS label, p.image_path, SUM(si.quantity) AS units, SUM(si.total_revenue) AS revenue,
            SUM(si.total_cost) AS cost, SUM(si.gross_profit) AS profit
     FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id JOIN brands br ON br.id = p.brand_id
     WHERE s.status = 'completed' AND ${w}
     GROUP BY p.id ORDER BY units DESC, revenue DESC`,
    params,
  );
}

export async function inventoryByBrand(db: Db): Promise<{ key: string; label: string; units: number; value: Money }[]> {
  return db.all(
    `SELECT br.id AS key, br.name AS label, SUM(b.quantity_remaining) AS units, SUM(${BATCH_VALUE_SQL}) AS value
     FROM purchase_batches b JOIN products p ON p.id = b.product_id JOIN brands br ON br.id = p.brand_id
     GROUP BY br.id HAVING SUM(b.quantity_remaining) > 0 ORDER BY value DESC`,
  );
}

export async function expensesByCategory(db: Db, range: DateRange): Promise<{ key: string; label: string; total: Money; count: number }[]> {
  const params: SqlValue[] = [];
  const w = rangeWhere('e.expense_date', range, params);
  return db.all(
    `SELECT c.id AS key, c.name AS label, SUM(e.amount) AS total, COUNT(*) AS count
     FROM expenses e JOIN expense_categories c ON c.id = e.category_id WHERE ${w}
     GROUP BY c.id ORDER BY total DESC`,
    params,
  );
}

/** Products in stock that have not sold in `days` days (or never). */
export async function slowMovers(db: Db, days = 30): Promise<{ id: string; label: string; stock: number; last_sale_date: string | null; image_path: string | null }[]> {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const cutoff = d.toISOString().slice(0, 10);
  return db.all(
    `SELECT * FROM (
       SELECT p.id, br.name || ' ' || p.model AS label, p.image_path,
         COALESCE((SELECT SUM(quantity_remaining) FROM purchase_batches b WHERE b.product_id = p.id),0) AS stock,
         (SELECT MAX(s.sale_date) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.product_id = p.id AND s.status='completed') AS last_sale_date
       FROM products p JOIN brands br ON br.id = p.brand_id)
     WHERE stock > 0 AND (last_sale_date IS NULL OR last_sale_date < ?) ORDER BY last_sale_date`,
    [cutoff],
  );
}

/**
 * Inventory turnover = COGS of the period ÷ average inventory value.
 * Approximation: average of (current value) and (current value + COGS − purchases of the period).
 * Returns null when there is not enough data.
 */
export async function inventoryTurnover(db: Db, range: DateRange): Promise<number | null> {
  const m = await getPeriodMetrics(db, range);
  const inv = await getInventorySnapshot(db);
  const opening = inv.inventoryValue + m.cogs + m.inventoryLosses - m.purchasesSpent;
  const avg = (Math.max(0, opening) + inv.inventoryValue) / 2;
  if (m.cogs <= 0 || avg <= 0) return null;
  return Math.round((m.cogs / avg) * 100) / 100;
}

// ---------------------------------------------------------------- activity
export type ActivityRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reference: string | null;
  summary: string;
  amount: number | null;
  status: string | null;
  created_at: string;
};

export async function listActivity(
  db: Db,
  opts: { limit?: number; search?: string; from?: string | null; to?: string | null; types?: string[] } = {},
): Promise<ActivityRow[]> {
  const where: string[] = [];
  const params: SqlValue[] = [];
  if (opts.search?.trim()) {
    where.push('(summary LIKE ? OR reference LIKE ?)');
    params.push(`%${opts.search.trim()}%`, `%${opts.search.trim()}%`);
  }
  if (opts.from) {
    where.push('substr(created_at,1,10) >= ?');
    params.push(opts.from);
  }
  if (opts.to) {
    where.push('substr(created_at,1,10) <= ?');
    params.push(opts.to);
  }
  if (opts.types?.length) {
    where.push(`entity_type IN (${opts.types.map(() => '?').join(',')})`);
    params.push(...opts.types);
  }
  params.push(opts.limit ?? 200);
  return db.all<ActivityRow>(
    `SELECT id, action, entity_type, entity_id, reference, summary, amount, status, created_at FROM audit_logs
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`,
    params,
  );
}

export async function getAuditEntry(db: Db, id: string) {
  return db.get<ActivityRow & { old_values: string | null; new_values: string | null }>('SELECT * FROM audit_logs WHERE id = ?', [id]);
}
