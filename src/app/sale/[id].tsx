import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { Alert } from '../../ui/dialog';
import type { PaymentMethod } from '../../domain/core';
import { formatDate, formatDateTime, today } from '../../domain/dates';
import { formatMoney, moneyToInput, parseMoney } from '../../domain/money';
import { addPayment, cancelSale, getSale } from '../../domain/sales';
import { useApp, useData } from '../../state/app';
import { space } from '../../theme';
import { PAYMENT_METHOD_LABEL, PaymentBadge, StatusBadge } from '../../ui/business';
import { DateField, Field, MoneyField } from '../../ui/forms';
import { Button, Card, Chips, EmptyState, IconButton, KeyValue, ListRow, Loading, Notice, ProductThumb, Row, SectionTitle, Txt } from '../../ui/primitives';
import { Screen } from '../../ui/Screen';

export default function SaleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { mutate, settings } = useApp();
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(today());
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const { data, loading } = useData(
    async (db) => {
      const s = await getSale(db, id);
      if (!s) return null;
      const history = await db.all<{ id: string; summary: string; created_at: string }>(
        `SELECT id, summary, created_at FROM audit_logs WHERE entity_type = 'sale' AND entity_id = ? ORDER BY created_at DESC`,
        [id],
      );
      return { ...s, history };
    },
    [id],
  );

  if (loading && !data) return <Screen title="Sale" back><Loading /></Screen>;
  if (!data) return <Screen title="Sale" back><EmptyState title="Not found" /></Screen>;
  const { sale: s, items, payments, history } = data;
  const balance = s.total_revenue - s.amount_paid;
  const cancelled = s.status === 'cancelled';
  const amount = parseMoney(payAmount);

  const doCancel = () =>
    Alert.alert(
      `Cancel sale ${s.reference}?`,
      `${items.reduce((a, i) => a + i.quantity, 0)} watch(es) will go back to their original batches. ${
        s.amount_paid > 0 ? `${formatMoney(s.amount_paid)} received will be recorded as refunded. ` : ''
      }The sale stays in history as cancelled.`,
      [
        { text: 'Keep sale', style: 'cancel' },
        {
          text: 'Cancel sale',
          style: 'destructive',
          onPress: async () => {
            await mutate((db) => cancelSale(db, s.id, cancelReason), { success: 'Sale cancelled · stock restored' });
            setCancelOpen(false);
          },
        },
      ],
    );

  const doPay = async () => {
    if (amount == null) return;
    const ok = await mutate((db) => addPayment(db, { saleId: s.id, amount, paymentDate: payDate, method: payMethod }), { success: 'Payment recorded' });
    if (ok !== undefined) {
      setPayOpen(false);
      setPayAmount('');
    }
  };

  return (
    <Screen
      title={s.reference}
      subtitle={formatDate(s.sale_date, settings.dateFormat)}
      back
      right={
        !cancelled ? <IconButton icon="create-outline" label="Edit sale" onPress={() => router.push({ pathname: '/sell', params: { saleId: s.id } })} /> : undefined
      }
      footer={
        !cancelled && balance > 0 && !payOpen ? <Button title={`Record payment · ${formatMoney(balance)} due`} icon="cash-outline" onPress={() => { setPayAmount(moneyToInput(balance)); setPayOpen(true); }} /> : undefined
      }
    >
      <Row gap={space.sm}>
        <StatusBadge status={s.status} />
        {!cancelled ? <PaymentBadge status={s.payment_status} /> : null}
      </Row>
      {cancelled ? (
        <Notice
          tone="negative"
          icon="close-circle-outline"
          message={`Cancelled ${s.cancelled_at ? formatDateTime(s.cancelled_at, settings.dateFormat) : ''}${s.cancel_reason ? ` — ${s.cancel_reason}` : ''}. Not counted in revenue or profit; stock was restored.`}
        />
      ) : null}

      <Card style={{ marginTop: space.md }}>
        <Txt variant="overline" tone="muted">
          Gross profit
        </Txt>
        <Txt variant="display" numeric tone={cancelled ? 'faint' : s.gross_profit < 0 ? 'negative' : 'positive'} style={{ marginTop: 4 }}>
          {formatMoney(s.gross_profit, { sign: true })}
        </Txt>
        <KeyValue label="Revenue" value={formatMoney(s.total_revenue)} />
        {s.delivery_fee_charged ? <KeyValue label="  incl. delivery fee charged" value={formatMoney(s.delivery_fee_charged)} /> : null}
        <KeyValue label="Acquisition cost (COGS)" value={formatMoney(s.total_cost)} />
      </Card>

      <SectionTitle title="Watches" />
      <Card padded={false}>
        {items.map((it, i) => (
          <ListRow
            key={it.id}
            left={<ProductThumb path={it.image_path} size={44} />}
            title={`${it.quantity} × ${it.brand_name} ${it.model}`}
            subtitle={`Batch ${it.batch_reference} (${formatDate(it.batch_purchase_date, settings.dateFormat)}) · cost ${formatMoney(it.unit_purchase_cost_snapshot + it.unit_additional_cost_snapshot)} each`}
            right={formatMoney(it.unit_selling_price)}
            rightSub={`profit ${formatMoney(it.gross_profit, { sign: true })}`}
            onPress={() => router.push({ pathname: '/purchase/[id]', params: { id: it.purchase_batch_id } })}
            last={i === items.length - 1}
          />
        ))}
      </Card>

      <SectionTitle title="Customer" />
      <Card>
        <KeyValue label="Name" value={s.customer_name ?? '—'} />
        <KeyValue label="Phone" value={s.customer_phone ?? '—'} />
        {s.order_reference ? <KeyValue label="Order reference" value={s.order_reference} /> : null}
        {s.notes ? <KeyValue label="Notes" value={s.notes} /> : null}
        {s.customer_phone ? (
          <Button title="Call customer" icon="call-outline" variant="ghost" small onPress={() => Linking.openURL(`tel:${s.customer_phone!.replace(/[^\d+]/g, '')}`)} style={{ marginTop: space.sm }} />
        ) : null}
      </Card>

      <SectionTitle title="Payments" />
      <Card>
        <KeyValue label="Total due" value={formatMoney(s.total_revenue)} />
        <KeyValue label="Received" value={formatMoney(s.amount_paid)} tone="positive" />
        <KeyValue label="Outstanding balance" value={formatMoney(cancelled ? 0 : balance)} tone={!cancelled && balance > 0 ? 'negative' : undefined} strong />
        <KeyValue label="Method" value={PAYMENT_METHOD_LABEL[s.payment_method]} />
      </Card>
      {payments.length ? (
        <Card padded={false} style={{ marginTop: space.sm }}>
          {payments.map((p, i) => (
            <ListRow
              key={p.id}
              icon={p.amount < 0 ? 'arrow-undo-outline' : 'cash-outline'}
              iconTone={p.amount < 0 ? 'negative' : 'positive'}
              title={`${p.kind === 'refund' ? 'Refund' : p.kind === 'adjustment' ? 'Correction' : 'Payment'} · ${PAYMENT_METHOD_LABEL[p.method]}`}
              subtitle={`${formatDate(p.payment_date, settings.dateFormat)}${p.note ? ' · ' + p.note : ''}`}
              right={formatMoney(p.amount, { sign: true })}
              rightTone={p.amount < 0 ? 'negative' : 'positive'}
              last={i === payments.length - 1}
            />
          ))}
        </Card>
      ) : null}

      {payOpen ? (
        <Card style={{ marginTop: space.md }}>
          <Txt variant="heading" style={{ marginBottom: space.md }}>
            Record a payment
          </Txt>
          <MoneyField label="Amount received" value={payAmount} onChangeText={setPayAmount} hint={`max ${formatMoney(balance)}`} />
          <DateField label="Payment date" value={payDate} onChange={setPayDate} />
          <Chips options={(['cash', 'bank_transfer', 'other'] as PaymentMethod[]).map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))} value={payMethod} onChange={setPayMethod} />
          <Row gap={space.sm} style={{ marginTop: space.lg }}>
            <Button title="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => setPayOpen(false)} />
            <Button title="Save payment" style={{ flex: 2 }} disabled={amount == null || amount <= 0 || amount > balance} onPress={doPay} />
          </Row>
        </Card>
      ) : null}

      <SectionTitle title="History of changes" />
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

      {!cancelled ? (
        <View style={{ marginTop: space.xl }}>
          {cancelOpen ? (
            <Card>
              <Field label="Reason for cancelling" optional value={cancelReason} onChangeText={setCancelReason} placeholder="e.g. Customer refused delivery" />
              <Row gap={space.sm}>
                <Button title="Keep sale" variant="secondary" style={{ flex: 1 }} onPress={() => setCancelOpen(false)} />
                <Button title="Cancel sale" variant="danger" style={{ flex: 1 }} onPress={doCancel} />
              </Row>
            </Card>
          ) : (
            <Button title="Cancel this sale" variant="danger" icon="close-circle-outline" onPress={() => setCancelOpen(true)} />
          )}
        </View>
      ) : null}
    </Screen>
  );
}
