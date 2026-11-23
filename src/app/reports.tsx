import React, { useState } from 'react';
import { View } from 'react-native';
import { Alert } from '../ui/dialog';
import {
  expensesByCategory,
  getInventorySnapshot,
  getPeriodMetrics,
  getSeries,
  inventoryByBrand,
  inventoryTurnover,
  salesByBrand,
  salesByModel,
  slowMovers,
} from '../domain/finance';
import { formatMoney } from '../domain/money';
import { listProducts } from '../domain/catalog';
import { exportCSV, exportPDF, type CsvKind } from '../services/exportService';
import { errorMessage, useApp, useData } from '../state/app';
import { space } from '../theme';
import { Grid, StatTile } from '../ui/business';
import { BarChart, RankBars } from '../ui/charts';
import { initialPeriod, PeriodPicker, periodLabel, periodRange, type PeriodState } from '../ui/PeriodPicker';
import { Button, Card, KeyValue, ListRow, Loading, ProductThumb, Row, SectionTitle, Segmented, Txt } from '../ui/primitives';
import { Screen } from '../ui/Screen';
import type { Bucket } from '../domain/dates';

type Tab = 'sales' | 'profit' | 'inventory' | 'expenses';

export default function Reports() {
  const { db, settings } = useApp();
  const [tab, setTab] = useState<Tab>('sales');
  const [period, setPeriod] = useState<PeriodState>(initialPeriod('year'));
  const [bucket, setBucket] = useState<Bucket>('month');
  const [busy, setBusy] = useState<string | null>(null);
  const range = periodRange(period);
  const key = JSON.stringify(range) + bucket;

  const { data } = useData(
    async (db) => {
      const [m, series, brands, models, cats, inv, invBrands, slow, products, turnover, adsRow, recentSales] = await Promise.all([
        getPeriodMetrics(db, range),
        getSeries(db, range, bucket),
        salesByBrand(db, range),
        salesByModel(db, range),
        expensesByCategory(db, range),
        getInventorySnapshot(db),
        inventoryByBrand(db),
        slowMovers(db, 30),
        listProducts(db),
        inventoryTurnover(db, range),
        db.get<{ total: number }>(
          `SELECT COALESCE(SUM(e.amount),0) AS total FROM expenses e JOIN expense_categories c ON c.id = e.category_id
           WHERE (c.name LIKE '%advert%' OR c.name LIKE '%ads%') AND (? IS NULL OR e.expense_date >= ?) AND (? IS NULL OR e.expense_date <= ?)`,
          [range.from, range.from, range.to, range.to],
        ),
        db.all<{ id: string; reference: string; sale_date: string; gross_profit: number; total_revenue: number }>(
          `SELECT id, reference, sale_date, gross_profit, total_revenue FROM sales WHERE status = 'completed'
           AND (? IS NULL OR sale_date >= ?) AND (? IS NULL OR sale_date <= ?) ORDER BY gross_profit DESC LIMIT 50`,
          [range.from, range.from, range.to, range.to],
        ),
      ]);
      return { m, series, brands, models, cats, inv, invBrands, slow, products, turnover, ads: adsRow?.total ?? 0, recentSales };
    },
    [key],
  );

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Export', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const csv = (kind: CsvKind) => run(kind, () => exportCSV(db, kind, kind === 'inventory' ? { from: null, to: null } : range));

  const pts = data?.series.points ?? [];

  return (
    <Screen title="Reports" subtitle={periodLabel(period)} back>
      <PeriodPicker value={period} onChange={setPeriod} />
      <View style={{ marginTop: space.md }}>
        <Segmented
          options={[
            { value: 'day', label: 'Daily' },
            { value: 'week', label: 'Weekly' },
            { value: 'month', label: 'Monthly' },
            { value: 'year', label: 'Yearly' },
          ]}
          value={bucket}
          onChange={setBucket}
        />
      </View>
      <View style={{ marginTop: space.md }}>
        <Segmented
          options={[
            { value: 'sales', label: 'Sales' },
            { value: 'profit', label: 'Profit' },
            { value: 'inventory', label: 'Stock' },
            { value: 'expenses', label: 'Expenses' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {!data ? (
        <Loading />
      ) : tab === 'sales' ? (
        <>
          <SectionTitle title="Sales summary" />
          <Grid>
            <StatTile label="Revenue" value={formatMoney(data.m.revenue)} />
            <StatTile label="Watches sold" value={String(data.m.unitsSold)} sub={`${data.m.salesCount} sale(s)`} />
            <StatTile label="Average selling price" value={formatMoney(data.m.avgSellingPrice)} />
            <StatTile label="Delivery fees charged" value={formatMoney(data.m.deliveryRevenue)} />
          </Grid>
          <Card style={{ marginTop: space.md }}>
            <BarChart title={`Revenue by ${bucket}`} data={pts.map((p) => ({ label: p.label, value: p.revenue }))} totalLabel={formatMoney(data.m.revenue)} />
          </Card>
          <Card style={{ marginTop: space.md }}>
            <BarChart tone="neutral" title={`Watches sold by ${bucket}`} data={pts.map((p) => ({ label: p.label, value: p.units }))} totalLabel={`${data.m.unitsSold}`} format={(v) => `${v} watch(es)`} />
          </Card>
          <SectionTitle title="Sales by brand" />
          <Card>
            <RankBars rows={data.brands.map((b) => ({ key: b.key, label: b.label, value: b.revenue, sub: `${b.units} sold` }))} max={20} />
          </Card>
          <SectionTitle title="Best-selling models" />
          <Card>
            <RankBars rows={data.models.map((b) => ({ key: b.key, label: b.label, value: b.units, sub: formatMoney(b.revenue) }))} format={(v) => `${v} sold`} max={20} />
          </Card>
          <Button title="Export sales (CSV)" icon="download-outline" variant="secondary" loading={busy === 'sales'} onPress={() => csv('sales')} style={{ marginTop: space.lg }} />
        </>
      ) : tab === 'profit' ? (
        <>
          <SectionTitle title="Profit" />
          <Card>
            <KeyValue label="Revenue" value={formatMoney(data.m.revenue)} />
            <KeyValue label="Cost of goods sold" value={formatMoney(data.m.cogs)} />
            <KeyValue label="Gross profit" value={formatMoney(data.m.grossProfit)} tone={data.m.grossProfit < 0 ? 'negative' : 'positive'} strong />
            <KeyValue label="Operating expenses" value={formatMoney(data.m.operatingExpenses)} />
            {data.m.inventoryLosses ? <KeyValue label="Inventory losses" value={formatMoney(data.m.inventoryLosses)} /> : null}
            <KeyValue label="Net profit" value={formatMoney(data.m.netProfit)} tone={data.m.netProfit < 0 ? 'negative' : 'positive'} strong />
            <KeyValue label="Gross margin" value={data.m.revenue ? `${Math.round((data.m.grossProfit / data.m.revenue) * 1000) / 10}%` : '—'} />
          </Card>
          <Card style={{ marginTop: space.md }}>
            <BarChart signed tone="positive" title={`Net profit by ${bucket}`} data={pts.map((p) => ({ label: p.label, value: p.netProfit }))} totalLabel={formatMoney(data.m.netProfit)} />
          </Card>
          <Card style={{ marginTop: space.md }}>
            <BarChart signed tone="gold" title={`Gross profit by ${bucket}`} data={pts.map((p) => ({ label: p.label, value: p.grossProfit }))} totalLabel={formatMoney(data.m.grossProfit)} />
          </Card>
          <SectionTitle title="Profit by brand" />
          <Card>
            <RankBars rows={data.brands.map((b) => ({ key: b.key, label: b.label, value: b.profit }))} max={20} />
          </Card>
          <SectionTitle title="Profit by model" />
          <Card>
            <RankBars rows={[...data.models].sort((a, b) => b.profit - a.profit).map((b) => ({ key: b.key, label: b.label, value: b.profit, sub: `${b.units} sold` }))} max={20} />
          </Card>
          <SectionTitle title="Profit by individual sale" />
          <Card padded={false}>
            {data.recentSales.length ? (
              data.recentSales.slice(0, 20).map((s, i) => (
                <ListRow
                  key={s.id}
                  icon="bag-check-outline"
                  iconTone={s.gross_profit < 0 ? 'negative' : 'positive'}
                  title={s.reference}
                  subtitle={`${s.sale_date} · revenue ${formatMoney(s.total_revenue)}`}
                  right={formatMoney(s.gross_profit, { sign: true })}
                  rightTone={s.gross_profit < 0 ? 'negative' : 'positive'}
                  last={i === Math.min(20, data.recentSales.length) - 1}
                />
              ))
            ) : (
              <Txt variant="small" tone="faint" style={{ padding: space.lg }}>
                No sales in this period.
              </Txt>
            )}
          </Card>
        </>
      ) : tab === 'inventory' ? (
        <>
          <SectionTitle title="Current stock (today)" />
          <Grid>
            <StatTile label="Watches in stock" value={String(data.inv.unitsInStock)} />
            <StatTile label="Total inventory cost" value={formatMoney(data.inv.inventoryValue)} tone="gold" />
            <StatTile label="Low stock models" value={String(data.inv.lowStockCount)} tone={data.inv.lowStockCount ? 'negative' : undefined} />
            <StatTile label="Inventory turnover" value={data.turnover != null ? `${data.turnover}×` : '—'} sub={data.turnover != null ? 'for the period' : 'not enough data yet'} />
          </Grid>
          <SectionTitle title="Stock value by brand" />
          <Card>
            <RankBars rows={data.invBrands.map((b) => ({ key: b.key, label: b.label, value: b.value, sub: `${b.units} pcs` }))} max={20} emptyText="No stock" />
          </Card>
          <SectionTitle title="Low & out of stock" />
          <Card padded={false}>
            {data.products.filter((p) => p.stock <= p.low_stock_threshold && p.batch_count > 0).length ? (
              data.products
                .filter((p) => p.stock <= p.low_stock_threshold && p.batch_count > 0)
                .map((p, i, arr) => (
                  <ListRow
                    key={p.id}
                    left={<ProductThumb path={p.image_path} size={40} />}
                    title={`${p.brand_name} ${p.model}`}
                    subtitle={`alert at ≤ ${p.low_stock_threshold}`}
                    right={String(p.stock)}
                    rightTone={p.stock <= 0 ? 'negative' : 'warning'}
                    last={i === arr.length - 1}
                  />
                ))
            ) : (
              <Txt variant="small" tone="faint" style={{ padding: space.lg }}>
                All models are above their alert threshold.
              </Txt>
            )}
          </Card>
          <SectionTitle title="No sales in the last 30 days" />
          <Card padded={false}>
            {data.slow.length ? (
              data.slow.map((p, i) => (
                <ListRow
                  key={p.id}
                  left={<ProductThumb path={p.image_path} size={40} />}
                  title={p.label}
                  subtitle={p.last_sale_date ? `last sold ${p.last_sale_date}` : 'never sold'}
                  right={`${p.stock} pcs`}
                  last={i === data.slow.length - 1}
                />
              ))
            ) : (
              <Txt variant="small" tone="faint" style={{ padding: space.lg }}>
                Every model in stock sold recently.
              </Txt>
            )}
          </Card>
          <Row gap={space.sm} style={{ marginTop: space.lg }}>
            <Button title="Inventory CSV" icon="download-outline" variant="secondary" loading={busy === 'inventory'} onPress={() => csv('inventory')} style={{ flex: 1 }} />
            <Button title="Purchases CSV" icon="download-outline" variant="secondary" loading={busy === 'purchases'} onPress={() => csv('purchases')} style={{ flex: 1 }} />
          </Row>
        </>
      ) : (
        <>
          <SectionTitle title="Expenses" />
          <Grid>
            <StatTile label="Total expenses" value={formatMoney(data.m.operatingExpenses)} tone={data.m.operatingExpenses ? 'negative' : undefined} />
            <StatTile label="Advertising costs" value={formatMoney(data.ads)} sub="categories containing ads/advertising" />
          </Grid>
          <Card style={{ marginTop: space.md }}>
            <BarChart tone="negative" title={`Expenses by ${bucket}`} data={pts.map((p) => ({ label: p.label, value: p.expenses }))} totalLabel={formatMoney(data.m.operatingExpenses)} />
          </Card>
          <SectionTitle title="By category" />
          <Card>
            <RankBars rows={data.cats.map((c) => ({ key: c.key, label: c.label, value: c.total, sub: `${c.count}×` }))} max={20} emptyText="No expenses in this period" />
          </Card>
          <Button title="Export expenses (CSV)" icon="download-outline" variant="secondary" loading={busy === 'expenses'} onPress={() => csv('expenses')} style={{ marginTop: space.lg }} />
        </>
      )}

      <SectionTitle title="Full report" />
      <Button
        title="Export PDF financial report"
        icon="document-text-outline"
        loading={busy === 'pdf'}
        onPress={() => run('pdf', () => exportPDF(db, range, periodLabel(period), settings.businessName))}
      />
      <Txt variant="caption" tone="faint" style={{ marginTop: space.sm }}>
        Exports open the iPhone share sheet: save to Files, send by email or AirDrop. CSV files open in Excel, Numbers and Google Sheets.
      </Txt>
    </Screen>
  );
}
