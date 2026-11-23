# Project status

_Last updated: 2026-11-23_

## Done

**Architecture** — private offline iPhone app: Expo SDK 58, React Native, TypeScript, Expo Router, SQLite (expo-sqlite), local pictures (expo-file-system), local notifications. No server, no login.

**Features (all real, using the on-device database — no demo data):**

- Dashboard: period filter (today/week/month/year/all/custom), net-profit hero, 8 period KPIs, current inventory, all-time totals, 7 interactive charts (revenue, net profit, expenses, watches sold, profit by brand, best sellers, inventory by brand), recent activity, quick actions, stock & unpaid banners.
- Inventory: catalog with pictures, search, brand/stock filters, 5 sort orders, product page (batches, sales, profit, value, alerts), model editing, low-stock threshold per model.
- Purchases: autocomplete brand/model/supplier, inline new models, camera/library picture, receipt, additional costs (watch cost or expense), review step, edit with safe-quantity rules and optional cost correction of past sales, delete (only if untouched), stock adjustments, purchase history with search/filters/sort/CSV.
- Sales: 3-step sell flow, manual batch selection across several batches, negotiated price, delivery fee, paid/partial/unpaid, customer details, review with cost & profit, sale page, later payments, edit, cancel with stock restoration & refund record, sales history with filters/CSV.
- Finance: P&L, cash vs revenue, unpaid balances, inventory investment, expenses (add/edit/delete, receipts, custom categories, filters, CSV).
- Goals: weekly/monthly/yearly/custom, 6 metrics, live progress, milestone notifications (50/75/100/exceeded, once each).
- Notifications: in-app center + iPhone banners (permission flow, honest limits), low/out-of-stock without duplicates, unpaid reminders, goal milestones, sales, inventory corrections.
- Reports: sales / profit / stock / expenses by day/week/month/year, turnover, slow movers, per-sale profit, PDF report, CSV exports.
- History: permanent audit log with before/after values, search, date & type filters.
- Settings: business name/logo, DZD, date format, dark/light theme, default threshold, notification toggles, Face ID lock, full backup (data + pictures) & restore with safety copy, CSV exports, data-protection explanations.
- Premium dark design system, 48-pt touch targets, haptics, loading/empty/error states, confirmations, toasts. English text in `src/i18n/en.ts` (French-ready).
- App icon & splash generated (`scripts/generate-icons.mjs`).

**Verified on this computer**

- `npm test` — 29 automated tests pass (purchases, batches, sales, multi-batch, overselling, cancel/restore, edits, payments, expenses, goals & milestones, stock alerts, adjustments, backup/restore round-trip, CSV safety, money precision, and the spec's financial accuracy scenario).
- `npm run typecheck` — 0 errors. `npx eslint .` — 0 problems. `npx expo-doctor` — 20/20 checks.
- `npx expo export --platform ios` — the full iOS bundle compiles.

## Free iPhone web app (added 2026-11-23)

- Same app published as an installable web app via GitHub Pages (`.github/workflows/publish.yml`), installed with Safari › Add to Home Screen. Guide: docs/INSTALL_ON_IPHONE.md.
- Database in the browser: sql.js saved to IndexedDB after every committed change. Photos resized and stored in IndexedDB. Backup files are compatible with the native app.
- Verified locally on the production build at a GitHub-Pages-style address: data survives reload, deep links work, service worker caches 75 files, app opens with the server switched off. 58 tests pass (29 on each database engine).
- Not yet verified on a physical iPhone: Safari share sheet for backups/exports, camera picker, notification banners, PDF printing.
- Clean upload folder for GitHub's website: Desktop\watch-business-upload (regenerate with robocopy if files change).

## Not yet verified

- **The app has not been run on a real iPhone or simulator yet** (this is a Windows PC; iOS cannot be run here). Visual layout and device features (camera, Face ID, notifications, share sheet) need a first test on your phone — see docs/IPHONE_INSTALL.md option A (Expo Go) for a quick check.

## Blockers needing you

1. **Git and GitHub CLI are not installed** on this PC, so nothing is committed or on GitHub yet. Install them (winget: `Git.Git`, `GitHub.cli`), run `gh auth login`, then create the private repo:
   ```powershell
   git init -b main
   git add -A
   git commit -m "Initial version of Watch Business"
   gh repo create watch-business-manager --private --source . --push
   ```
2. **How to install on the iPhone** — Mac or no Mac (see docs/IPHONE_INSTALL.md). Without a Mac, a permanent install needs the Apple Developer Program (99 USD/year) + a free Expo account.

## How to resume development

```powershell
npm install
npm test
npx expo start     # scan the QR with Expo Go on the iPhone
```

Business rules: `src/domain/` (start with `finance.ts` for the accounting rules). Screens: `src/app/`. Add database changes as a **new** migration in `src/db/schema.ts`.

## Ideas for later (not required)

- French translation (`src/i18n/fr.ts`).
- Home-screen widget with today's sales (native iOS extension).
- Scheduled daily summary notification.
