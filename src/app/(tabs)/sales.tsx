import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Alert } from '../../ui/dialog';
import { formatDate } from '../../domain/dates';
import { getPeriodMetrics } from '../../domain/finance';
import { formatMoney } from '../../domain/money';
import { listSales } from '../../domain/sales';
import { exportCSV } from '../../services/exportService';
import { errorMessage, useApp, useData } from '../../state/app';
import { space } from '../../theme';
import { Grid, StatTile } from '../../ui/business';
import { initialPeriod, PeriodPicker, periodRange, type PeriodState } from '../../ui/PeriodPicker';
import { Button, Card, Chips, EmptyState, IconButton, ListRow, Loading, ProductThumb, Row, Txt } from '../../ui/primitives';
import { Screen, SearchBar } from '../../ui/Screen';

type Filter = 'all' | 'unpaid' | 'cancelled';

export default function Sales() {
  const { db, settings } = useApp();
  const [period, setPeriod] = useState<PeriodState>(initialPeriod('month'));
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sortAmount, setSortAmount] = useState(false);
  const range = periodRange(period);
  const key = JSON.stringify(range);
  const { data } = useData(async (db) => ({ sales: await listSales(db, range), m: await getPeriodMetrics(db, range) }), [key]);

  const rows = useMemo(() => {
    let list = data?.sales ?? [];
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((x) => `${x.reference} ${x.title} ${x.customer_name ?? ''} ${x.customer_phone ?? ''} ${x.order_reference ?? ''}`.toLowerCase().includes(s));
    if (filter === 'unpaid') list = list.filter((x) => x.status === 'completed' && x.payment_status !== 'paid');
    if (filter === 'cancelled') list = list.filter((x) => x.status === 'cancelled');
    if (filter === 'all') list = list.filter((x) => x.status === 'completed');
    if (sortAmount) list = [...list].sort((a, b) => b.total_revenue - a.total_revenue);
    return list;
  }, [data, q, filter, sortAmount]);

  const doExport = async () => {
    try {
      await exportCSV(db, 'sales', range);
    } catch (e) {
      Alert.alert('Export', errorMessage(e));
    }
  };

  return (
    <Screen title="Sales" subtitle="Sales history" right={<IconButton icon="share-outline" label="Export sales CSV" onPress={doExport} />} tabScreen>
      <Button title="Sell a watch" icon="bag-handle" onPress={() => router.push('/sell')} />
      <View style={{ marginTop: space.lg }}>
        <PeriodPicker value={period} onChange={setPeriod} />
      </View>
      {data ? (
        <View style={{ marginTop: space.md }}>
          <Grid>
            <StatTile label="Revenue" value={formatMoney(data.m.revenue)} sub={`${data.m.salesCount} sale(s)`} />
            <StatTile label="Gross profit" value={formatMoney(data.m.grossProfit)} tone={data.m.grossProfit < 0 ? 'negative' : 'positive'} sub={`${data.m.unitsSold} watch(es)`} />
          </Grid>
        </View>
      ) : null}
      <View style={{ marginTop: space.lg }}>
        <SearchBar value={q} onChangeText={setQ} placeholder="Search sale, watch, customer, phone…" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg, marginTop: space.md }} contentContainerStyle={{ paddingHorizontal: space.lg }}>
        <Chips
          scroll
          options={[
            { value: 'all', label: 'Completed' },
            { value: 'unpaid', label: 'Unpaid / partial' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </ScrollView>
      <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
        <Txt variant="caption" tone="faint">
          {rows.length} sale(s)
        </Txt>
        <Pressable hitSlop={10} onPress={() => setSortAmount(!sortAmount)}>
          <Txt variant="caption" tone="gold" style={{ fontWeight: '600' }}>
            Sort: {sortAmount ? 'Largest amount' : 'Newest first'} ↻
          </Txt>
        </Pressable>
      </Row>
      {!data ? (
        <Loading />
      ) : !rows.length ? (
        <EmptyState icon="bag-handle-outline" title="No sales here" message="Sales in the selected period and filter will appear here." />
      ) : (
        <Card padded={false} style={{ marginTop: space.sm }}>
          {rows.map((x, i) => (
            <ListRow
              key={x.id}
              left={<ProductThumb path={x.image_path} size={44} />}
              title={x.title || x.reference}
              subtitle={`${x.reference} · ${formatDate(x.sale_date, settings.dateFormat)} · ${x.units} pc${x.customer_name ? ' · ' + x.customer_name : ''}${
                x.status === 'completed' && x.payment_status !== 'paid' ? ` · owes ${formatMoney(x.total_revenue - x.amount_paid)}` : ''
              }`}
              right={formatMoney(x.total_revenue)}
              rightTone={x.status === 'cancelled' ? 'faint' : 'default'}
              rightSub={x.status === 'cancelled' ? 'cancelled' : `profit ${formatMoney(x.gross_profit, { sign: true })}`}
              onPress={() => router.push({ pathname: '/sale/[id]', params: { id: x.id } })}
              last={i === rows.length - 1}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
