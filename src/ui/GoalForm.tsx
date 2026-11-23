import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Alert } from './dialog';
import { createGoal, datesForPeriod, deleteGoal, goalProgress, GOAL_METRICS, isMoneyMetric, METRIC_LABELS, updateGoal, type Goal, type GoalMetric, type GoalPeriod } from '../domain/goals';
import { formatMoney, groupThousands, moneyToInput, parseMoney } from '../domain/money';
import { useApp } from '../state/app';
import { space } from '../theme';
import { DateField, Field, MoneyField } from './forms';
import { Button, Card, Chips, KeyValue, Loading, ProgressBar, Row, SectionTitle, Txt } from './primitives';
import { Screen } from './Screen';

const PERIODS: { value: GoalPeriod; label: string }[] = [
  { value: 'weekly', label: 'This week' },
  { value: 'monthly', label: 'This month' },
  { value: 'yearly', label: 'This year' },
  { value: 'custom', label: 'Custom dates' },
];

const PERIOD_NAME: Record<GoalPeriod, string> = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly', custom: 'Custom' };

export function GoalForm({ editId }: { editId?: string }) {
  const { db, mutate } = useApp();
  const [loaded, setLoaded] = useState(!editId);
  const [metric, setMetric] = useState<GoalMetric>('net_profit');
  const [period, setPeriod] = useState<GoalPeriod>('monthly');
  const [typedTitle, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [target, setTarget] = useState('');
  const [dates, setDates] = useState(datesForPeriod('monthly'));
  const [description, setDescription] = useState('');
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof goalProgress>> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editId) return;
    db.get<Goal>('SELECT * FROM goals WHERE id = ?', [editId]).then(async (g) => {
      if (g) {
        setMetric(g.metric);
        setPeriod(g.period);
        setTitle(g.title);
        setTitleTouched(true);
        setTarget(isMoneyMetric(g.metric) ? moneyToInput(g.target_value) : String(g.target_value));
        setDates({ startDate: g.start_date, endDate: g.end_date });
        setDescription(g.description ?? '');
        setProgress(await goalProgress(db, g));
      }
      setLoaded(true);
    });
  }, [db, editId]);

  if (!loaded) return <Screen title="Goal" back><Loading /></Screen>;
  // Until the user types a name, the goal is named after its type and period.
  const title = titleTouched ? typedTitle : `${PERIOD_NAME[period]} ${METRIC_LABELS[metric].toLowerCase()}`;
  const money = isMoneyMetric(metric);
  const targetValue = money ? parseMoney(target) : /^\d+$/.test(target.trim()) ? Number(target.trim()) : null;
  const valid = !!title.trim() && targetValue != null && targetValue > 0 && dates.endDate >= dates.startDate;

  const save = async () => {
    setSaving(true);
    const input = { title, metric, period, targetValue: targetValue!, startDate: dates.startDate, endDate: dates.endDate, description };
    const res = editId ? await mutate((db) => updateGoal(db, editId, input), { success: 'Goal updated' }) : await mutate((db) => createGoal(db, input), { success: 'Goal created' });
    setSaving(false);
    if (res !== undefined) router.back();
  };

  const remove = () =>
    Alert.alert('Delete this goal?', title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if ((await mutate((db) => deleteGoal(db, editId!), { success: 'Goal deleted' })) !== undefined) router.back();
        },
      },
    ]);

  const fmt = (v: number) => (isMoneyMetric(progress?.metric ?? metric) ? formatMoney(v) : groupThousands(v));

  return (
    <Screen
      title={editId ? 'Goal' : 'New goal'}
      back
      footer={
        <Row gap={space.sm}>
          {editId ? <Button title="Delete" variant="danger" icon="trash-outline" onPress={remove} style={{ flex: 1 }} /> : null}
          <Button title={editId ? 'Save goal' : 'Create goal'} icon="checkmark" onPress={save} loading={saving} disabled={!valid} style={{ flex: 2 }} />
        </Row>
      }
    >
      {progress ? (
        <Card style={{ marginBottom: space.lg }}>
          <Txt variant="overline" tone="muted">
            Progress
          </Txt>
          <Txt variant="display" numeric tone={progress.percent >= 100 ? 'positive' : 'default'} style={{ marginVertical: 6 }}>
            {Math.round(progress.percent)}%
          </Txt>
          <ProgressBar value={progress.percent} tone={progress.percent >= 100 ? 'positive' : 'gold'} />
          <KeyValue label="Current result" value={fmt(progress.current)} />
          <KeyValue label="Target" value={fmt(progress.target_value)} />
          <KeyValue label="Remaining" value={fmt(progress.remaining)} />
          <KeyValue label="Time remaining" value={progress.state === 'ended' ? 'Ended' : `${progress.daysLeft} day(s)`} />
        </Card>
      ) : null}
      <SectionTitle title="What to track" />
      <Chips options={GOAL_METRICS.map((m) => ({ value: m, label: METRIC_LABELS[m] }))} value={metric} onChange={setMetric} />
      <Txt variant="caption" tone="muted" style={{ marginTop: space.sm, lineHeight: 16 }}>
        {metric === 'cash_collected'
          ? 'Counts only money actually received from customers (unpaid sales do not count).'
          : metric === 'net_profit'
            ? 'Revenue − cost of watches sold − expenses. Cancelled sales never count.'
            : metric === 'units_sold'
              ? 'Number of watches sold in completed sales.'
              : 'Calculated from completed sales only.'}
      </Txt>
      <SectionTitle title="Period" />
      <Chips
        options={PERIODS}
        value={period}
        onChange={(p) => {
          setPeriod(p);
          if (p !== 'custom') setDates(datesForPeriod(p));
        }}
      />
      <Row gap={space.md} style={{ marginTop: space.md, alignItems: 'flex-start' }}>
        <DateFieldHalf label="Start" value={dates.startDate} onChange={(startDate) => setDates({ ...dates, startDate })} />
        <DateFieldHalf label="End" value={dates.endDate} onChange={(endDate) => setDates({ ...dates, endDate })} />
      </Row>
      <SectionTitle title="Target" />
      {money ? (
        <MoneyField label="Target amount" value={target} onChangeText={setTarget} />
      ) : (
        <Field label="Target quantity" value={target} onChangeText={(v) => setTarget(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="e.g. 20" />
      )}
      <Field
        label="Goal name"
        value={title}
        onChangeText={(v) => {
          setTitleTouched(true);
          setTitle(v);
        }}
      />
      <Field label="Description" optional value={description} onChangeText={setDescription} multiline />
    </Screen>
  );
}

function DateFieldHalf(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <DateField {...props} />
    </View>
  );
}
