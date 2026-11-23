import type { Db } from '../db/types';
import { assert, audit, BusinessError, cleanText, getSetting, nowISO, requireInt, uuid } from './core';
import type { Money } from './money';

export type Brand = { id: string; name: string; created_at: string };

export type Product = {
  id: string;
  brand_id: string;
  brand_name: string;
  model: string;
  sku: string | null;
  description: string | null;
  image_path: string | null;
  default_selling_price: Money;
  low_stock_threshold: number;
  notes: string | null;
  stock_alert_state: 'ok' | 'low' | 'out';
  created_at: string;
  updated_at: string;
};

/** Product with live inventory figures derived from its purchase batches. */
export type ProductWithStock = Product & {
  stock: number;
  quantity_purchased: number;
  quantity_sold: number;
  inventory_value: Money;
  batch_count: number;
  last_purchase_date: string | null;
  last_sale_date: string | null;
};

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export function stockStatus(stock: number, threshold: number): StockStatus {
  if (stock <= 0) return 'out_of_stock';
  if (stock <= threshold) return 'low_stock';
  return 'in_stock';
}

/**
 * Inventory value of a batch = remaining units × unit cost
 * + the remaining units' share of additional costs allocated to inventory.
 */
export const BATCH_VALUE_SQL = `(b.quantity_remaining * b.unit_cost +
  CASE WHEN b.additional_cost_mode = 'inventory'
       THEN CAST(ROUND(1.0 * b.additional_cost * b.quantity_remaining / b.quantity_purchased) AS INTEGER)
       ELSE 0 END)`;

const PRODUCT_WITH_STOCK_SQL = `
  SELECT p.*, br.name AS brand_name,
    COALESCE((SELECT SUM(b.quantity_remaining) FROM purchase_batches b WHERE b.product_id = p.id), 0) AS stock,
    COALESCE((SELECT SUM(b.quantity_purchased) FROM purchase_batches b WHERE b.product_id = p.id), 0) AS quantity_purchased,
    COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales s ON s.id = si.sale_id
              WHERE si.product_id = p.id AND s.status = 'completed'), 0) AS quantity_sold,
    COALESCE((SELECT SUM(${BATCH_VALUE_SQL}) FROM purchase_batches b WHERE b.product_id = p.id), 0) AS inventory_value,
    (SELECT COUNT(*) FROM purchase_batches b WHERE b.product_id = p.id) AS batch_count,
    (SELECT MAX(b.purchase_date) FROM purchase_batches b WHERE b.product_id = p.id) AS last_purchase_date,
    (SELECT MAX(s.sale_date) FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE si.product_id = p.id AND s.status = 'completed') AS last_sale_date
  FROM products p JOIN brands br ON br.id = p.brand_id`;

export async function listProducts(db: Db): Promise<ProductWithStock[]> {
  return db.all<ProductWithStock>(`${PRODUCT_WITH_STOCK_SQL} ORDER BY p.created_at DESC`);
}

export async function getProduct(db: Db, id: string): Promise<ProductWithStock | null> {
  return db.get<ProductWithStock>(`${PRODUCT_WITH_STOCK_SQL} WHERE p.id = ?`, [id]);
}

export async function listBrands(db: Db): Promise<Brand[]> {
  return db.all<Brand>('SELECT * FROM brands ORDER BY name COLLATE NOCASE');
}

/** Fast autocomplete: brands whose name contains the query (prefix matches first). */
export async function searchBrands(db: Db, query: string, limit = 8): Promise<Brand[]> {
  const q = query.trim();
  if (!q) return db.all<Brand>('SELECT * FROM brands ORDER BY name COLLATE NOCASE LIMIT ?', [limit]);
  return db.all<Brand>(
    `SELECT * FROM brands WHERE name LIKE ? ESCAPE '\\'
     ORDER BY CASE WHEN name LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, name COLLATE NOCASE LIMIT ?`,
    [`%${escapeLike(q)}%`, `${escapeLike(q)}%`, limit],
  );
}

/** Models for autocomplete, optionally restricted to a brand name. */
export async function searchModels(
  db: Db,
  brandName: string,
  query: string,
  limit = 8,
): Promise<{ id: string; model: string; brand_name: string; default_selling_price: Money; sku: string | null }[]> {
  const params: (string | number)[] = [];
  let where = '1=1';
  if (brandName.trim()) {
    where += ' AND br.name = ? COLLATE NOCASE';
    params.push(brandName.trim());
  }
  if (query.trim()) {
    where += " AND (p.model LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\')";
    params.push(`%${escapeLike(query.trim())}%`, `%${escapeLike(query.trim())}%`);
  }
  params.push(limit);
  return db.all(
    `SELECT p.id, p.model, br.name AS brand_name, p.default_selling_price, p.sku
     FROM products p JOIN brands br ON br.id = p.brand_id
     WHERE ${where} ORDER BY p.model COLLATE NOCASE LIMIT ?`,
    params,
  );
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}

/** Finds a brand by name (case-insensitive) or creates it. Must run inside a transaction. */
export async function ensureBrand(tx: Db, name: string): Promise<Brand> {
  const clean = cleanText(name, 80);
  assert(clean, 'Brand is required.');
  const existing = await tx.get<Brand>('SELECT * FROM brands WHERE name = ? COLLATE NOCASE', [clean]);
  if (existing) return existing;
  const brand: Brand = { id: uuid(), name: clean, created_at: nowISO() };
  await tx.run('INSERT INTO brands (id, name, created_at) VALUES (?, ?, ?)', [brand.id, brand.name, brand.created_at]);
  await audit(tx, { action: 'brand.create', entityType: 'brand', entityId: brand.id, summary: `Brand created: ${clean}` });
  return brand;
}

export type EnsureProductInput = {
  brandName: string;
  model: string;
  defaultSellingPrice?: Money;
  sku?: string | null;
  imagePath?: string | null;
};

/** Finds a product by brand + model (case-insensitive) or creates it. Must run inside a transaction. */
export async function ensureProduct(tx: Db, input: EnsureProductInput): Promise<{ id: string; created: boolean }> {
  const brand = await ensureBrand(tx, input.brandName);
  const model = cleanText(input.model, 120);
  assert(model, 'Model is required.');
  const existing = await tx.get<{ id: string }>('SELECT id FROM products WHERE brand_id = ? AND model = ? COLLATE NOCASE', [
    brand.id,
    model,
  ]);
  if (existing) return { id: existing.id, created: false };
  const thresholdSetting = await getSetting(tx, 'default_low_stock_threshold');
  const threshold = thresholdSetting != null ? Number(thresholdSetting) : 2;
  const id = uuid();
  const now = nowISO();
  await tx.run(
    `INSERT INTO products (id, brand_id, model, sku, image_path, default_selling_price, low_stock_threshold, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, brand.id, model, cleanText(input.sku, 60), input.imagePath ?? null, input.defaultSellingPrice ?? 0, threshold, now, now],
  );
  await audit(tx, {
    action: 'product.create',
    entityType: 'product',
    entityId: id,
    summary: `Watch model created: ${brand.name} ${model}`,
  });
  return { id, created: true };
}

export type UpdateProductInput = {
  id: string;
  brandName: string;
  model: string;
  sku?: string | null;
  description?: string | null;
  imagePath?: string | null;
  defaultSellingPrice: Money;
  lowStockThreshold: number;
  notes?: string | null;
};

export async function updateProduct(db: Db, input: UpdateProductInput): Promise<void> {
  await db.transaction(async (tx) => {
    const old = await getProduct(tx, input.id);
    assert(old, 'Product not found.');
    const brand = await ensureBrand(tx, input.brandName);
    const model = cleanText(input.model, 120);
    assert(model, 'Model is required.');
    requireInt(input.defaultSellingPrice, 'Selling price', 0);
    requireInt(input.lowStockThreshold, 'Low-stock threshold', 0);
    const clash = await tx.get<{ id: string }>(
      'SELECT id FROM products WHERE brand_id = ? AND model = ? COLLATE NOCASE AND id <> ?',
      [brand.id, model, input.id],
    );
    if (clash) throw new BusinessError(`${brand.name} ${model} already exists. Choose a different model name.`);
    await tx.run(
      `UPDATE products SET brand_id = ?, model = ?, sku = ?, description = ?, image_path = ?, default_selling_price = ?,
         low_stock_threshold = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [
        brand.id,
        model,
        cleanText(input.sku, 60),
        cleanText(input.description, 2000),
        input.imagePath ?? null,
        input.defaultSellingPrice,
        input.lowStockThreshold,
        cleanText(input.notes, 2000),
        nowISO(),
        input.id,
      ],
    );
    await audit(tx, {
      action: 'product.update',
      entityType: 'product',
      entityId: input.id,
      summary: `Watch model updated: ${brand.name} ${model}`,
      oldValues: pickProduct(old),
      newValues: { ...input, brandName: brand.name, model },
    });
  });
}

/** Deletes a product only if it has never been purchased or sold. */
export async function deleteProduct(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const p = await getProduct(tx, id);
    assert(p, 'Product not found.');
    if (p.batch_count > 0) throw new BusinessError('This model has purchase records and cannot be deleted.');
    await tx.run('DELETE FROM products WHERE id = ?', [id]);
    await audit(tx, {
      action: 'product.delete',
      entityType: 'product',
      entityId: id,
      summary: `Watch model deleted: ${p.brand_name} ${p.model}`,
      oldValues: pickProduct(p),
    });
  });
}

function pickProduct(p: Product) {
  return {
    brand: p.brand_name,
    model: p.model,
    sku: p.sku,
    default_selling_price: p.default_selling_price,
    low_stock_threshold: p.low_stock_threshold,
    image_path: p.image_path,
  };
}
