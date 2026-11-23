import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Alert } from '../../ui/dialog';
import { listAdjustments } from '../../domain/adjustments';
import { formatDate, formatDateTime } from '../../domain/dates';
import { formatMoney, share } from '../../domain/money';
import { deletePurchase, getBatch, unitLandedCost } from '../../domain/purchases';
import { resolveFile } from '../../services/files';
import { useApp, useData } from '../../state/app';
import { radius, space } from '../../theme';
import { Button, Card, EmptyState, IconButton, KeyValue, ListRow, Loading, ProductThumb, Row, SectionTitle, Txt } from '../../ui/primitives';
import { Screen } from '../../ui/Screen';

export default function PurchaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { mutate, settings } = useApp();
  const { data, loading } = useData(
    async (db) => {
      const b = await getBatch(db, id);
      if (!b) return null;
      const sales = await db.all<{ sale_id: string; reference: string; sale_date: string; status: string; quantity: number; unit_selling_price: number; gross_profit: number }>(
        `SELECT s.id AS sale_id, s.reference, s.sale_date, s.status, si.quantity, si.unit_selling_price, si.gross_profit
         FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.purchase_batch_id = ? ORDER BY s.sale_date DESC`,
        [id],
      );
      const adjustments = await listAdjustments(db, id);
      const history = await db.all<{ id: string; summary: string; created_at: string }>(
        `SELECT id, summary, created_at FROM audit_logs WHERE entity_type = 'purchase' AND entity_id = ? ORDER BY created_at DESC`,
        [id],
      );
      return { b, sales, adjustments, history };
    },
    [id],
  );

  if (loading && !data) return <Screen title="Purchase" back><Loading /></Screen>;
  if (!data) return <Screen title="Purchase" back><EmptyState title="Not found" message="This purchase no longer exists (it may have been deleted)." /></Screen>;
  const { b, sales, adjustments, history } = data;
  const receipt = resolveFile(b.receipt_path);
  const canDelete = b.quantity_remaining === b.quantity_purchased && sales.length === 0 && adjustments.length === 0;

  const onDelete = () =>
    Alert.alert(
      `Delete purchase ${b.reference}?`,
      `${b.quantity_purchased} × ${b.brand_name} ${b.model} (${formatMoney(b.total_cost)}) will be removed from inventory. A copy is kept in the business history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete purchase',
          style: 'destructive',
          onPress: async () => {
            if ((await mutate((db) => deletePurchase(db, b.id), { success: 'Purchase deleted' })) !== undefined) router.back();
          },
        },
      ],
    );

  return (
    <Screen
      title={b.reference}
      subtitle={`${b.brand_name} ${b.model}`}
      back
      right={<IconButton icon="create-outline" label="Edit purchase" onPress={() => router.push({ pathname: '/purchase/edit/[id]', params: { id: b.id } })} />}
      footer={
        <Row gap={space.sm}>
          <Button title="Adjust stock" icon="swap-vertical" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/adjust/[batchId]', params: { batchId: b.id } })} />
          <Button
            title="Sell from batch"
            icon="bag-handle"
            style={{ flex: 1 }}
            disabled={b.quantity_remaining <= 0}
            onPress={() => router.push({ pathname: '/sell', params: { productId: b.product_id, batchId: b.id } })}
          />
        </Row>
      }
    >
      <Card onPress={() => router.push({ pathname: '/product/[id]', params: { id: b.product_id } })}>
        <Row>
          <ProductThumb path={b.image_path} size={56} />
          <View style={{ flex: 1 }}>
            <Txt variant="caption" tone="gold" style={{ fontWeight: '700' }}>
              {b.brand_name.toUpperCase()}
            </Txt>
            <Txt variant="bodyStrong">{b.model}</Txt>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt variant="title" numeric>
              {b.quantity_remaining}
            </Txt>
            <Txt variant="caption" tone="faint">
              of {b.quantity_purchased} left
            </Txt>
          </View>
        </Row>
      </Card>

      <SectionTitle title="Purchase" />
      <Card>
        <KeyValue label="Purchase date" value={formatDate(b.purchase_date, settings.dateFormat)} />
        <KeyValue label="Quantity purchased" value={String(b.quantity_purchased)} />
        <KeyValue label="Unit purchase price" value={formatMoney(b.unit_cost)} />
        <KeyValue label="Total purchase cost" value={formatMoney(b.total_cost)} strong />
        {b.additional_cost ? (
          <>
            <KeyValue label="Additional costs" value={formatMoney(b.additional_cost)} />
            <KeyValue
              label="Treated as"
              value={b.additional_cost_mode === 'inventory' ? `Watch cost (+${formatMoney(share(b.additional_cost, 1, b.quantity_purchased))} each)` : 'Operating expense'}
            />
            <KeyValue label="Real cost per watch" value={formatMoney(unitLandedCost(b))} />
          </>
        ) : null}
        <KeyValue label="Expected selling price" value={formatMoney(b.expected_selling_price)} />
        <KeyValue label="Supplier" value={b.supplier_name ?? '—'} />
        <KeyValue label="Sold" value={String(b.quantity_sold)} />
        <KeyValue label="Remaining" value={String(b.quantity_remaining)} />
        <KeyValue label="Remaining value at cost" value={formatMoney(b.inventory_value)} tone="gold" />
        {b.notes ? <KeyValue label="Notes" value={b.notes} /> : null}
      </Card>

      {receipt ? (
        <>
          <SectionTitle title="Receipt" />
          <Image source={{ uri: receipt }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.lg }} contentFit="contain" />
        </>
      ) : null}

      <SectionTitle title={`Sales from this batch (${sales.length})`} />
      <Card padded={false}>
        {sales.length ? (
          sales.map((s, i) => (
            <ListRow
              key={`${s.sale_id}-${i}`}
              icon={s.status === 'cancelled' ? 'close-circle-outline' : 'bag-check-outline'}
              iconTone={s.status === 'cancelled' ? 'negative' : 'positive'}
              title={`${s.reference} · ${s.quantity} × ${formatMoney(s.unit_selling_price)}`}
              subtitle={`${formatDate(s.sale_date, settings.dateFormat)}${s.status === 'cancelled' ? ' · cancelled' : ''}`}
              right={s.status === 'cancelled' ? '—' : formatMoney(s.gross_profit, { sign: true })}
              rightTone={s.status === 'cancelled' ? 'faint' : 'positive'}
              onPress={() => router.push({ pathname: '/sale/[id]', params: { id: s.sale_id } })}
              last={i === sales.length - 1}
            />
          ))
        ) : (
          <Txt variant="small" tone="faint" style={{ padding: space.lg }}>
            No sales from this batch yet.
          </Txt>
        )}
      </Card>

      {adjustments.length ? (
        <>
          <SectionTitle title="Stock corrections" />
          <Card padded={false}>
            {adjustments.map((a, i) => (
              <ListRow
                key={a.id}
                icon="swap-vertical"
                iconTone="warning"
                title={`${a.quantity_change > 0 ? '+' : ''}${a.quantity_change} · ${a.reason.replace(/_/g, ' ')}`}
                subtitle={`${a.reference} · ${formatDate(a.adjustment_date, settings.dateFormat)}${a.note ? ' · ' + a.note : ''}`}
                right={formatMoney(a.value_change, { sign: true })}
                last={i === adjustments.length - 1}
              />
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle title="Change history" />
      <Card padded={false}>
        {history.map((h, i) => (
          <ListRow
            key={h.id}
            icon="time-outline"
            title={h.summary}
            subtitle={formatDateTime(h.created_at, settings.dateFormat)}
            onPress={() => router.push({ pathname: '/activity/[id]', params: { id: h.id } })}
            last={i === history.length - 1}
          />
        ))}
      </Card>

      {canDelete ? <Button title="Delete purchase" variant="danger" icon="trash-outline" onPress={onDelete} style={{ marginTop: space.xl }} /> : null}
    </Screen>
  );
}
