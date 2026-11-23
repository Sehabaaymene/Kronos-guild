import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Alert } from '../ui/dialog';
import { formatDate } from '../domain/dates';
import { listExpenseCategories, listExpenses } from '../domain/expenses';
import { formatMoney } from '../domain/money';
import { exportCSV } from '../services/exportService';
import { errorMessage, useApp, useData } from '../state/app';
import { space } from '../theme';
import { PAYMENT_METHOD_LABEL } from '../ui/business';
import { initialPeriod, PeriodPicker, periodRange, type PeriodState } from '../ui/PeriodPicker';
import { Card, Chips, EmptyState, IconButton, ListRow, Loading, Row, Txt } from '../ui/primitives';
import { Screen, SearchBar } from '../ui/Screen';

export default function Expenses() {
  const { db, settings } = useApp();
  const [period, setPeriod] = useState<PeriodState>(initialPeriod('month'));
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [method, setMethod] = useState('all');
  const [byAmount, setByAmount] = useState(false);
  const range = periodRange(period);
  const key = JSON.stringify(range);
  const { data } = useData(async (db) => ({ list: await listExpenses(db, range), cats: await listExpenseCategories(db) }), [key]);

  const rows = useMemo(() => {
    let list = data?.list ?? [];
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((e) => `${e.reference} ${e.title} ${e.category_name} ${e.description ?? ''}`.toLowerCase().includes(s));
    if (cat !== 'all') list = list.filter((e) => e.category_id === cat);
    if (method !== 'all') list = list.filter((e) => e.payment_method === method);
    if (byAmount) list = [...list].sort((a, b) => b.amount - a.amount);
    return list;
  }, [data, q, cat, method, byAmount]);
  const total = rows.reduce((s, e) => s + e.amount, 0);

  const doExport = async () => {
    try {
      await exportCSV(db, 'expenses', range);
    } catch (e) {
      Alert.alert('Export', errorMessage(e));
    }
  };

  return (
    <Screen
      title="Expenses"
      subtitle={`${rows.length} expense(s) · ${formatMoney(total)}`}
      back
      right={
        <>
          <IconButton icon="share-outline" label="Export CSV" onPress={doExport} />
          <IconButton icon="add" label="Add expense" tone="gold" onPress={() => router.push('/expense/new')} />
        </>
      }
    >
      <SearchBar value={q} onChangeText={setQ} placeholder="Search expenses" />
      <View style={{ marginTop: space.md }}>
        <PeriodPicker value={period} onChange={setPeriod} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg, marginTop: space.md }} contentContainerStyle={{ paddingHorizontal: space.lg }}>
        <Chips scroll options={[{ value: 'all', label: 'All categories' }, ...(data?.cats ?? []).map((c) => ({ value: c.id, label: c.name }))]} value={cat} onChange={setCat} />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg, marginTop: space.sm }} contentContainerStyle={{ paddingHorizontal: space.lg }}>
        <Chips scroll options={[{ value: 'all', label: 'Any payment' }, ...Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({ value, label }))]} value={method} onChange={setMethod} />
      </ScrollView>
      <Row style={{ justifyContent: 'flex-end', marginTop: space.md }}>
        <Pressable hitSlop={10} onPress={() => setByAmount(!byAmount)}>
          <Txt variant="caption" tone="gold" style={{ fontWeight: '600' }}>
            Sort: {byAmount ? 'Largest amount' : 'Newest first'} ↻
          </Txt>
        </Pressable>
      </Row>
      {!data ? (
        <Loading />
      ) : !rows.length ? (
        <EmptyState icon="receipt-outline" title="No expenses" message="Expenses in this period and filter will appear here." action="Add expense" onAction={() => router.push('/expense/new')} />
      ) : (
        <Card padded={false} style={{ marginTop: space.sm }}>
          {rows.map((e, i) => (
            <ListRow
              key={e.id}
              icon={e.purchase_batch_id ? 'cube-outline' : 'receipt-outline'}
              iconTone="negative"
              title={e.title}
              subtitle={`${e.reference} · ${e.category_name} · ${formatDate(e.expense_date, settings.dateFormat)} · ${PAYMENT_METHOD_LABEL[e.payment_method]}`}
              right={formatMoney(e.amount)}
              onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })}
              last={i === rows.length - 1}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
