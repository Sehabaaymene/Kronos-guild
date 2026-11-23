import React from 'react';
import { ScrollView, View } from 'react-native';
import { formatDate, rangeForPeriod, today, type DateRange, type PeriodKey } from '../domain/dates';
import { t } from '../i18n';
import { space } from '../theme';
import { DateField } from './forms';
import { Chips, Txt } from './primitives';

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'today', label: t('period.today') },
  { value: 'week', label: t('period.week') },
  { value: 'month', label: t('period.month') },
  { value: 'year', label: t('period.year') },
  { value: 'all', label: t('period.all') },
  { value: 'custom', label: t('period.custom') },
];

export type PeriodState = { period: PeriodKey; custom: { from: string; to: string } };

export function initialPeriod(period: PeriodKey = 'month'): PeriodState {
  const ref = today();
  return { period, custom: { from: ref.slice(0, 8) + '01', to: ref } };
}

export function periodRange(s: PeriodState): DateRange {
  return rangeForPeriod(s.period, today(), s.custom);
}

export function periodLabel(s: PeriodState): string {
  const opt = PERIOD_OPTIONS.find((o) => o.value === s.period)?.label ?? '';
  if (s.period === 'custom') return `${formatDate(s.custom.from)} – ${formatDate(s.custom.to)}`;
  if (s.period === 'all') return opt;
  const r = periodRange(s);
  return r.from === r.to ? formatDate(r.from) : `${formatDate(r.from)} – ${formatDate(r.to)}`;
}

export function PeriodPicker({ value, onChange }: { value: PeriodState; onChange: (s: PeriodState) => void }) {
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg }}>
        <Chips scroll options={PERIOD_OPTIONS} value={value.period} onChange={(p) => onChange({ ...value, period: p })} />
      </ScrollView>
      {value.period === 'custom' ? (
        <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.md }}>
          <View style={{ flex: 1 }}>
            <DateField label="From" value={value.custom.from} onChange={(from) => onChange({ ...value, custom: { ...value.custom, from } })} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField label="To" value={value.custom.to} onChange={(to) => onChange({ ...value, custom: { ...value.custom, to } })} />
          </View>
        </View>
      ) : (
        <Txt variant="caption" tone="faint" style={{ marginTop: space.sm }}>
          {value.period === 'all' ? 'All recorded activity' : periodLabel(value)}
        </Txt>
      )}
    </View>
  );
}
