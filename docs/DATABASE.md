# Database

On-device SQLite (`expo-sqlite`), file `watch-business.db`. Schema and migrations: `src/db/schema.ts`.

## Migrations

- `MIGRATIONS` is an ordered list; the current version is stored in `PRAGMA user_version`.
- On every launch `migrate()` applies the missing migrations inside transactions, then seeds the default expense categories.
- **Never edit a shipped migration** — append a new one (e.g. `ALTER TABLE … ADD COLUMN …`). Backups store the schema version; the app refuses backups from a newer version.

## Tables

| Table | Purpose |
| --- | --- |
| `settings` | key/value settings and reference counters (`seq_P`, `seq_S`, `seq_E`, `seq_A`) |
| `brands` | brand names (unique, case-insensitive) |
| `products` | watch models: brand, model, SKU, picture, default price, low-stock threshold, alert state |
| `purchase_batches` | one row per purchase: quantity purchased/remaining, unit cost, additional cost + mode, expected price, supplier, receipt |
| `sales` | sale header: date, customer, delivery fee, cached totals, amount paid, payment status, status (completed/cancelled) |
| `sale_items` | one row per batch used: quantity, selling price, cost snapshots, revenue/cost/profit |
| `payments` | payments, corrections and refunds per sale |
| `expense_categories` / `expenses` | operating expenses (an expense can be linked to a purchase's additional costs) |
| `inventory_adjustments` | stock corrections outside sales, with value change |
| `goals` | targets with metric, period, dates |
| `notifications` | in-app notifications (`dedupe_key` prevents duplicates) |
| `audit_logs` | permanent history with old/new JSON values |

## Key constraints

- UUID text primary keys; sequential human references are unique.
- `quantity_remaining BETWEEN 0 AND quantity_purchased` on every batch.
- Money columns are INTEGER centimes with `>= 0` checks where relevant.
- Foreign keys enforced (`PRAGMA foreign_keys = ON`); products/batches referenced by sales cannot be deleted.
- `request_id` UNIQUE on purchases, sales and expenses (idempotent submissions).
- Indexes on dates, foreign keys, SKU, supplier and notification state.

## Security model

Single user, no login: the database lives in the app's sandbox, which iOS encrypts when the phone is locked (Data Protection). Optional Face ID lock in Settings. Nothing is ever sent over the network, so there are no API keys or secrets.
