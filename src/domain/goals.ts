import type { Db } from '../db/types';
import { assert, audit, cleanText, notify, nowISO, requireInt, uuid } from './core';
import { addDays, daysBetween, endOfMonth, endOfYear, isValidISODate, startOfMonth, startOfWeek, startOfYear, today } from './dates';
import { getPeriodMetrics } from './finance';
import { formatMoney, type Money } from './money';

export const GOAL_METRICS = ['net_profit', 'revenue', 'units_sold', 'gross_profit', 'cash_collected', 'sales_count'] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];
export type GoalPeriod = 'weekly' | 'monthly' | 'yearly' | 'custom';

export const METRIC_LABELS: Record<GoalMetric, string> = {
  net_profit: 'Net profit',
  revenue: 'Revenue',
  units_sold: 'Watches sold',
  gross_profit: 'Gross profit',
  cash_collected: 'Cash collected',
  sales_count: 'Number of sales',
};

export function isMoneyMetric(m: GoalMetric) {
  return m !== 'units_sold' && m !== 'sales_count';
}

export type Goal = {
  id: string;
  title: string;
  metric: GoalMetric;
  period: GoalPeriod;
  target_value: number;
  start_date: string;
  end_date: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type GoalProgress = Goal & {
  current: number;
  percent: number; // can exceed 100
  remaining: number;
  daysLeft: number;
  state: 'upcoming' | 'active' | 'ended';
};

export type GoalInput = {
  title: string;
  metric: GoalMetric;
  period: GoalPeriod;
  targetValue: number;
  startDate: string;
  endDate: string;
  description?: string | null;
};

export function datesForPeriod(period: GoalPeriod, ref = today()): { startDate: string; endDate: string } {
  switch (period) {
    case 'weekly':
      return { startDate: startOfWeek(ref), endDate: addDays(startOfWeek(ref), 6) };
    case 'monthly':
      return { startDate: startOfMonth(ref), endDate: endOfMonth(ref) };
    case 'yearly':
      return { startDate: startOfYear(ref), endDate: endOfYear(ref) };
    default:
      return { startDate: ref, endDate: addDays(ref, 30) };
  }
}

function validate(input: GoalInput) {
  assert(cleanText(input.title, 120), 'Goal name is required.');
  assert(GOAL_METRICS.includes(input.metric), 'Choose a goal type.');
  requireInt(input.targetValue, 'Target', 1);
  assert(isValidISODate(input.startDate) && isValidISODate(input.endDate), 'Dates are invalid.');
  assert(input.endDate >= input.startDate, 'End date must be after the start date.');
}

export async function createGoal(db: Db, input: GoalInput): Promise<string> {
  validate(input);
  return db.transaction(async (tx) => {
    const id = uuid();
    const now = nowISO();
    await tx.run(
      `INSERT INTO goals (id, title, metric, period, target_value, start_date, end_date, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, cleanText(input.title, 120), input.metric, input.period, input.targetValue, input.startDate, input.endDate, cleanText(input.description, 1000), now, now],
    );
    await audit(tx, { action: 'goal.create', entityType: 'goal', entityId: id, summary: `Goal created: ${input.title}`, newValues: input });
    return id;
  });
}

export async function updateGoal(db: Db, id: string, input: GoalInput): Promise<void> {
  validate(input);
  await db.transaction(async (tx) => {
    const old = await tx.get<Goal>('SELECT * FROM goals WHERE id = ?', [id]);
    assert(old, 'Goal not found.');
    await tx.run(
      `UPDATE goals SET title = ?, metric = ?, period = ?, target_value = ?, start_date = ?, end_date = ?, description = ?, updated_at = ? WHERE id = ?`,
      [cleanText(input.title, 120), input.metric, input.period, input.targetValue, input.startDate, input.endDate, cleanText(input.description, 1000), nowISO(), id],
    );
    // A changed target means milestones should be re-evaluated against the new target.
    if (old.target_value !== input.targetValue || old.metric !== input.metric || old.start_date !== input.startDate || old.end_date !== input.endDate) {
      await tx.run(`DELETE FROM notifications WHERE dedupe_key LIKE ?`, [`goal:${id}:%`]);
    }
    await audit(tx, { action: 'goal.update', entityType: 'goal', entityId: id, summary: `Goal edited: ${input.title}`, oldValues: old, newValues: input });
  });
}

export async function deleteGoal(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const old = await tx.get<Goal>('SELECT * FROM goals WHERE id = ?', [id]);
    assert(old, 'Goal not found.');
    await tx.run('DELETE FROM goals WHERE id = ?', [id]);
    await audit(tx, { action: 'goal.delete', entityType: 'goal', entityId: id, summary: `Goal deleted: ${old.title}`, oldValues: old });
  });
}

/** Progress is always computed live from real transactions (cancelled sales excluded). */
export async function goalProgress(db: Db, goal: Goal, ref = today()): Promise<GoalProgress> {
  const m = await getPeriodMetrics(db, { from: goal.start_date, to: goal.end_date });
  const current: number = {
    net_profit: m.netProfit,
    revenue: m.revenue,
    units_sold: m.unitsSold,
    gross_profit: m.grossProfit,
    cash_collected: m.cashCollected,
    sales_count: m.salesCount,
  }[goal.metric];
  const percent = goal.target_value > 0 ? Math.round((current / goal.target_value) * 1000) / 10 : 0;
  const state = ref < goal.start_date ? 'upcoming' : ref > goal.end_date ? 'ended' : 'active';
  return {
    ...goal,
    current,
    percent,
    remaining: Math.max(0, goal.target_value - current),
    daysLeft: state === 'ended' ? 0 : daysBetween(ref < goal.start_date ? goal.start_date : ref, goal.end_date) + 1,
    state,
  };
}

export async function listGoalsWithProgress(db: Db): Promise<GoalProgress[]> {
  const goals = await db.all<Goal>('SELECT * FROM goals ORDER BY end_date DESC, created_at DESC');
  const out: GoalProgress[] = [];
  for (const g of goals) out.push(await goalProgress(db, g));
  return out;
}

export const MILESTONES = [50, 75, 100] as const;

export type MilestoneEvent = { goalId: string; title: string; message: string };

/**
 * Creates one notification per goal milestone (50%, 75%, 100%, exceeded).
 * A milestone is never announced twice, even if progress later dips and recovers.
 */
export async function checkGoalMilestones(db: Db, ref = today()): Promise<MilestoneEvent[]> {
  const goals = await db.all<Goal>('SELECT * FROM goals WHERE start_date <= ? AND end_date >= ?', [ref, addDays(ref, -7)]);
  const events: MilestoneEvent[] = [];
  for (const g of goals) {
    const p = await goalProgress(db, g, ref);
    const fmt = (v: Money) => (isMoneyMetric(g.metric) ? formatMoney(v) : String(v));
    const reached = MILESTONES.filter((m) => p.percent >= m);
    for (const m of reached) {
      const title = m === 100 ? `Goal reached: ${g.title}` : `${m}% of “${g.title}”`;
      const message = `${METRIC_LABELS[g.metric]}: ${fmt(p.current)} of ${fmt(g.target_value)} (${p.percent}%).`;
      if (await notify(db, { type: 'goal', title, message, relatedEntityType: 'goal', relatedEntityId: g.id, dedupeKey: `goal:${g.id}:${m}` })) {
        events.push({ goalId: g.id, title, message });
      }
    }
    if (p.percent > 100) {
      const title = `Goal exceeded: ${g.title}`;
      const message = `${METRIC_LABELS[g.metric]}: ${fmt(p.current)} — ${p.percent}% of target.`;
      if (await notify(db, { type: 'goal', title, message, relatedEntityType: 'goal', relatedEntityId: g.id, dedupeKey: `goal:${g.id}:exceeded` })) {
        events.push({ goalId: g.id, title, message });
      }
    }
  }
  return events;
}
