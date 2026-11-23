import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Alert } from '../ui/dialog';
import { formatDate } from '../domain/dates';
import { formatMoney } from '../domain/money';
import { listBatches } from '../domain/purchases';
import { exportCSV } from '../services/exportService';
import { errorMessage, useApp, useData } from '../state/app';
import { space } from '../theme';
import { initialPeriod, PeriodPicker, periodRange, type PeriodState } from '../ui/PeriodPicker';
import { Card, Chips, EmptyState, IconButton, ListRow, Loading, ProductThumb, Row, Txt } from '../ui/primitives';
import { Screen, SearchBar } from '../ui/Screen';

type Sort = 'newest' | 'oldest' | 'amount';

export default function PurchaseHistory() {
  const { db, settings } = useApp();
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState('all');
  const [supplier, setSupplier] = useState('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [period, setPeriod] = useState<PeriodState>(initialPeriod('all'));
  const range = periodRange(period);
  const { data } = useData((db) => listBatches(db));

  const brands = useMemo(() => [...new Set((data ?? []).map((b) => b.brand_name))].sort(), [data]);
  const suppliers = useMemo(() => [...new Set((data ?? []).map((b) => b.supplier_name).filter(Boolean) as string[])].sort(), [data]);

  const rows = useMemo(() => {
    let list = (data ?? []).filter((b) => (!range.from || b.purchase_date >= range.from) && (!range.to || b.purchase_date <= range.to));
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((b) => `${b.reference} ${b.brand_name} ${b.model} ${b.supplier_name ?? ''} ${b.notes ?? ''}`.toLowerCase().includes(s));
    if (brand !== 'all') list = list.filter((b) => b.brand_name === brand);
    if (supplier !== 'all') list = list.filter((b) => b.supplier_name === supplier);
    if (sort === 'oldest') list = [...list].reverse();
    if (sort === 'amount') list = [...list].sort((a, b) => b.total_cost - a.total_cost);
    return list;
  }, [data, q, brand, supplier, sort, range.from, range.to]);

  const total = rows.reduce((s, b) => s + b.total_cost + b.additional_cost, 0);
  const units = rows.reduce((s, b) => s + b.quantity_purchased, 0);

  const doExport = async () => {
    try {
      await exportCSV(db, 'purchases', range);
    } catch (e) {
      Alert.alert('Export', errorMessage(e));
    }
  };

  return (
    <Screen
      title="Purchase history"
      subtitle={`${rows.length} purchase(s) · ${units} watches · ${formatMoney(total)}`}
      back
      right={
        <>
          <IconButton icon="share-outline" label="Export CSV" onPress={doExport} />
          <IconButton icon="add" label="New purchase" tone="gold" onPress={() => router.push('/purchase/new')} />
        </>
      }
    >
      <SearchBar value={q} onChangeText={setQ} placeholder="Search reference, model, supplier…" />
      <View style={{ marginTop: space.md }}>
        <PeriodPicker value={period} onChange={setPeriod} />
      </View>
      {brands.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg, marginTop: space.md }} contentContainerStyle={{ paddingHorizontal: space.lg }}>
          <Chips scroll options={[{ value: 'all', label: 'All brands' }, ...brands.map((b) => ({ value: b, label: b }))]} value={brand} onChange={setBrand} />
        </ScrollView>
      ) : null}
      {suppliers.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg, marginTop: space.sm }} contentContainerStyle={{ paddingHorizontal: space.lg }}>
          <Chips scroll options={[{ value: 'all', label: 'All suppliers' }, ...suppliers.map((b) => ({ value: b, label: b }))]} value={supplier} onChange={setSupplier} />
        </ScrollView>
      ) : null}
      <Row style={{ justifyContent: 'flex-end', marginTop: space.md }}>
        <Pressable hitSlop={10} onPress={() => setSort(sort === 'newest' ? 'oldest' : sort === 'oldest' ? 'amount' : 'newest')}>
          <Txt variant="caption" tone="gold" style={{ fontWeight: '600' }}>
            Sort: {sort === 'newest' ? 'Newest first' : sort === 'oldest' ? 'Oldest first' : 'Largest amount'} ↻
          </Txt>
        </Pressable>
      </Row>
      {!data ? (
        <Loading />
      ) : !rows.length ? (
        <EmptyState icon="cube-outline" title="No purchases" message={data.length ? 'No purchase matches these filters.' : 'Recorded purchases will appear here.'} />
      ) : (
        <Card padded={false} style={{ marginTop: space.sm }}>
          {rows.map((b, i) => (
            <ListRow
              key={b.id}
              left={<ProductThumb path={b.image_path} size={44} />}
              title={`${b.brand_name} ${b.model}`}
              subtitle={`${b.reference} · ${formatDate(b.purchase_date, settings.dateFormat)} · ${b.quantity_purchased} × ${formatMoney(b.unit_cost)}${b.supplier_name ? ' · ' + b.supplier_name : ''}`}
              right={formatMoney(b.total_cost + b.additional_cost)}
              rightSub={`${b.quantity_remaining} left`}
              onPress={() => router.push({ pathname: '/purchase/[id]', params: { id: b.id } })}
              last={i === rows.length - 1}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
