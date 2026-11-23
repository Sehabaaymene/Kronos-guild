import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Alert } from '../../ui/dialog';
import { deleteProduct, getProduct } from '../../domain/catalog';
import { formatDate } from '../../domain/dates';
import { formatMoney } from '../../domain/money';
import { listBatches, unitLandedCost } from '../../domain/purchases';
import { useApp, useData } from '../../state/app';
import { space } from '../../theme';
import { Grid, StatTile, StockBadge } from '../../ui/business';
import { Button, Card, EmptyState, IconButton, KeyValue, ListRow, Loading, Notice, ProductThumb, Row, SectionTitle, Txt } from '../../ui/primitives';
import { Screen } from '../../ui/Screen';

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { mutate, settings } = useApp();
  const { data, loading } = useData(
    async (db) => {
      const product = await getProduct(db, id);
      if (!product) return null;
      const batches = await listBatches(db, { productId: id });
      const sales = await db.all<{ sale_id: string; reference: string; sale_date: string; status: string; quantity: number; unit_selling_price: number; gross_profit: number; batch_ref: string }>(
        `SELECT s.id AS sale_id, s.reference, s.sale_date, s.status, si.quantity, si.unit_selling_price, si.gross_profit, b.reference AS batch_ref
         FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN purchase_batches b ON b.id = si.purchase_batch_id
         WHERE si.product_id = ? ORDER BY s.sale_date DESC, s.created_at DESC`,
        [id],
      );
      const profit = sales.filter((s) => s.status === 'completed').reduce((a, s) => a + s.gross_profit, 0);
      const revenue = sales.filter((s) => s.status === 'completed').reduce((a, s) => a + s.quantity * s.unit_selling_price, 0);
      return { product, batches, sales, profit, revenue };
    },
    [id],
  );

  if (loading && !data) return <Screen title="Watch" back><Loading /></Screen>;
  if (!data) return <Screen title="Watch" back><EmptyState title="Not found" message="This model no longer exists." /></Screen>;
  const { product: p, batches, sales, profit, revenue } = data;

  const onDelete = () =>
    Alert.alert('Delete this model?', `${p.brand_name} ${p.model} has no purchases. It will be removed from the catalog.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if ((await mutate((db) => deleteProduct(db, p.id), { success: 'Model deleted' })) !== undefined) router.back();
        },
      },
    ]);

  return (
    <Screen
      title={p.model}
      subtitle={p.brand_name}
      back
      right={<IconButton icon="create-outline" label="Edit model" onPress={() => router.push({ pathname: '/product/edit/[id]', params: { id: p.id } })} />}
      footer={
        <Row gap={space.sm}>
          <Button title="Buy more" icon="add" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/purchase/new', params: { brand: p.brand_name, model: p.model } })} />
          <Button title="Sell" icon="bag-handle" style={{ flex: 1 }} disabled={p.stock <= 0} onPress={() => router.push({ pathname: '/sell', params: { productId: p.id } })} />
        </Row>
      }
    >
      <Row gap={space.lg} style={{ alignItems: 'flex-start' }}>
        <ProductThumb path={p.image_path} size={112} rounded={20} />
        <View style={{ flex: 1, gap: 6 }}>
          <StockBadge stock={p.stock} threshold={p.low_stock_threshold} />
          <Txt variant="display" numeric>
            {p.stock}
          </Txt>
          <Txt variant="small" tone="muted">
            in stock · alert at ≤ {p.low_stock_threshold}
          </Txt>
          {p.sku ? (
            <Txt variant="caption" tone="faint">
              SKU {p.sku}
            </Txt>
          ) : null}
        </View>
      </Row>

      {p.stock <= 0 && p.batch_count > 0 ? <Notice tone="negative" icon="alert-circle-outline" message="Out of stock — record a new purchase to sell this model again." /> : null}
      {p.stock > 0 && p.stock <= p.low_stock_threshold ? <Notice tone="warning" icon="warning-outline" message={`Low stock: only ${p.stock} left.`} /> : null}

      <SectionTitle title="Overview" />
      <Grid>
        <StatTile label="Purchased (total)" value={String(p.quantity_purchased)} />
        <StatTile label="Sold (total)" value={String(p.quantity_sold)} />
        <StatTile label="Inventory value" value={formatMoney(p.inventory_value)} sub="at purchase cost" tone="gold" />
        <StatTile label="Expected selling price" value={formatMoney(p.default_selling_price)} />
        <StatTile label="Revenue generated" value={formatMoney(revenue)} />
        <StatTile label="Gross profit generated" value={formatMoney(profit)} tone={profit < 0 ? 'negative' : 'positive'} />
      </Grid>

      <SectionTitle title={`Purchase batches (${batches.length})`} />
      <Card padded={false}>
        {batches.length ? (
          batches.map((b, i) => (
            <ListRow
              key={b.id}
              icon="cube-outline"
              iconTone="gold"
              title={`${b.reference} · ${formatDate(b.purchase_date, settings.dateFormat)}`}
              subtitle={`${b.quantity_remaining} of ${b.quantity_purchased} left · ${b.supplier_name ?? 'No supplier'}`}
              right={formatMoney(unitLandedCost(b))}
              rightSub="unit cost"
              onPress={() => router.push({ pathname: '/purchase/[id]', params: { id: b.id } })}
              last={i === batches.length - 1}
            />
          ))
        ) : (
          <Txt variant="small" tone="faint" style={{ padding: space.lg }}>
            No purchases recorded.
          </Txt>
        )}
      </Card>

      <SectionTitle title={`Sales history (${sales.length})`} />
      <Card padded={false}>
        {sales.length ? (
          sales.slice(0, 30).map((s, i) => (
            <ListRow
              key={`${s.sale_id}-${s.batch_ref}-${i}`}
              icon={s.status === 'cancelled' ? 'close-circle-outline' : 'bag-check-outline'}
              iconTone={s.status === 'cancelled' ? 'negative' : 'positive'}
              title={`${s.reference} · ${s.quantity} × ${formatMoney(s.unit_selling_price)}`}
              subtitle={`${formatDate(s.sale_date, settings.dateFormat)} · from ${s.batch_ref}${s.status === 'cancelled' ? ' · cancelled' : ''}`}
              right={s.status === 'cancelled' ? '—' : formatMoney(s.gross_profit, { sign: true })}
              rightTone={s.status === 'cancelled' ? 'faint' : s.gross_profit < 0 ? 'negative' : 'positive'}
              rightSub="profit"
              onPress={() => router.push({ pathname: '/sale/[id]', params: { id: s.sale_id } })}
              last={i === Math.min(sales.length, 30) - 1}
            />
          ))
        ) : (
          <Txt variant="small" tone="faint" style={{ padding: space.lg }}>
            Not sold yet.
          </Txt>
        )}
      </Card>

      {(p.description || p.notes) && (
        <>
          <SectionTitle title="Notes" />
          <Card>
            {p.description ? <KeyValue label="Description" value={p.description} /> : null}
            {p.notes ? <KeyValue label="Notes" value={p.notes} /> : null}
          </Card>
        </>
      )}
      <Txt variant="caption" tone="faint" style={{ marginTop: space.lg }}>
        Added {formatDate(p.created_at, settings.dateFormat)}
      </Txt>
      {p.batch_count === 0 ? <Button title="Delete model" variant="danger" icon="trash-outline" onPress={onDelete} style={{ marginTop: space.lg }} /> : null}
    </Screen>
  );
}
