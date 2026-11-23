import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { unreadCount } from '../../domain/alerts';
import {
  getInventorySnapshot,
  getPeriodMetrics,
  getReceivables,
  getSeries,
  inventoryByBrand,
  listActivity,
  salesByBrand,
  salesByModel,
} from '../../domain/finance';
import { formatMoney, groupThousands } from '../../domain/money';
import { t } from '../../i18n';
import { useApp, useData } from '../../state/app';
import { space, useTheme } from '../../theme';
import { ActivityItem, Grid, QuickAction, StatTile } from '../../ui/business';
import { AreaChart, BarChart, RankBars } from '../../ui/charts';
import { initialPeriod, PeriodPicker, periodRange, type PeriodState } from '../../ui/PeriodPicker';
import { Card, EmptyState, IconButton, Loading, Notice, SectionTitle, Txt } from '../../ui/primitives';
import { Screen } from '../../ui/Screen';

export default function Dashboard() {
  const { settings } = useApp();
  const { colors } = useTheme();
  const [period, setPeriod] = useState<PeriodState>(initialPeriod('month'));
  const range = periodRange(period);
  const key = JSON.stringify(range);

  const { data } = useData(
    async (db) => {
      const [m, all, inv, rec, series, brands, models, invBrands, activity, unread] = await Promise.all([
        getPeriodMetrics(db, range),
        getPeriodMetrics(db, { from: null, to: null }),
        getInventorySnapshot(db),
        getReceivables(db),
        getSeries(db, range),
        salesByBrand(db, range),
        salesByModel(db, range),
        inventoryByBrand(db),
        listActivity(db, { limit: 8 }),
        unreadCount(db),
      ]);
      return { m, all, inv, rec, series, brands, models, invBrands, activity, unread };
    },
    [key],
  );

  const header = (
    <>
      <IconButton icon="notifications-outline" label="Notifications" badge={data?.unread} onPress={() => router.push('/notifications')} />
      <IconButton icon="menu-outline" label="More" onPress={() => router.push('/more')} />
    </>
  );

  if (!data)
    return (
      <Screen title={settings.businessName} subtitle="Dashboard" right={header} tabScreen>
        <Loading />
      </Screen>
    );

  const { m, all, inv, rec, series, brands, models, invBrands, activity } = data;
  const isEmpty = all.salesCount === 0 && inv.totalModels === 0 && all.operatingExpenses === 0;
  const pts = series.points;

  return (
    <Screen title={settings.businessName} subtitle="Dashboard" right={header} tabScreen>
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.lg }}>
        <QuickAction icon="add" label={t('a.addPurchase')} onPress={() => router.push('/purchase/new')} />
        <QuickAction icon="bag-handle" label={t('a.sell')} onPress={() => router.push('/sell')} primary />
        <QuickAction icon="receipt-outline" label={t('a.addExpense')} onPress={() => router.push('/expense/new')} />
        <QuickAction icon="watch-outline" label={t('a.viewInventory')} onPress={() => router.push('/inventory')} />
      </View>

      {isEmpty ? (
        <Card>
          <EmptyState
            icon="sparkles-outline"
            title="Welcome"
            message="Start by recording your first purchase of watches. Your stock, profit and reports will build up automatically from real transactions."
            action="Record first purchase"
            onAction={() => router.push('/purchase/new')}
          />
        </Card>
      ) : null}

      {inv.outOfStockCount + inv.lowStockCount > 0 ? (
        <Notice
          tone="warning"
          icon="alert-circle-outline"
          message={`${inv.lowStockCount} model(s) low on stock · ${inv.outOfStockCount} out of stock. Tap Inventory › Low stock.`}
        />
      ) : null}
      {rec.outstanding > 0 ? (
        <Notice tone="negative" icon="time-outline" message={`${formatMoney(rec.outstanding)} still owed by customers on ${rec.unpaidSalesCount} sale(s).`} />
      ) : null}

      <View style={{ marginTop: space.md }}>
        <PeriodPicker value={period} onChange={setPeriod} />
      </View>

      {/* Hero: net profit of the period */}
      <Card style={{ marginTop: space.md, backgroundColor: colors.surface, borderColor: colors.borderStrong }}>
        <Txt variant="overline" tone="muted">
          {t('m.netProfit')} · selected period
        </Txt>
        <Txt variant="display" numeric tone={m.netProfit < 0 ? 'negative' : 'positive'} style={{ marginTop: 6 }} adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(m.netProfit, { sign: true })}
        </Txt>
        <Txt variant="small" tone="muted" style={{ marginTop: 6 }}>
          {formatMoney(m.revenue)} revenue − {formatMoney(m.cogs)} cost of watches − {formatMoney(m.operatingExpenses)} expenses
          {m.inventoryLosses ? ` − ${formatMoney(m.inventoryLosses)} stock losses` : ''}
        </Txt>
      </Card>

      <SectionTitle title="Selected period" />
      <Grid>
        <StatTile label={t('m.revenue')} value={formatMoney(m.revenue)} sub={`${m.salesCount} sale(s)`} icon="trending-up-outline" />
        <StatTile label={t('m.cogs')} value={formatMoney(m.cogs)} icon="cube-outline" />
        <StatTile label={t('m.grossProfit')} value={formatMoney(m.grossProfit)} tone={m.grossProfit < 0 ? 'negative' : 'positive'} icon="stats-chart-outline" />
        <StatTile label={t('m.expenses')} value={formatMoney(m.operatingExpenses)} tone={m.operatingExpenses ? 'negative' : undefined} icon="receipt-outline" />
        <StatTile label={t('m.sold')} value={groupThousands(m.unitsSold)} icon="watch-outline" />
        <StatTile label={t('m.avgProfit')} value={formatMoney(m.avgProfitPerWatch)} icon="pricetag-outline" />
        <StatTile label={t('m.cash')} value={formatMoney(m.cashCollected)} sub="money actually received" icon="cash-outline" />
        <StatTile label="Stock purchased" value={formatMoney(m.purchasesSpent)} sub={`${m.unitsPurchased} watch(es)`} icon="cart-outline" />
      </Grid>

      <SectionTitle title="Current inventory" action="Open" onAction={() => router.push('/inventory')} />
      <Grid>
        <StatTile label={t('m.inStock')} value={groupThousands(inv.unitsInStock)} icon="layers-outline" />
        <StatTile label={t('m.inventoryValue')} value={formatMoney(inv.inventoryValue)} sub="at purchase cost" tone="gold" icon="diamond-outline" />
        <StatTile label={t('m.activeModels')} value={String(inv.activeModels)} sub={`${inv.totalModels} models in catalog`} icon="albums-outline" />
        <StatTile
          label="Stock alerts"
          value={`${inv.lowStockCount + inv.outOfStockCount}`}
          sub={`${inv.lowStockCount} low · ${inv.outOfStockCount} out`}
          tone={inv.lowStockCount + inv.outOfStockCount ? 'negative' : undefined}
          icon="warning-outline"
        />
      </Grid>

      <SectionTitle title="All-time totals" />
      <Grid>
        <StatTile label="Total revenue" value={formatMoney(all.revenue)} icon="trending-up-outline" />
        <StatTile label="Total net profit" value={formatMoney(all.netProfit)} tone={all.netProfit < 0 ? 'negative' : 'positive'} icon="ribbon-outline" />
        <StatTile label="Total watches sold" value={groupThousands(all.unitsSold)} icon="watch-outline" />
        <StatTile label={t('m.outstanding')} value={formatMoney(rec.outstanding)} tone={rec.outstanding ? 'negative' : undefined} icon="time-outline" />
      </Grid>

      <SectionTitle title="Trends" />
      <Card>
        <AreaChart title={t('m.revenue')} data={pts.map((p) => ({ label: p.label, value: p.revenue }))} totalLabel={formatMoney(m.revenue)} />
      </Card>
      <Card style={{ marginTop: space.md }}>
        <BarChart signed tone="positive" title={t('m.netProfit')} data={pts.map((p) => ({ label: p.label, value: p.netProfit }))} totalLabel={formatMoney(m.netProfit)} />
      </Card>
      <Card style={{ marginTop: space.md }}>
        <BarChart tone="negative" title={t('m.expenses')} data={pts.map((p) => ({ label: p.label, value: p.expenses }))} totalLabel={formatMoney(m.operatingExpenses)} />
      </Card>
      <Card style={{ marginTop: space.md }}>
        <BarChart
          tone="neutral"
          title={t('m.sold')}
          data={pts.map((p) => ({ label: p.label, value: p.units }))}
          totalLabel={`${m.unitsSold} watch(es)`}
          format={(v) => `${v} watch(es)`}
        />
      </Card>

      <SectionTitle title="Profit by brand" />
      <Card>
        <RankBars rows={brands.map((b) => ({ key: b.key, label: b.label, value: b.profit, sub: `${b.units} sold` }))} />
      </Card>
      <SectionTitle title="Best-selling models" />
      <Card>
        <RankBars rows={models.map((b) => ({ key: b.key, label: b.label, value: b.units, sub: formatMoney(b.revenue) }))} format={(v) => `${v} sold`} />
      </Card>
      <SectionTitle title="Inventory by brand" />
      <Card>
        <RankBars
          rows={invBrands.map((b) => ({ key: b.key, label: b.label, value: b.value, sub: `${b.units} pcs` }))}
          emptyText="No watches in stock"
        />
      </Card>

      <SectionTitle title="Recent activity" action="See all" onAction={() => router.push('/history')} />
      <Card padded={false}>
        {activity.length ? (
          activity.map((a, i) => <ActivityItem key={a.id} a={a} last={i === activity.length - 1} />)
        ) : (
          <Txt variant="small" tone="faint" style={{ padding: space.lg }}>
            No activity yet.
          </Txt>
        )}
      </Card>
    </Screen>
  );
}
