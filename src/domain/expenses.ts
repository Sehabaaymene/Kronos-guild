import type { Db } from '../db/types';
import { assert, audit, BusinessError, cleanText, nextReference, nowISO, PAYMENT_METHODS, requireInt, uuid, type PaymentMethod } from './core';
import { isValidISODate } from './dates';
import { formatMoney, type Money } from './money';

export type ExpenseCategory = { id: string; name: string; is_default: number; created_at: string; usage: number };

export type Expense = {
  id: string;
  reference: string;
  category_id: string;
  category_name: string;
  title: string;
  amount: Money;
  expense_date: string;
  payment_method: PaymentMethod;
  description: string | null;
  receipt_path: string | null;
  purchase_batch_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseInput = {
  requestId?: string;
  categoryId: string;
  title: string;
  amount: Money;
  expenseDate: string;
  paymentMethod?: PaymentMethod;
  description?: string | null;
  receiptPath?: string | null;
};

export async function listExpenseCategories(db: Db): Promise<ExpenseCategory[]> {
  return db.all<ExpenseCategory>(
    `SELECT c.*, (SELECT COUNT(*) FROM expenses e WHERE e.category_id = c.id) AS usage
     FROM expense_categories c ORDER BY c.is_default DESC, c.name COLLATE NOCASE`,
  );
}

export async function createExpenseCategory(db: Db, name: string): Promise<string> {
  const clean = cleanText(name, 60);
  assert(clean, 'Category name is required.');
  return db.transaction(async (tx) => {
    const existing = await tx.get<{ id: string }>('SELECT id FROM expense_categories WHERE name = ? COLLATE NOCASE', [clean]);
    if (existing) return existing.id;
    const id = uuid();
    await tx.run('INSERT INTO expense_categories (id, name, is_default, created_at) VALUES (?, ?, 0, ?)', [id, clean, nowISO()]);
    await audit(tx, { action: 'expense_category.create', entityType: 'expense_category', entityId: id, summary: `Expense category created: ${clean}` });
    return id;
  });
}

export async function deleteExpenseCategory(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const c = await tx.get<{ name: string; is_default: number }>('SELECT name, is_default FROM expense_categories WHERE id = ?', [id]);
    assert(c, 'Category not found.');
    const used = await tx.get<{ n: number }>('SELECT COUNT(*) AS n FROM expenses WHERE category_id = ?', [id]);
    if ((used?.n ?? 0) > 0) throw new BusinessError('This category is used by expenses and cannot be deleted.');
    await tx.run('DELETE FROM expense_categories WHERE id = ?', [id]);
    await audit(tx, { action: 'expense_category.delete', entityType: 'expense_category', entityId: id, summary: `Expense category deleted: ${c.name}` });
  });
}

const EXPENSE_SQL = `SELECT e.*, c.name AS category_name FROM expenses e JOIN expense_categories c ON c.id = e.category_id`;

export async function listExpenses(db: Db, opts: { from?: string | null; to?: string | null; categoryId?: string } = {}): Promise<Expense[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (opts.from) {
    where.push('e.expense_date >= ?');
    params.push(opts.from);
  }
  if (opts.to) {
    where.push('e.expense_date <= ?');
    params.push(opts.to);
  }
  if (opts.categoryId) {
    where.push('e.category_id = ?');
    params.push(opts.categoryId);
  }
  return db.all<Expense>(`${EXPENSE_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.expense_date DESC, e.created_at DESC`, params);
}

export async function getExpense(db: Db, id: string): Promise<Expense | null> {
  return db.get<Expense>(`${EXPENSE_SQL} WHERE e.id = ?`, [id]);
}

function validate(input: ExpenseInput) {
  assert(cleanText(input.title, 120), 'Expense title is required.');
  requireInt(input.amount, 'Amount', 1);
  assert(isValidISODate(input.expenseDate), 'Expense date is invalid.');
  assert(input.categoryId, 'Category is required.');
  assert(PAYMENT_METHODS.includes(input.paymentMethod ?? 'cash'), 'Invalid payment method.');
}

export async function createExpense(db: Db, input: ExpenseInput): Promise<{ id: string; reference: string; duplicate: boolean }> {
  validate(input);
  return db.transaction(async (tx) => {
    if (input.requestId) {
      const dup = await tx.get<{ id: string; reference: string }>('SELECT id, reference FROM expenses WHERE request_id = ?', [input.requestId]);
      if (dup) return { id: dup.id, reference: dup.reference, duplicate: true };
    }
    const cat = await tx.get<{ name: string }>('SELECT name FROM expense_categories WHERE id = ?', [input.categoryId]);
    assert(cat, 'Category not found.');
    const id = uuid();
    const reference = await nextReference(tx, 'E');
    const now = nowISO();
    await tx.run(
      `INSERT INTO expenses (id, reference, request_id, category_id, title, amount, expense_date, payment_method, description, receipt_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        reference,
        input.requestId ?? null,
        input.categoryId,
        cleanText(input.title, 120),
        input.amount,
        input.expenseDate,
        input.paymentMethod ?? 'cash',
        cleanText(input.description, 2000),
        input.receiptPath ?? null,
        now,
        now,
      ],
    );
    await audit(tx, {
      action: 'expense.create',
      entityType: 'expense',
      entityId: id,
      reference,
      summary: `Expense: ${cleanText(input.title, 120)} (${cat.name}) ${formatMoney(input.amount)}`,
      amount: input.amount,
      status: 'recorded',
      newValues: input,
    });
    return { id, reference, duplicate: false };
  });
}

export async function updateExpense(db: Db, id: string, input: ExpenseInput): Promise<void> {
  validate(input);
  await db.transaction(async (tx) => {
    const old = await getExpense(tx, id);
    assert(old, 'Expense not found.');
    if (old.purchase_batch_id) throw new BusinessError('This expense was created from a purchase. Edit the purchase instead.');
    await tx.run(
      `UPDATE expenses SET category_id = ?, title = ?, amount = ?, expense_date = ?, payment_method = ?, description = ?, receipt_path = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.categoryId,
        cleanText(input.title, 120),
        input.amount,
        input.expenseDate,
        input.paymentMethod ?? 'cash',
        cleanText(input.description, 2000),
        input.receiptPath ?? null,
        nowISO(),
        id,
      ],
    );
    await audit(tx, {
      action: 'expense.update',
      entityType: 'expense',
      entityId: id,
      reference: old.reference,
      summary: `Expense ${old.reference} edited: ${formatMoney(old.amount)} → ${formatMoney(input.amount)}`,
      amount: input.amount,
      status: 'edited',
      oldValues: old,
      newValues: input,
    });
  });
}

export async function deleteExpense(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const old = await getExpense(tx, id);
    assert(old, 'Expense not found.');
    if (old.purchase_batch_id) throw new BusinessError('This expense was created from a purchase. Edit the purchase instead.');
    await tx.run('DELETE FROM expenses WHERE id = ?', [id]);
    await audit(tx, {
      action: 'expense.delete',
      entityType: 'expense',
      entityId: id,
      reference: old.reference,
      summary: `Expense ${old.reference} deleted: ${old.title} ${formatMoney(old.amount)}`,
      amount: old.amount,
      status: 'deleted',
      oldValues: old,
    });
  });
}
