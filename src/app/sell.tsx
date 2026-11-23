import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { listProducts, type ProductWithStock } from '../domain/catalog';
import type { PaymentMethod } from '../domain/core';
import { formatDate, today } from '../domain/dates';
import { formatMoney, moneyToInput, parseMoney, share, type Money } from '../domain/money';
import { listBatches, type PurchaseBatch } from '../domain/purchases';
import { createSale, getSale, updateSale, type SaleItemInput } from '../domain/sales';
import { useApp, useData, useRequestId } from '../state/app';
import { radius, space, useTheme } from '../theme';
import { PAYMENT_METHOD_LABEL } from '../ui/business';
import { DateField, Field, MoneyField } from '../ui/forms';
import { Button, Card, Chips, EmptyState, KeyValue, Loading, Notice, ProductThumb, Row, SectionTitle, Segmented, Txt } from '../ui/primitives';
import { Screen, SearchBar } from '../ui/Screen';

type Line = { productId: string; price: string; qty: Record<string, number> };
type PayStatus = 'paid' | 'partial' | 'unpaid';

/** Cost of `qty` units from a batch, computed exactly like the database does. */
function lineCost(b: PurchaseBatch, qty: number): Money {
  return qty * b.unit_cost + (b.additional_cost_mode === 'inventory' ? share(b.additional_cost, qty, b.quantity_purchased) : 0);
}

type SellParams = { productId?: string; batchId?: string; saleId?: string };
type SellData = { products: ProductWithStock[]; batches: PurchaseBatch[]; existing: Awaited<ReturnType<typeof getSale>> };

export default function Sell() {
  const params = useLocalSearchParams<SellParams>();
  const { data } = useData(
    async (db): Promise<SellData> => ({
      products: await listProducts(db),
      batches: await listBatches(db),
      existing: params.saleId ? await getSale(db, params.saleId) : null,
    }),
    [params.saleId],
  );
  if (!data) return <Screen title="Sell a watch" back><Loading /></Screen>;
  return <SellFlow data={data} params={params} />;
}

/** New line for a product. Pre-selects a batch only when there is no choice to make (one batch) or one was explicitly chosen. */
function newLine(data: SellData, productId: string, available: (b: PurchaseBatch) => number, preferredBatch?: string): Line | null {
  const p = data.products.find((x) => x.id === productId);
  if (!p) return null;
  const eligible = data.batches.filter((b) => b.product_id === productId && available(b) > 0);
  const qty: Record<string, number> = {};
  if (preferredBatch && eligible.some((b) => b.id === preferredBatch)) qty[preferredBatch] = 1;
  else if (eligible.length === 1) qty[eligible[0].id] = 1;
  return { productId, price: moneyToInput(p.default_selling_price), qty };
}

function SellFlow({ data, params }: { data: SellData; params: SellParams }) {
  const editId = data.existing ? params.saleId : undefined;
  const existing = data.existing?.sale;
  const { mutate, settings } = useApp();
  const { colors } = useTheme();
  const requestId = useRequestId();

  // Units already in the sale being edited count as available again.
  const original = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of data.existing?.items ?? []) m.set(it.purchase_batch_id, (m.get(it.purchase_batch_id) ?? 0) + it.quantity);
    return m;
  }, [data.existing]);
  const available = (b: PurchaseBatch) => b.quantity_remaining + (original.get(b.id) ?? 0);
  const productStock = (p: ProductWithStock) =>
    p.stock + [...original.entries()].reduce((s, [bid, q]) => s + (data.batches.find((b) => b.id === bid)?.product_id === p.id ? q : 0), 0);

  const [lines, setLines] = useState<Line[]>(() => {
    if (data.existing) {
      const byProduct = new Map<string, Line>();
      for (const it of data.existing.items) {
        const l = byProduct.get(it.product_id) ?? { productId: it.product_id, price: moneyToInput(it.unit_selling_price), qty: {} };
        l.qty[it.purchase_batch_id] = (l.qty[it.purchase_batch_id] ?? 0) + it.quantity;
        byProduct.set(it.product_id, l);
      }
      return [...byProduct.values()];
    }
    const first = params.productId ? newLine(data, params.productId, available, params.batchId) : null;
    return first ? [first] : [];
  });
  const [step, setStep] = useState<'pick' | 'details' | 'review'>(lines.length ? 'details' : 'pick');
  const [current, setCurrent] = useState<string | null>(existing ? null : (params.productId ?? null));
  const [q, setQ] = useState('');
  const [date, setDate] = useState(existing?.sale_date ?? today());
  const [customer, setCustomer] = useState(existing?.customer_name ?? '');
  const [phone, setPhone] = useState(existing?.customer_phone ?? '');
  const [delivery, setDelivery] = useState(existing?.delivery_fee_charged ? moneyToInput(existing.delivery_fee_charged) : '');
  const [method, setMethod] = useState<PaymentMethod>(existing?.payment_method ?? 'cash');
  const [payStatus, setPayStatus] = useState<PayStatus>(existing?.payment_status ?? 'paid');
  const [received, setReceived] = useState(existing?.payment_status === 'partial' ? moneyToInput(existing.amount_paid) : '');
  const [orderRef, setOrderRef] = useState(existing?.order_reference ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  function startLine(productId: string) {
    const line = newLine(data, productId, available);
    if (!line) return;
    setLines((prev) => (prev.some((l) => l.productId === productId) ? prev : [...prev, line]));
    setCurrent(productId);
    setStep('details');
  }

  const productById = new Map(data.products.map((p) => [p.id, p]));
  const batchById = new Map(data.batches.map((b) => [b.id, b]));

  // ------------------------------------------------ computed sale
  const computed = lines.map((l) => {
    const price = parseMoney(l.price);
    const parts = Object.entries(l.qty)
      .filter(([, n]) => n > 0)
      .map(([bid, n]) => {
        const b = batchById.get(bid)!;
        return { batch: b, qty: n, cost: lineCost(b, n) };
      });
    const units = parts.reduce((s, x) => s + x.qty, 0);
    const revenue = price != null ? price * units : 0;
    const cost = parts.reduce((s, x) => s + x.cost, 0);
    return { line: l, product: productById.get(l.productId)!, price, parts, units, revenue, cost };
  });
  const deliveryFee = delivery.trim() ? parseMoney(delivery) : 0;
  const itemsRevenue = computed.reduce((s, c) => s + c.revenue, 0);
  const totalRevenue = itemsRevenue + (deliveryFee ?? 0);
  const totalCost = computed.reduce((s, c) => s + c.cost, 0);
  const grossProfit = totalRevenue - totalCost;
  const totalUnits = computed.reduce((s, c) => s + c.units, 0);
  const receivedAmount = payStatus === 'paid' ? totalRevenue : payStatus === 'unpaid' ? 0 : parseMoney(received);

  const problems: string[] = [];
  if (!totalUnits) problems.push('Choose at least one watch from a batch');
  for (const c of computed) {
    if (c.price == null) problems.push(`Selling price for ${c.product.model}`);
    if (c.units === 0) problems.push(`Choose a batch for ${c.product.model}`);
  }
  if (deliveryFee == null) problems.push('Delivery fee');
  if (payStatus === 'partial' && (receivedAmount == null || receivedAmount <= 0 || receivedAmount >= totalRevenue)) {
    problems.push('Amount received (must be between 0 and the total)');
  }

  const setQty = (productId: string, batchId: string, n: number) =>
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, qty: { ...l.qty, [batchId]: Math.max(0, n) } } : l)));
  const setPrice = (productId: string, price: string) => setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, price } : l)));
  const removeLine = (productId: string) => setLines((prev) => prev.filter((l) => l.productId !== productId));

  const submit = async () => {
    const items: SaleItemInput[] = computed.flatMap((c) => c.parts.map((p) => ({ batchId: p.batch.id, quantity: p.qty, unitPrice: c.price! })));
    const input = {
      saleDate: date,
      items,
      customerName: customer,
      customerPhone: phone,
      deliveryFeeCharged: deliveryFee ?? 0,
      paymentMethod: method,
      amountReceived: receivedAmount ?? 0,
      orderReference: orderRef,
      notes,
    };
    setSaving(true);
    const res = editId
      ? await mutate((db) => updateSale(db, { ...input, id: editId }), { success: 'Sale updated' })
      : await mutate((db) => createSale(db, { ...input, requestId }), { success: 'Sale recorded' });
    setSaving(false);
    if (res === undefined) return;
    if (editId) router.back();
    else router.replace({ pathname: '/sale/[id]', params: { id: (res as { saleId: string }).saleId } });
  };

  // ================================================= STEP 1 — pick a watch
  if (step === 'pick') {
    const s = q.trim().toLowerCase();
    const list = data.products
      .filter((p) => productStock(p) > 0 && !lines.some((l) => l.productId === p.id))
      .filter((p) => !s || `${p.brand_name} ${p.model} ${p.sku ?? ''}`.toLowerCase().includes(s));
    return (
      <Screen
        title={lines.length ? 'Add another watch' : 'Sell a watch'}
        subtitle="Step 1 · choose the watch"
        back
        footer={lines.length ? <Button title="Back to sale" variant="secondary" onPress={() => setStep('details')} /> : undefined}
      >
        <SearchBar value={q} onChangeText={setQ} placeholder="Search brand, model or SKU" />
        {!list.length ? (
          <EmptyState
            icon="watch-outline"
            title={data.products.length ? 'Nothing in stock matches' : 'No watches in stock'}
            message={data.products.length ? 'Only models with available stock can be sold.' : 'Record a purchase first.'}
            action={data.products.length ? undefined : 'Add purchase'}
            onAction={() => router.push('/purchase/new')}
          />
        ) : (
          <View style={{ marginTop: space.md, gap: space.sm }}>
            {list.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => startLine(p.id)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  padding: space.md,
                  borderRadius: radius.lg,
                  backgroundColor: pressed ? colors.surfacePressed : colors.surface,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: colors.border,
                })}
              >
                <ProductThumb path={p.image_path} size={56} />
                <View style={{ flex: 1 }}>
                  <Txt variant="caption" tone="gold" style={{ fontWeight: '700' }}>
                    {p.brand_name.toUpperCase()}
                  </Txt>
                  <Txt variant="bodyStrong" numberOfLines={1}>
                    {p.model}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {formatMoney(p.default_selling_price)} suggested{p.sku ? ` · ${p.sku}` : ''}
                  </Txt>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt variant="heading" numeric>
                    {productStock(p)}
                  </Txt>
                  <Txt variant="caption" tone="faint">
                    available
                  </Txt>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </Screen>
    );
  }

  // ================================================= STEP 3 — review & confirm
  if (step === 'review') {
    return (
      <Screen
        title={editId ? 'Confirm changes' : 'Confirm sale'}
        subtitle={`Step 3 · ${totalUnits} watch(es)`}
        back
        footer={
          <Row gap={space.sm}>
            <Button title="Back" variant="secondary" style={{ flex: 1 }} onPress={() => setStep('details')} />
            <Button title={editId ? 'Save changes' : 'Confirm sale'} icon="checkmark" style={{ flex: 2 }} loading={saving} onPress={submit} />
          </Row>
        }
      >
        {computed.map((c) => (
          <Card key={c.line.productId} style={{ marginBottom: space.md }}>
            <Row style={{ marginBottom: space.sm }}>
              <ProductThumb path={c.product.image_path} size={44} />
              <View style={{ flex: 1 }}>
                <Txt variant="caption" tone="gold" style={{ fontWeight: '700' }}>
                  {c.product.brand_name.toUpperCase()}
                </Txt>
                <Txt variant="bodyStrong">{c.product.model}</Txt>
              </View>
            </Row>
            {c.parts.map((p) => (
              <View key={p.batch.id}>
                <KeyValue label={`Batch ${p.batch.reference} (${formatDate(p.batch.purchase_date)})`} value={`${p.qty} watch(es)`} />
                <KeyValue label="Unit purchase cost" value={formatMoney(Math.round(p.cost / p.qty))} />
              </View>
            ))}
            <KeyValue label="Unit selling price" value={formatMoney(c.price ?? 0)} />
            <KeyValue label="Revenue" value={formatMoney(c.revenue)} />
            <KeyValue label="Acquisition cost" value={formatMoney(c.cost)} />
            <KeyValue label="Gross profit" value={formatMoney(c.revenue - c.cost, { sign: true })} tone={c.revenue - c.cost < 0 ? 'negative' : 'positive'} strong />
          </Card>
        ))}
        <Card>
          {deliveryFee ? <KeyValue label="Delivery fee charged" value={formatMoney(deliveryFee)} /> : null}
          <KeyValue label="Total revenue" value={formatMoney(totalRevenue)} strong />
          <KeyValue label="Total acquisition cost" value={formatMoney(totalCost)} />
          <KeyValue label="Gross profit" value={formatMoney(grossProfit, { sign: true })} tone={grossProfit < 0 ? 'negative' : 'positive'} strong />
          <KeyValue label="Customer" value={[customer.trim(), phone.trim()].filter(Boolean).join(' · ') || '—'} />
          <KeyValue label="Payment" value={`${payStatus === 'paid' ? 'Paid' : payStatus === 'partial' ? 'Partially paid' : 'Unpaid'} · ${PAYMENT_METHOD_LABEL[method]}`} />
          <KeyValue label="Cash received now" value={formatMoney(receivedAmount ?? 0)} />
          {totalRevenue - (receivedAmount ?? 0) > 0 ? <KeyValue label="Still owed" value={formatMoney(totalRevenue - (receivedAmount ?? 0))} tone="negative" /> : null}
          <KeyValue label="Sale date" value={formatDate(date, settings.dateFormat)} />
        </Card>
        {grossProfit < 0 ? <Notice tone="negative" icon="warning-outline" message="This sale is below cost: it will reduce your profit." /> : null}
      </Screen>
    );
  }

  // ================================================= STEP 2 — batches, price, details
  return (
    <Screen
      title={editId ? `Edit ${data.existing?.sale.reference ?? 'sale'}` : 'Sell a watch'}
      subtitle="Step 2 · batch, price & payment"
      back
      footer={
        <View style={{ gap: space.sm }}>
          {totalUnits ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="small" tone="muted">
                {totalUnits} watch(es) · profit{' '}
                <Txt variant="small" tone={grossProfit < 0 ? 'negative' : 'positive'} style={{ fontWeight: '700' }}>
                  {formatMoney(grossProfit, { sign: true })}
                </Txt>
              </Txt>
              <Txt variant="bodyStrong" numeric>
                {formatMoney(totalRevenue)}
              </Txt>
            </Row>
          ) : null}
          <Button title="Review sale" icon="arrow-forward" disabled={problems.length > 0} onPress={() => setStep('review')} />
        </View>
      }
    >
      {computed.map((c) => {
        const productBatches = data.batches
          .filter((b) => b.product_id === c.line.productId && (available(b) > 0 || (c.line.qty[b.id] ?? 0) > 0))
          .sort((a, b) => a.purchase_date.localeCompare(b.purchase_date) || a.reference.localeCompare(b.reference));
        const multi = productBatches.length > 1;
        return (
          <Card key={c.line.productId} style={{ marginBottom: space.lg, borderColor: current === c.line.productId ? colors.borderStrong : colors.border }}>
            <Row>
              <ProductThumb path={c.product.image_path} size={56} />
              <View style={{ flex: 1 }}>
                <Txt variant="caption" tone="gold" style={{ fontWeight: '700' }}>
                  {c.product.brand_name.toUpperCase()}
                </Txt>
                <Txt variant="bodyStrong">{c.product.model}</Txt>
                <Txt variant="caption" tone="muted">
                  {productStock(c.product)} available · suggested {formatMoney(c.product.default_selling_price)}
                </Txt>
              </View>
              {lines.length > 1 || editId ? (
                <Pressable hitSlop={10} onPress={() => removeLine(c.line.productId)} accessibilityLabel="Remove watch">
                  <Ionicons name="close-circle" size={24} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </Row>

            <SectionTitle title={multi ? 'Choose the purchase batch' : 'Purchase batch'} />
            {multi ? (
              <Txt variant="caption" tone="muted" style={{ marginBottom: space.sm, lineHeight: 16 }}>
                This model was bought in {productBatches.length} batches at different costs. Choose which one the watch comes from — you can take units from several.
              </Txt>
            ) : null}
            <View style={{ gap: space.sm }}>
              {productBatches.map((b) => {
                const n = c.line.qty[b.id] ?? 0;
                const avail = available(b);
                const selected = n > 0;
                return (
                  <View
                    key={b.id}
                    style={{
                      borderRadius: radius.md,
                      borderWidth: 1.5,
                      borderColor: selected ? colors.gold : colors.border,
                      backgroundColor: selected ? colors.goldSoft : colors.surface2,
                      padding: space.md,
                    }}
                  >
                    <Pressable onPress={() => setQty(c.line.productId, b.id, selected ? 0 : 1)} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}>
                      <Row style={{ alignItems: 'flex-start' }}>
                        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? colors.gold : colors.textFaint} />
                        <View style={{ flex: 1 }}>
                          <Txt variant="bodyStrong" style={{ fontSize: 15 }}>
                            Batch {b.reference}
                          </Txt>
                          <Txt variant="caption" tone="muted" style={{ marginTop: 2 }}>
                            Bought {formatDate(b.purchase_date, settings.dateFormat)} · {b.quantity_purchased} purchased · {avail} remaining
                          </Txt>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Txt variant="bodyStrong" numeric style={{ fontSize: 15 }}>
                            {formatMoney(lineCost(b, 1))}
                          </Txt>
                          <Txt variant="caption" tone="faint">
                            unit cost
                          </Txt>
                        </View>
                      </Row>
                    </Pressable>
                    {selected ? (
                      <Row style={{ marginTop: space.md, justifyContent: 'space-between' }}>
                        <Txt variant="small" tone="muted">
                          Quantity from this batch
                        </Txt>
                        <Row gap={space.sm}>
                          <StepBtn icon="remove" onPress={() => setQty(c.line.productId, b.id, n - 1)} />
                          <Txt variant="heading" numeric style={{ minWidth: 28, textAlign: 'center' }}>
                            {n}
                          </Txt>
                          <StepBtn icon="add" disabled={n >= avail} onPress={() => setQty(c.line.productId, b.id, Math.min(avail, n + 1))} />
                        </Row>
                      </Row>
                    ) : null}
                  </View>
                );
              })}
            </View>

            <View style={{ marginTop: space.lg }}>
              <MoneyField
                label="Selling price per watch"
                value={c.line.price}
                onChangeText={(v) => setPrice(c.line.productId, v)}
                hint={c.price != null && c.price !== c.product.default_selling_price ? 'negotiated price' : 'suggested price'}
              />
            </View>
            {c.units ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt variant="small" tone="muted">
                  {c.units} × {formatMoney(c.price ?? 0)} · cost {formatMoney(c.cost)}
                </Txt>
                <Txt variant="small" tone={c.revenue - c.cost < 0 ? 'negative' : 'positive'} style={{ fontWeight: '700' }}>
                  {formatMoney(c.revenue - c.cost, { sign: true })}
                </Txt>
              </Row>
            ) : null}
          </Card>
        );
      })}

      <Button title="Add another watch to this sale" icon="add" variant="secondary" onPress={() => setStep('pick')} />

      <SectionTitle title="Payment" />
      <Segmented
        options={[
          { value: 'paid', label: 'Paid' },
          { value: 'partial', label: 'Partially paid' },
          { value: 'unpaid', label: 'Unpaid' },
        ]}
        value={payStatus}
        onChange={(v) => {
          setPayStatus(v);
          if (v === 'partial' && editId && data.existing) {
            if (!received) setReceived(moneyToInput(data.existing.sale.amount_paid || 0));
          }
        }}
      />
      <View style={{ marginTop: space.md }}>
        {payStatus === 'partial' ? <MoneyField label="Amount received now" value={received} onChangeText={setReceived} /> : null}
        <Chips
          options={(['cash', 'bank_transfer', 'other'] as PaymentMethod[]).map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))}
          value={method}
          onChange={setMethod}
        />
        {payStatus !== 'paid' ? (
          <Txt variant="caption" tone="muted" style={{ marginTop: space.sm }}>
            The sale counts in revenue now; unpaid money is tracked as a customer balance, not as cash received.
          </Txt>
        ) : null}
      </View>

      <SectionTitle title="Customer & delivery (optional)" />
      <Field label="Customer name" optional value={customer} onChangeText={setCustomer} autoCapitalize="words" />
      <Field label="Customer phone" optional value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <MoneyField label="Delivery fee charged to customer" optional value={delivery} onChangeText={setDelivery} />
      <Field label="Order reference" optional value={orderRef} onChangeText={setOrderRef} autoCapitalize="characters" />
      <DateField label="Sale date" value={date} onChange={setDate} />
      <Field label="Notes" optional value={notes} onChangeText={setNotes} multiline />
      {problems.length && totalUnits ? (
        <Txt variant="caption" tone="faint">
          To continue: {problems.join(' · ')}
        </Txt>
      ) : null}
    </Screen>
  );
}

function StepBtn({ icon, onPress, disabled }: { icon: 'add' | 'remove'; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={icon === 'add' ? 'More' : 'Less'}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        opacity: disabled ? 0.35 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}
