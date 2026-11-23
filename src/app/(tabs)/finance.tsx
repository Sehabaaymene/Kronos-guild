import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { formatDate } from '../../domain/dates';
import { listExpenses } from '../../domain/expenses';
import { expensesByCategory, getInventorySnapshot, getPeriodMetrics, getReceivables, getSeries } from '../../domain/finance';
import { formatMoney } from '../../domain/money';
import { t } from '../../i18n';
import { useApp, useData } from '../../state/app';
import { space } from '../../theme';
import { Grid, StatTile } from '../../ui/business';
import { BarChart, RankBars } from '../../ui/charts';
import { initialPeriod, PeriodPicker, periodRange, type PeriodState } from '../../ui/PeriodPicker';
import { Button, Card, Divider, IconButton, KeyValue, ListRow, Loading, Row, SectionTitle, Segmented, Txt } from '../../ui/primitives';
import { Screen } from '../../ui/Screen';

export default function Finance() {
  const { settings } = useApp();
  const [period, setPeriod] = useState<PeriodState>(initialPeriod('month'));
  const [chart, setChart] = useState<'profit' | 'cash'>('profit');
  const range = periodRange(period);
  const key = JSON.stringify(range);
  const { data } = useData(
    async (db) => ({
      m: await getPeriodMetrics(db, range),
      rec: await getReceivables(db),
      inv: await getInventorySnapshot(db),
      cats: await expensesByCategory(db, range),
      recent: (await listExpenses(db, range)).slice(0, 6),
      series: await getSeries(db, range),
    }),
    [key],
  );

  return (
    <Screen title="Finance" subtitle="Profit, expenses and cash" right={<IconButton icon="document-text-outline" label="Reports" onPress={() => router.push('/reports')} />} tabScreen>
      <Row gap={space.sm}>
        <Button title="Add expense" icon="add" onPress={() => router.push('/expense/new')} style={{ flex: 1 }} />
        <Button title="All expenses" icon="list-outline" variant="secondary" onPress={() => router.push('/expenses')} style={{ flex: 1 }} />
      </Row>
      <View style={{ marginTop: space.lg }}>
        <PeriodPicker value={period} onChange={setPeriod} />
      </View>
      {!data ? (
        <Loading />
      ) : (
        <>
          <SectionTitle title="Profit & loss" />
          <Card>
            <KeyValue label={t('m.revenue')} value={formatMoney(data.m.revenue)} />
            {data.m.deliveryRevenue ? <KeyValue label="  incl. delivery fees charged" value={formatMoney(data.m.deliveryRevenue)} /> : null}
            <KeyValue label={`− ${t('m.cogs')}`} value={formatMoney(data.m.cogs)} />
            <KeyValue label={t('m.grossProfit')} value={formatMoney(data.m.grossProfit)} tone={data.m.grossProfit < 0 ? 'negative' : 'positive'} strong />
            <KeyValue label={`− ${t('m.expenses')}`} value={formatMoney(data.m.operatingExpenses)} tone={data.m.operatingExpenses ? 'negative' : undefined} />
            {data.m.inventoryLosses ? <KeyValue label={`− ${t('m.losses')}`} value={formatMoney(data.m.inventoryLosses)} tone="negative" /> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: space.md }}>
              <Txt variant="bodyStrong">{t('m.netProfit')}</Txt>
              <Txt variant="title" numeric tone={data.m.netProfit < 0 ? 'negative' : 'positive'}>
                {formatMoney(data.m.netProfit, { sign: true })}
              </Txt>
            </View>
          </Card>

          <SectionTitle title="Cash & balances" />
          <Grid>
            <StatTile label="Cash collected (period)" value={formatMoney(data.m.cashCollected)} tone="positive" icon="cash-outline" />
            <StatTile label="Unpaid customer balances" value={formatMoney(data.rec.outstanding)} tone={data.rec.outstanding ? 'negative' : undefined} sub={`${data.rec.unpaidSalesCount} sale(s), today`} icon="time-outline" />
            <StatTile label="Paid by customers (all time)" value={formatMoney(data.rec.receivedAllTime)} icon="checkmark-done-outline" />
            <StatTile label="Inventory investment" value={formatMoney(data.inv.inventoryValue)} tone="gold" sub="stock at purchase cost" icon="diamond-outline" />
            <StatTile label="Stock purchased (period)" value={formatMoney(data.m.purchasesSpent)} sub="money paid to suppliers" icon="cart-outline" />
            <StatTile label="Expected value of stock" value={formatMoney(data.inv.expectedRevenueOfStock)} sub="at selling prices" icon="pricetags-outline" />
          </Grid>
          <Txt variant="caption" tone="faint" style={{ marginTop: space.sm, lineHeight: 16 }}>
            Profit counts a sale when it is made. Cash counts money when it is actually received. Buying stock is an investment (inventory), not an expense.
          </Txt>

          <SectionTitle title="Over time" />
          <Segmented
            options={[
              { value: 'profit', label: 'Net profit' },
              { value: 'cash', label: 'Cash received' },
            ]}
            value={chart}
            onChange={setChart}
          />
          <Card style={{ marginTop: space.md }}>
            {chart === 'profit' ? (
              <BarChart signed tone="positive" title="Net profit" data={data.series.points.map((p) => ({ label: p.label, value: p.netProfit }))} totalLabel={formatMoney(data.m.netProfit)} />
            ) : (
              <BarChart tone="gold" title="Cash received" data={data.series.points.map((p) => ({ label: p.label, value: p.cash }))} totalLabel={formatMoney(data.m.cashCollected)} />
            )}
          </Card>

          <SectionTitle title="Expenses by category" action="Categories" onAction={() => router.push('/categories')} />
          <Card>
            <RankBars rows={data.cats.map((c) => ({ key: c.key, label: c.label, value: c.total, sub: `${c.count}×` }))} emptyText="No expenses in this period" />
          </Card>

          <SectionTitle title="Recent expenses" action="See all" onAction={() => router.push('/expenses')} />
          <Card padded={false}>
            {data.recent.length ? (
              data.recent.map((e, i) => (
                <ListRow
                  key={e.id}
                  icon="receipt-outline"
                  iconTone="negative"
                  title={e.title}
                  subtitle={`${e.category_name} · ${formatDate(e.expense_date, settings.dateFormat)}`}
                  right={formatMoney(e.amount)}
                  onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })}
                  last={i === data.recent.length - 1}
                />
              ))
            ) : (
              <Txt variant="small" tone="faint" style={{ padding: space.lg }}>
                No expenses in this period.
              </Txt>
            )}
          </Card>
          <Divider />
          <Button title="Weekly / monthly / yearly reports" icon="bar-chart-outline" variant="secondary" onPress={() => router.push('/reports')} />
        </>
      )}
    </Screen>
  );
}
