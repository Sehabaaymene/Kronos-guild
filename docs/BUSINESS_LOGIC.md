# Business logic and accounting rules

All rules live in `src/domain/` and are covered by `tests/business.test.ts`.

## Money

- Stored as **INTEGER centimes** (1 DZD = 100). No floating point anywhere.
- Displayed as `12,000 DZD` (decimals only when non-zero). No currency conversion.
- When additional costs are spread across units, each share is rounded to the nearest centime.

## Products and purchase batches

- A **product** is a watch model (brand + model, unique, case-insensitive).
- Every purchase creates a new **purchase batch** with its own date, quantity, unit cost, expected price and supplier. Buying the same model again at another price never overwrites an older batch.
- Stock of a model = sum of `quantity_remaining` over its batches. A batch can never go below 0 or above the quantity purchased (database CHECK constraints).
- The latest purchase's expected selling price becomes the model's suggested price.

### Additional purchase costs

Chosen explicitly on each purchase:

- **Add to watch cost** — spread over the units of the batch; each sold watch carries its share in COGS, and unsold units carry it in inventory value.
- **Record as expense** — a linked operating expense (“Supplier-related expenses”) is created and kept in sync with the purchase.

## Sales

- The user chooses the **exact batch** for every watch. Several batches can be used in one sale (one line per batch). A batch is only pre-selected when it is the only one available.
- Each sale line saves a **snapshot**: the real selling price and the unit cost (and additional-cost share) at the time of sale.
- Stock is decremented with a guarded update (`… WHERE quantity_remaining >= qty`); if any line lacks stock the whole sale is rolled back.
- **Delivery fee charged to the customer** is part of the sale's revenue (the courier's actual cost is recorded as an expense).

### Payments

- Paid / partially paid / unpaid is **derived from the payments recorded**, never typed in separately.
- Unpaid sales count as revenue (the watch is sold) but **not as cash**. Outstanding balance = sale total − payments.
- Later payments are added from the sale page and cannot exceed the balance.

### Editing a sale

Atomic: old units return to their batches, new lines are validated and taken out, totals recalculated. A change in the amount received is recorded as a payment *correction* so the payment history is preserved. The audit log keeps before/after.

### Cancelling a sale

The exact quantities go back to the original batches; the sale stays (status *cancelled*) for history and never counts in revenue/profit/goals; money received is recorded as a refund (negative payment).

## Editing a purchase

- The quantity can never go below the units already sold or adjusted (the app shows the minimum). New remaining = new quantity − consumed.
- Correcting the model moves the batch's sales to the corrected model (and removes the mistyped model if nothing else uses it).
- Correcting the unit cost when units were already sold: by default past sales **keep their historical cost**; the user can choose “Also correct the cost on past sales” when the original price was a typo.
- A purchase can only be deleted if none of its units were sold or adjusted.

## Stock adjustments

For stock that leaves without a sale (damaged, lost, personal use, returned to supplier, count correction). The cost of removed units is an **inventory loss** that reduces net profit. Units can be added back only up to what corrections removed (sold units come back by cancelling the sale).

## Formulas (`src/domain/finance.ts`)

| Figure | Definition |
| --- | --- |
| Revenue | Σ total of **completed** sales dated in the period (watch prices + delivery fees charged) |
| COGS | Σ snapshot cost of the units sold in those sales |
| Gross profit | Revenue − COGS |
| Operating expenses | Σ expenses dated in the period |
| Inventory losses | Σ cost of units removed by adjustments − units added back |
| Net profit | Gross profit − Operating expenses − Inventory losses |
| Inventory value | Σ over batches: remaining × unit cost (+ remaining share of allocated extras) |
| Cash collected | Σ payments dated in the period (refunds negative) |
| Avg profit per watch | Σ line gross profit ÷ watches sold |

Buying stock is **not** an expense: it becomes inventory and only turns into cost (COGS) when sold — so a purchase cost is never subtracted twice.

### Verified reference scenario

5 watches at 8,000 + 3 at 9,000; sell 2 from the first batch at 12,000 → revenue 24,000 · COGS 16,000 · gross profit 8,000 · batches 3 + 3 · stock 6 · inventory value 51,000 DZD. (Automated test.)

## Goals

Progress is computed live from transactions for the goal's dates (weekly/monthly/yearly presets or custom). Metrics: net profit, revenue, watches sold, gross profit, cash collected, number of sales. Milestones 50 %, 75 %, 100 % and *exceeded* each notify **once** (unique key per goal + milestone). Changing a goal's target or dates re-arms its milestones.

## Alerts

- Low/out of stock: each model keeps its alert state (ok → low → out); a notification is created only when the state gets worse, so opening the app never duplicates alerts; restocking resets it.
- Unpaid reminders: once per sale still unpaid N days (default 3) after the sale.
- Checks run after every change and at app start; iPhone banners are sent only when enabled and permitted.

## Integrity guarantees

- Every write runs in an **exclusive SQLite transaction** — it fully succeeds or changes nothing.
- Forms carry a one-time **request id**: double-tapping *Confirm* can never create two purchases, sales or expenses.
- Foreign keys are enforced; references (P-0001, S-0001, E-0001, A-0001) are sequential and unique.
- Every create/edit/cancel/delete is written to `audit_logs` with old and new values.
