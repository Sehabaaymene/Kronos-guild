import type { Db } from './types';

/**
 * Version-controlled schema migrations.
 *
 * Each entry upgrades the database by exactly one version. NEVER edit a
 * migration that has shipped to the phone — add a new one at the end instead.
 * The current version is stored in SQLite's `PRAGMA user_version`.
 *
 * Money columns are INTEGER amounts in centimes (1 DZD = 100), so there is no
 * floating-point arithmetic anywhere in the books.
 * Business dates are 'YYYY-MM-DD' text; timestamps are ISO-8601 text.
 */
export const MIGRATIONS: string[] = [
  // ---------------------------------------------------------------- v1
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );

  CREATE TABLE brands (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
    created_at TEXT NOT NULL
  );

  CREATE TABLE products (
    id                    TEXT PRIMARY KEY NOT NULL,
    brand_id              TEXT NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    model                 TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(model)) > 0),
    sku                   TEXT,
    description           TEXT,
    image_path            TEXT,
    default_selling_price INTEGER NOT NULL DEFAULT 0 CHECK (default_selling_price >= 0),
    low_stock_threshold   INTEGER NOT NULL DEFAULT 2 CHECK (low_stock_threshold >= 0),
    notes                 TEXT,
    stock_alert_state     TEXT NOT NULL DEFAULT 'ok' CHECK (stock_alert_state IN ('ok','low','out')),
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    UNIQUE (brand_id, model)
  );
  CREATE INDEX idx_products_brand ON products(brand_id);
  CREATE INDEX idx_products_sku ON products(sku);

  CREATE TABLE purchase_batches (
    id                     TEXT PRIMARY KEY NOT NULL,
    reference              TEXT NOT NULL UNIQUE,
    request_id             TEXT UNIQUE,
    product_id             TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    purchase_date          TEXT NOT NULL,
    quantity_purchased     INTEGER NOT NULL CHECK (quantity_purchased > 0),
    quantity_remaining     INTEGER NOT NULL CHECK (quantity_remaining >= 0 AND quantity_remaining <= quantity_purchased),
    unit_cost              INTEGER NOT NULL CHECK (unit_cost >= 0),
    additional_cost        INTEGER NOT NULL DEFAULT 0 CHECK (additional_cost >= 0),
    additional_cost_mode   TEXT NOT NULL DEFAULT 'inventory' CHECK (additional_cost_mode IN ('inventory','expense')),
    expected_selling_price INTEGER NOT NULL DEFAULT 0 CHECK (expected_selling_price >= 0),
    supplier_name          TEXT,
    notes                  TEXT,
    receipt_path           TEXT,
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL
  );
  CREATE INDEX idx_batches_product ON purchase_batches(product_id);
  CREATE INDEX idx_batches_date ON purchase_batches(purchase_date);
  CREATE INDEX idx_batches_supplier ON purchase_batches(supplier_name);

  CREATE TABLE sales (
    id                   TEXT PRIMARY KEY NOT NULL,
    reference            TEXT NOT NULL UNIQUE,
    request_id           TEXT UNIQUE,
    sale_date            TEXT NOT NULL,
    customer_name        TEXT,
    customer_phone       TEXT,
    delivery_fee_charged INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_charged >= 0),
    items_revenue        INTEGER NOT NULL DEFAULT 0,
    total_revenue        INTEGER NOT NULL DEFAULT 0,
    total_cost           INTEGER NOT NULL DEFAULT 0,
    gross_profit         INTEGER NOT NULL DEFAULT 0,
    amount_paid          INTEGER NOT NULL DEFAULT 0,
    payment_method       TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','bank_transfer','other')),
    payment_status       TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid','partial','unpaid')),
    status               TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','cancelled')),
    order_reference      TEXT,
    notes                TEXT,
    cancelled_at         TEXT,
    cancel_reason        TEXT,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
  );
  CREATE INDEX idx_sales_date ON sales(sale_date);
  CREATE INDEX idx_sales_status ON sales(status);

  CREATE TABLE sale_items (
    id                            TEXT PRIMARY KEY NOT NULL,
    sale_id                       TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id                    TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    purchase_batch_id             TEXT NOT NULL REFERENCES purchase_batches(id) ON DELETE RESTRICT,
    quantity                      INTEGER NOT NULL CHECK (quantity > 0),
    unit_selling_price            INTEGER NOT NULL CHECK (unit_selling_price >= 0),
    unit_purchase_cost_snapshot   INTEGER NOT NULL CHECK (unit_purchase_cost_snapshot >= 0),
    unit_additional_cost_snapshot INTEGER NOT NULL DEFAULT 0,
    total_revenue                 INTEGER NOT NULL,
    total_cost                    INTEGER NOT NULL,
    gross_profit                  INTEGER NOT NULL
  );
  CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
  CREATE INDEX idx_sale_items_batch ON sale_items(purchase_batch_id);
  CREATE INDEX idx_sale_items_product ON sale_items(product_id);

  CREATE TABLE payments (
    id           TEXT PRIMARY KEY NOT NULL,
    sale_id      TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    amount       INTEGER NOT NULL,
    payment_date TEXT NOT NULL,
    method       TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','bank_transfer','other')),
    kind         TEXT NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','adjustment','refund')),
    note         TEXT,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX idx_payments_sale ON payments(sale_id);
  CREATE INDEX idx_payments_date ON payments(payment_date);

  CREATE TABLE expense_categories (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE expenses (
    id                TEXT PRIMARY KEY NOT NULL,
    reference         TEXT NOT NULL UNIQUE,
    request_id        TEXT UNIQUE,
    category_id       TEXT NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    title             TEXT NOT NULL CHECK (length(trim(title)) > 0),
    amount            INTEGER NOT NULL CHECK (amount > 0),
    expense_date      TEXT NOT NULL,
    payment_method    TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','bank_transfer','other')),
    description       TEXT,
    receipt_path      TEXT,
    purchase_batch_id TEXT REFERENCES purchase_batches(id) ON DELETE CASCADE,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );
  CREATE INDEX idx_expenses_date ON expenses(expense_date);
  CREATE INDEX idx_expenses_category ON expenses(category_id);

  CREATE TABLE inventory_adjustments (
    id                TEXT PRIMARY KEY NOT NULL,
    reference         TEXT NOT NULL UNIQUE,
    purchase_batch_id TEXT NOT NULL REFERENCES purchase_batches(id) ON DELETE CASCADE,
    quantity_change   INTEGER NOT NULL CHECK (quantity_change <> 0),
    value_change      INTEGER NOT NULL,
    reason            TEXT NOT NULL CHECK (reason IN ('damaged','lost','personal_use','returned_to_supplier','count_correction','found')),
    note              TEXT,
    adjustment_date   TEXT NOT NULL,
    created_at        TEXT NOT NULL
  );
  CREATE INDEX idx_adjustments_batch ON inventory_adjustments(purchase_batch_id);
  CREATE INDEX idx_adjustments_date ON inventory_adjustments(adjustment_date);

  CREATE TABLE goals (
    id           TEXT PRIMARY KEY NOT NULL,
    title        TEXT NOT NULL CHECK (length(trim(title)) > 0),
    metric       TEXT NOT NULL CHECK (metric IN ('revenue','net_profit','gross_profit','units_sold','cash_collected','sales_count')),
    period       TEXT NOT NULL CHECK (period IN ('weekly','monthly','yearly','custom')),
    target_value INTEGER NOT NULL CHECK (target_value > 0),
    start_date   TEXT NOT NULL,
    end_date     TEXT NOT NULL,
    description  TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    CHECK (end_date >= start_date)
  );

  CREATE TABLE notifications (
    id                  TEXT PRIMARY KEY NOT NULL,
    type                TEXT NOT NULL,
    title               TEXT NOT NULL,
    message             TEXT NOT NULL,
    related_entity_type TEXT,
    related_entity_id   TEXT,
    dedupe_key          TEXT UNIQUE,
    is_read             INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL
  );
  CREATE INDEX idx_notifications_read ON notifications(is_read, created_at);

  CREATE TABLE audit_logs (
    id          TEXT PRIMARY KEY NOT NULL,
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   TEXT,
    reference   TEXT,
    summary     TEXT NOT NULL,
    amount      INTEGER,
    status      TEXT,
    old_values  TEXT,
    new_values  TEXT,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX idx_audit_created ON audit_logs(created_at);
  CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Advertising',
  'Instagram/Facebook ads',
  'Delivery',
  'Packaging',
  'Transportation',
  'Supplier-related expenses',
  'Subscriptions',
  'Photography',
  'Other',
];

/** Applies pending migrations and seeds required rows. Safe to call on every launch. */
export async function migrate(db: Db, now: () => string, uuid: () => string): Promise<void> {
  await db.exec('PRAGMA foreign_keys = ON;');
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.transaction(async (tx) => {
      await tx.exec(MIGRATIONS[v]);
      await tx.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
  // Seed default expense categories (idempotent).
  for (const name of DEFAULT_EXPENSE_CATEGORIES) {
    await db.run(
      'INSERT OR IGNORE INTO expense_categories (id, name, is_default, created_at) VALUES (?, ?, 1, ?)',
      [uuid(), name, now()],
    );
  }
}

/** Tables in foreign-key-safe insertion order (used by backup/restore). */
export const TABLES_IN_ORDER = [
  'settings',
  'brands',
  'products',
  'purchase_batches',
  'expense_categories',
  'sales',
  'sale_items',
  'payments',
  'expenses',
  'inventory_adjustments',
  'goals',
  'notifications',
  'audit_logs',
] as const;
