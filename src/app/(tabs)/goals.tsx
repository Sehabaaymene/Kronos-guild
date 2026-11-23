import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatDate } from '../../domain/dates';
import { isMoneyMetric, listGoalsWithProgress, METRIC_LABELS, type GoalProgress } from '../../domain/goals';
import { formatMoney, groupThousands } from '../../domain/money';
import { useApp, useData } from '../../state/app';
import { radius, space, useTheme } from '../../theme';
import { Badge, Button, EmptyState, IconButton, Loading, ProgressBar, Row, SectionTitle, Segmented, Txt } from '../../ui/primitives';
import { Screen } from '../../ui/Screen';

function fmtGoal(g: { metric: GoalProgress['metric'] }, v: number) {
  return isMoneyMetric(g.metric) ? formatMoney(v) : groupThousands(v);
}

function GoalCard({ g }: { g: GoalProgress }) {
  const { colors } = useTheme();
  const { settings } = useApp();
  const done = g.percent >= 100;
  const negative = g.current < 0;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/goal/[id]', params: { id: g.id } })}
      style={({ pressed }) => ({
        padding: space.lg,
        borderRadius: radius.lg,
        backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: done ? colors.positive : colors.border,
        gap: space.sm,
      })}
    >
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Txt variant="caption" tone="gold" style={{ fontWeight: '700', letterSpacing: 0.6 }}>
            {g.period.toUpperCase()} · {METRIC_LABELS[g.metric].toUpperCase()}
          </Txt>
          <Txt variant="bodyStrong" style={{ marginTop: 2 }}>
            {g.title}
          </Txt>
        </View>
        <Txt variant="title" numeric tone={done ? 'positive' : negative ? 'negative' : 'default'}>
          {Math.round(g.percent)}%
        </Txt>
      </Row>
      <ProgressBar value={g.percent} tone={done ? 'positive' : negative ? 'negative' : 'gold'} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="small" numeric>
          {fmtGoal(g, g.current)} <Txt variant="small" tone="muted">of {fmtGoal(g, g.target_value)}</Txt>
        </Txt>
        <Txt variant="caption" tone="muted">
          {done ? (g.percent > 100 ? 'Exceeded 🎉' : 'Reached 🎉') : `${fmtGoal(g, g.remaining)} to go`}
        </Txt>
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="caption" tone="faint">
          {formatDate(g.start_date, settings.dateFormat)} – {formatDate(g.end_date, settings.dateFormat)}
        </Txt>
        {g.state === 'active' ? (
          <Badge label={`${g.daysLeft} DAY${g.daysLeft === 1 ? '' : 'S'} LEFT`} tone="muted" />
        ) : g.state === 'upcoming' ? (
          <Badge label="UPCOMING" tone="gold" />
        ) : (
          <Badge label="ENDED" tone={done ? 'positive' : 'negative'} />
        )}
      </Row>
    </Pressable>
  );
}

export default function Goals() {
  const [view, setView] = useState<'current' | 'past'>('current');
  const { data } = useData((db) => listGoalsWithProgress(db));
  const current = (data ?? []).filter((g) => g.state !== 'ended');
  const past = (data ?? []).filter((g) => g.state === 'ended');
  const list = view === 'current' ? current : past;
  const groups: { title: string; items: GoalProgress[] }[] = [
    { title: 'Profit goals', items: list.filter((g) => g.metric === 'net_profit' || g.metric === 'gross_profit') },
    { title: 'Revenue & cash goals', items: list.filter((g) => g.metric === 'revenue' || g.metric === 'cash_collected') },
    { title: 'Sales volume goals', items: list.filter((g) => g.metric === 'units_sold' || g.metric === 'sales_count') },
  ];
  return (
    <Screen title="Goals" subtitle="Targets tracked from real transactions" right={<IconButton icon="add" label="New goal" tone="gold" onPress={() => router.push('/goal/new')} />} tabScreen>
      <Segmented
        options={[
          { value: 'current', label: `Current (${current.length})` },
          { value: 'past', label: `Past (${past.length})` },
        ]}
        value={view}
        onChange={setView}
      />
      {!data ? (
        <Loading />
      ) : !list.length ? (
        <EmptyState
          icon="flag-outline"
          title={view === 'current' ? 'No active goals' : 'No past goals'}
          message="Set weekly, monthly or yearly targets for net profit, revenue or watches sold. Progress updates automatically with every sale, expense and correction."
          action={view === 'current' ? 'Create a goal' : undefined}
          onAction={() => router.push('/goal/new')}
        />
      ) : (
        groups
          .filter((g) => g.items.length)
          .map((grp) => (
            <View key={grp.title}>
              <SectionTitle title={grp.title} />
              <View style={{ gap: space.md }}>
                {grp.items.map((g) => (
                  <GoalCard key={g.id} g={g} />
                ))}
              </View>
            </View>
          ))
      )}
      {data && list.length ? <Button title="New goal" icon="add" variant="secondary" onPress={() => router.push('/goal/new')} style={{ marginTop: space.xl }} /> : null}
    </Screen>
  );
}
