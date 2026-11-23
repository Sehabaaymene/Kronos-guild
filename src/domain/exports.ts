import type { Db } from '../db/types';
import { listProducts, stockStatus } from './catalog';
import { listExpenses } from './expenses';
import type { DateRange } from './dates';
import { CENTS } from './money';

/** RFC-4180 CSV with a UTF-8 BOM so Excel opens accents and Arabic names correctly. */
export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    if (v == null) return '';
    let s = String(v);
    // Neutralise spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

/** Plain decimal DZD for spreadsheets (no separators). */
const n = (centimes: number | null | undefined) => (centimes == null ? '' : (centimes / CENTS).toFixed(2).replace(/\.00$/, ''));

export async function purchasesCSV(db: Db, range: DateRange = { from: null, to: null }): Promise<string> {
  const rows = await db.all<Record<string, string | number | null>>(
    `SELECT b.reference, b.purchase_date, br.name AS brand, p.model, p.sku, b.quantity_purchased, b.unit_cost,
       b.quantity_purchased * b.unit_cost AS total, b.additional_cost, b.additional_cost_mode, b.expected_selling_price,
       b.supplier_name, b.quantity_remaining,
       COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.purchase_batch_id = b.id AND s.status='completed'),0) AS sold,
       b.notes
     FROM purchase_batches b JOIN products p ON p.id = b.product_id JOIN brands br ON br.id = p.brand_id
     WHERE (? IS NULL OR b.purchase_date >= ?) AND (? IS NULL OR b.purchase_date <= ?)
     ORDER BY b.purchase_date, b.reference`,
    [range.from, range.from, range.to, range.to],
  );
  return toCSV(
    ['Reference', 'Date', 'Brand', 'Model', 'SKU', 'Quantity', 'Unit cost (DZD)', 'Total cost (DZD)', 'Additional costs (DZD)', 'Additional costs treated as', 'Expected selling price (DZD)', 'Supplier', 'Remaining', 'Sold', 'Notes'],
    rows.map((r) => [
      r.reference, r.purchase_date, r.brand, r.model, r.sku, r.quantity_purchased, n(r.unit_cost as number), n(r.total as number),
      n(r.additional_cost as number), r.additional_cost_mode === 'inventory' ? 'Inventory cost' : 'Operating expense',
      n(r.expected_selling_price as number), r.supplier_name, r.quantity_remaining, r.sold, r.notes,
    ]),
  );
}

export async function salesCSV(db: Db, range: DateRange = { from: null, to: null }): Promise<string> {
  const rows = await db.all<Record<string, string | number | null>>(
    `SELECT s.reference, s.sale_date, s.status, br.name AS brand, p.model, b.reference AS batch, si.quantity, si.unit_selling_price,
       si.unit_purchase_cost_snapshot + si.unit_additional_cost_snapshot AS unit_cost, si.total_revenue, si.total_cost, si.gross_profit,
       s.delivery_fee_charged, s.total_revenue AS sale_total, s.amount_paid, s.payment_status, s.payment_method,
       s.customer_name, s.customer_phone, s.order_reference, s.notes
     FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
     JOIN brands br ON br.id = p.brand_id JOIN purchase_batches b ON b.id = si.purchase_batch_id
     WHERE (? IS NULL OR s.sale_date >= ?) AND (? IS NULL OR s.sale_date <= ?)
     ORDER BY s.sale_date, s.reference`,
    [range.from, range.from, range.to, range.to],
  );
  return toCSV(
    ['Sale', 'Date', 'Status', 'Brand', 'Model', 'Batch', 'Qty', 'Unit price (DZD)', 'Unit cost (DZD)', 'Line revenue (DZD)', 'Line cost (DZD)', 'Line gross profit (DZD)', 'Delivery charged (DZD)', 'Sale total (DZD)', 'Paid (DZD)', 'Payment status', 'Payment method', 'Customer', 'Phone', 'Order ref', 'Notes'],
    rows.map((r) => [
      r.reference, r.sale_date, r.status, r.brand, r.model, r.batch, r.quantity, n(r.unit_selling_price as number), n(r.unit_cost as number),
      n(r.total_revenue as number), n(r.total_cost as number), n(r.gross_profit as number), n(r.delivery_fee_charged as number),
      n(r.sale_total as number), n(r.amount_paid as number), r.payment_status, r.payment_method, r.customer_name, r.customer_phone, r.order_reference, r.notes,
    ]),
  );
}

export async function expensesCSV(db: Db, range: DateRange = { from: null, to: null }): Promise<string> {
  const rows = await listExpenses(db, range);
  return toCSV(
    ['Reference', 'Date', 'Category', 'Title', 'Amount (DZD)', 'Payment method', 'Description', 'Linked purchase'],
    rows.reverse().map((e) => [e.reference, e.expense_date, e.category_name, e.title, n(e.amount), e.payment_method, e.description, e.purchase_batch_id ? 'yes' : '']),
  );
}

export async function inventoryCSV(db: Db): Promise<string> {
  const rows = await listProducts(db);
  return toCSV(
    ['Brand', 'Model', 'SKU', 'In stock', 'Status', 'Low-stock threshold', 'Inventory value at cost (DZD)', 'Expected selling price (DZD)', 'Purchased (total)', 'Sold (total)', 'Last purchase', 'Last sale'],
    rows.map((p) => [
      p.brand_name, p.model, p.sku, p.stock, stockStatus(p.stock, p.low_stock_threshold).replace(/_/g, ' '), p.low_stock_threshold,
      n(p.inventory_value), n(p.default_selling_price), p.quantity_purchased, p.quantity_sold, p.last_purchase_date, p.last_sale_date,
    ]),
  );
}
