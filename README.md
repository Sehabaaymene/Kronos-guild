# Watch Business

A private, offline iPhone app to run an online watch business: inventory by purchase batch, sales with manual batch selection, real profit, expenses, goals, stock alerts, reports and full history. Built for one user, in Algerian Dinar (DZD).

- **Private**: all data lives only on your iPhone (SQLite + local pictures). No server, no account, no internet needed.
- **Accurate**: every watch is traced to the exact purchase batch and cost it came from. Money is stored as integer centimes (no rounding errors). Every purchase, sale and correction is atomic.
- **Safe**: full backup file (data + pictures), restore with confirmation, CSV/PDF exports, permanent change history, optional Face ID lock.

## What's inside

| Area | Features |
| --- | --- |
| Dashboard | Net profit hero, revenue / COGS / gross profit / expenses / watches sold / avg profit per watch, current inventory, all-time totals, 7 interactive charts, recent activity, quick actions, period filter (today, week, month, year, all time, custom) |
| Inventory | Searchable catalog with pictures, filters (brand, in/low/out of stock), sorting, product page with batches, sales history, profit, inventory value |
| Purchases | Brand & model autocomplete, new models created inline, camera/photo picture, receipt, supplier, additional costs (added to watch cost **or** recorded as expense), review before confirm, safe editing, stock adjustments |
| Sales | 3-step sell flow, manual batch choice (several batches in one sale), negotiated price, delivery fee, paid / partial / unpaid, later payments, edit & cancel (stock goes back to the exact batch) |
| Finance | P&L, cash collected vs. revenue, unpaid balances, inventory investment, expenses by category, custom categories |
| Goals | Weekly / monthly / yearly / custom goals for net profit, revenue, watches sold, gross profit, cash collected, number of sales; milestone alerts at 50/75/100%/exceeded (never repeated) |
| Alerts | Low-stock & out-of-stock (per-model threshold), goal milestones, unpaid reminders, sales, inventory corrections; in-app center + iPhone notifications |
| Reports | Sales, profit, stock and expense reports by day/week/month/year; PDF report; CSV exports |
| History | Every create / edit / cancel / delete with before/after values |

## Tech

Expo SDK 58 · React Native · TypeScript · Expo Router · expo-sqlite · expo-file-system · expo-notifications · react-native-svg charts · Vitest.

```
src/
  app/        screens (Expo Router — one file per screen)
  domain/     business logic & accounting rules (pure TypeScript, fully tested)
  db/         SQLite schema, migrations, database adapter
  services/   pictures, backup/restore, CSV/PDF export, notifications
  ui/         design system, forms, charts, shared screens
  i18n/       text dictionary (English now, French-ready)
  theme/      colours, spacing, typography (dark + light)
tests/        automated tests (run on a computer with Node's built-in SQLite)
docs/         installation, backup, business rules, database
```

## Commands

```powershell
npm install          # once
npm test             # business-logic & financial-accuracy tests
npm run typecheck    # TypeScript
npm run lint         # ESLint
npx expo start       # run on your iPhone with Expo Go (development)
npm run preview      # try the app in a browser on this computer (press w if it doesn't open)
```

The browser preview is for trying screens and flows only. Its data is stored in that browser, separate from the iPhone, and phone-only features (camera, Face ID, notifications, backup files, share sheet) don't work there.

## Install on your iPhone

**Free, with GitHub (recommended):** see **[docs/INSTALL_ON_IPHONE.md](docs/INSTALL_ON_IPHONE.md)**. GitHub publishes the app automatically (`.github/workflows/publish.yml`); you add it to your Home Screen from Safari. Works offline, data stays on the phone.

Native App-Store-style build (needs a Mac or an Apple developer account): [docs/IPHONE_INSTALL.md](docs/IPHONE_INSTALL.md).

The same code runs both ways: on the web app, SQLite runs inside Safari (`src/db/expoDb.web.ts`, sql.js) and is saved to the phone's storage; `*.web.ts` files replace the phone-only services (photos, backup, export, notifications). All 29 business tests run against both database engines.

## More documentation

- [docs/BUSINESS_LOGIC.md](docs/BUSINESS_LOGIC.md) — how profit, cost, stock and corrections are calculated
- [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md) — backups, exports, restoring, pictures
- [docs/DATABASE.md](docs/DATABASE.md) — tables, constraints and migrations
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — what is done, what is left, how to resume
