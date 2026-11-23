import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { listActivity } from '../domain/finance';
import { useData } from '../state/app';
import { space } from '../theme';
import { ActivityItem } from '../ui/business';
import { initialPeriod, PeriodPicker, periodRange, type PeriodState } from '../ui/PeriodPicker';
import { Card, Chips, EmptyState, Loading, Txt } from '../ui/primitives';
import { Screen, SearchBar } from '../ui/Screen';

const TYPES = [
  { value: 'all', label: 'Everything' },
  { value: 'purchase', label: 'Purchases & stock' },
  { value: 'sale', label: 'Sales' },
  { value: 'expense', label: 'Expenses' },
  { value: 'product', label: 'Models' },
  { value: 'goal', label: 'Goals' },
];

export default function History() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [period, setPeriod] = useState<PeriodState>(initialPeriod('all'));
  const range = periodRange(period);
  const key = JSON.stringify([range, q, type]);
  const { data } = useData((db) => listActivity(db, { limit: 500, search: q, from: range.from, to: range.to, types: type === 'all' ? undefined : [type] }), [key]);

  return (
    <Screen title="Business history" subtitle="Every purchase, sale, expense, edit and cancellation" back>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search reference or description" />
      <View style={{ marginTop: space.md }}>
        <PeriodPicker value={period} onChange={setPeriod} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg, marginTop: space.md }} contentContainerStyle={{ paddingHorizontal: space.lg }}>
        <Chips scroll options={TYPES} value={type} onChange={setType} />
      </ScrollView>
      {!data ? (
        <Loading />
      ) : !data.length ? (
        <EmptyState icon="time-outline" title="No activity" message="Nothing matches these filters." />
      ) : (
        <>
          <Txt variant="caption" tone="faint" style={{ marginTop: space.md, marginBottom: space.sm }}>
            {data.length}
            {data.length === 500 ? '+' : ''} entries · tap one for details
          </Txt>
          <Card padded={false}>
            {data.map((a, i) => (
              <ActivityItem key={a.id} a={a} last={i === data.length - 1} />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
