import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { adjustStock, ADJUSTMENT_REASONS, netRemovedByAdjustments, type AdjustmentReason } from '../../domain/adjustments';
import { today } from '../../domain/dates';
import { formatMoney } from '../../domain/money';
import { getBatch, unitLandedCost } from '../../domain/purchases';
import { useApp, useData } from '../../state/app';
import { space } from '../../theme';
import { DateField, Field, QuantityField } from '../../ui/forms';
import { Button, Card, Chips, KeyValue, Loading, Notice, SectionTitle, Segmented } from '../../ui/primitives';
import { Screen } from '../../ui/Screen';

const LABELS: Record<AdjustmentReason, string> = {
  damaged: 'Damaged',
  lost: 'Lost / stolen',
  personal_use: 'Personal use / gift',
  returned_to_supplier: 'Returned to supplier',
  count_correction: 'Count correction',
  found: 'Found / recount (+)',
};

export default function AdjustStock() {
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const { mutate } = useApp();
  const { data } = useData(async (db) => ({ b: await getBatch(db, batchId), removed: await netRemovedByAdjustments(db, batchId) }), [batchId]);
  const b = data?.b;
  const [direction, setDirection] = useState<'remove' | 'add'>('remove');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<AdjustmentReason>('damaged');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);

  if (!b) return <Screen title="Adjust stock" back><Loading /></Screen>;
  const max = direction === 'remove' ? b.quantity_remaining : Math.min(data!.removed, b.quantity_purchased - b.quantity_remaining);
  const value = qty * unitLandedCost(b);

  const save = async () => {
    setSaving(true);
    const ok = await mutate(
      (db) => adjustStock(db, { batchId, quantityChange: direction === 'remove' ? -qty : qty, reason: direction === 'add' ? 'found' : reason, note, date }),
      { success: 'Stock adjusted' },
    );
    setSaving(false);
    if (ok !== undefined) router.back();
  };

  return (
    <Screen
      title="Adjust stock"
      subtitle={`${b.reference} · ${b.brand_name} ${b.model}`}
      back
      footer={<Button title="Save correction" icon="checkmark" onPress={save} loading={saving} disabled={max <= 0 || qty < 1 || qty > max} />}
    >
      <Notice message="Use this only for stock that left or came back without a sale (damaged, lost, recount). To fix a typing mistake in the purchase, edit the purchase instead." />
      <Card>
        <KeyValue label="Currently in this batch" value={`${b.quantity_remaining} of ${b.quantity_purchased}`} />
        <KeyValue label="Cost per watch" value={formatMoney(unitLandedCost(b))} />
      </Card>
      <SectionTitle title="Correction" />
      <Segmented
        options={[
          { value: 'remove', label: 'Remove units' },
          { value: 'add', label: 'Add back units' },
        ]}
        value={direction}
        onChange={(d) => {
          setDirection(d);
          setQty(1);
        }}
      />
      <Card style={{ marginTop: space.md, padding: 0, borderWidth: 0, backgroundColor: 'transparent' }}>
        <QuantityField label="Quantity" value={Math.min(qty, Math.max(1, max))} onChange={setQty} min={1} max={Math.max(1, max)} />
      </Card>
      {direction === 'remove' ? (
        <>
          <SectionTitle title="Reason" />
          <Chips options={ADJUSTMENT_REASONS.filter((r) => r !== 'found').map((r) => ({ value: r, label: LABELS[r] }))} value={reason} onChange={setReason} />
        </>
      ) : null}
      <SectionTitle title="Details" />
      <DateField label="Date" value={date} onChange={setDate} />
      <Field label="Note" optional value={note} onChangeText={setNote} />
      {max <= 0 ? (
        <Notice
          tone="warning"
          message={
            direction === 'remove'
              ? 'This batch has no units left to remove.'
              : 'Nothing to add back: no units were removed by corrections. To return a sold watch, cancel or edit the sale.'
          }
        />
      ) : (
        <Notice
          tone={direction === 'remove' ? 'negative' : 'positive'}
          message={
            direction === 'remove'
              ? `${formatMoney(value)} will be recorded as an inventory loss (reduces net profit).`
              : `${formatMoney(value)} of previously recorded losses will be reversed.`
          }
        />
      )}
    </Screen>
  );
}
