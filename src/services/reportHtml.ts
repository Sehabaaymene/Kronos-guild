import type { Db } from '../db/types';
import { type DateRange, formatDate, today } from '../domain/dates';
import { expensesCSV, inventoryCSV, purchasesCSV, salesCSV } from '../domain/exports';
import {
  expensesByCategory,
  getInventorySnapshot,
  getPeriodMetrics,
  getReceivables,
  inventoryByBrand,
  salesByBrand,
  salesByModel,
} from '../domain/finance';
import { formatMoney } from '../domain/money';

export type CsvKind = 'purchases' | 'sales' | 'expenses' | 'inventory';

export async function csvContent(db: Db, kind: CsvKind, range: DateRange): Promise<string> {
  if (kind === 'purchases') return purchasesCSV(db, range);
  if (kind === 'sales') return salesCSV(db, range);
  if (kind === 'expenses') return expensesCSV(db, range);
  return inventoryCSV(db);
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Printable HTML financial report for a period (used for the PDF export). */
export async function buildReportHtml(db: Db, range: DateRange, periodLabel: string, businessName: string): Promise<string> {
  const m = await getPeriodMetrics(db, range);
  const inv = await getInventorySnapshot(db);
  const rec = await getReceivables(db);
  const brands = await salesByBrand(db, range);
  const models = (await salesByModel(db, range)).slice(0, 15);
  const cats = await expensesByCategory(db, range);
  const invBrands = await inventoryByBrand(db);
  const row = (label: string, value: string, strong = false) =>
    `<tr${strong ? ' class="strong"' : ''}><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`;
  const table = (headers: string[], rows: string[][]) =>
    rows.length
      ? `<table><thead><tr>${headers.map((h, i) => `<th${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`
      : '<p class="muted">No data for this period.</p>';
  const rangeText = range.from || range.to ? `${formatDate(range.from ?? '')} – ${formatDate(range.to ?? today())}` : 'All time';

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(businessName)} report</title><style>
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111;padding:28px;font-size:12px;background:#fff}
    h1{font-size:22px;margin:0}h2{font-size:14px;margin:26px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px;color:#7a5c22}
    .muted{color:#777}table{width:100%;border-collapse:collapse}td,th{padding:5px 4px;border-bottom:1px solid #eee;text-align:left}
    th{font-size:10px;text-transform:uppercase;color:#666}.num{text-align:right;font-variant-numeric:tabular-nums}
    tr.strong td{font-weight:700;border-top:1px solid #999}.grid{display:flex;gap:24px;flex-wrap:wrap}.grid>div{flex:1;min-width:240px}
  </style></head><body>
    <h1>${esc(businessName)} — Financial report</h1>
    <div class="muted">${esc(periodLabel)} · ${esc(rangeText)} · generated ${esc(formatDate(today()))}</div>
    <div class="grid"><div>
      <h2>Profit &amp; loss</h2><table>
        ${row('Revenue (completed sales)', formatMoney(m.revenue))}
        ${row('   of which delivery fees charged', formatMoney(m.deliveryRevenue))}
        ${row('Cost of goods sold', formatMoney(-m.cogs))}
        ${row('Gross profit', formatMoney(m.grossProfit), true)}
        ${row('Operating expenses', formatMoney(-m.operatingExpenses))}
        ${m.inventoryLosses ? row('Inventory losses', formatMoney(-m.inventoryLosses)) : ''}
        ${row('Net profit', formatMoney(m.netProfit), true)}
      </table></div><div>
      <h2>Activity &amp; cash</h2><table>
        ${row('Sales', String(m.salesCount))}
        ${row('Watches sold', String(m.unitsSold))}
        ${row('Average selling price', formatMoney(m.avgSellingPrice))}
        ${row('Average profit per watch', formatMoney(m.avgProfitPerWatch))}
        ${row('Cash collected', formatMoney(m.cashCollected))}
        ${row('Stock purchased', formatMoney(m.purchasesSpent))}
        ${row('Unpaid customer balances (today)', formatMoney(rec.outstanding))}
      </table></div></div>
    <h2>Inventory (today)</h2><table>
      ${row('Watches in stock', String(inv.unitsInStock))}
      ${row('Inventory value at purchase cost', formatMoney(inv.inventoryValue))}
      ${row('Active models', String(inv.activeModels))}
      ${row('Low-stock / out-of-stock models', `${inv.lowStockCount} / ${inv.outOfStockCount}`)}
    </table>
    <h2>Profit by brand</h2>${table(['Brand', 'Units', 'Revenue', 'Profit'], brands.map((b) => [b.label, String(b.units), formatMoney(b.revenue), formatMoney(b.profit)]))}
    <h2>Best-selling models</h2>${table(['Model', 'Units', 'Revenue', 'Profit'], models.map((b) => [b.label, String(b.units), formatMoney(b.revenue), formatMoney(b.profit)]))}
    <h2>Expenses by category</h2>${table(['Category', 'Entries', 'Total'], cats.map((c) => [c.label, String(c.count), formatMoney(c.total)]))}
    <h2>Stock value by brand</h2>${table(['Brand', 'Units', 'Value at cost'], invBrands.map((b) => [b.label, String(b.units), formatMoney(b.value)]))}
  </body></html>`;
}
