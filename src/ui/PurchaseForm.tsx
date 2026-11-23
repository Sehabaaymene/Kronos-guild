import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { searchBrands, searchModels } from '../domain/catalog';
import { formatDate, today } from '../domain/dates';
import { formatMoney, moneyToInput, parseMoney } from '../domain/money';
import {
  createPurchase,
  getBatch,
  getPurchaseEditImpact,
  updatePurchase,
  type AdditionalCostMode,
  type PurchaseEditImpact,
} from '../domain/purchases';
import { useApp, useRequestId } from '../state/app';
import { space } from '../theme';
import { Autocomplete, DateField, Field, ImageField, MoneyField, QuantityField, SwitchRow, type Suggestion } from './forms';
import { Button, Card, KeyValue, Loading, Notice, Row, SectionTitle, Segmented, Txt } from './primitives';
import { Screen } from './Screen';

type FormState = {
  brand: string;
  model: string;
  sku: string;
  quantity: number;
  unitCost: string;
  expectedPrice: string;
  date: string;
  supplier: string;
  additional: string;
  mode: AdditionalCostMode;
  notes: string;
  receipt: string | null;
  productImage: string | null;
  applyToSales: boolean;
};

const EMPTY: FormState = {
  brand: '',
  model: '',
  sku: '',
  quantity: 1,
  unitCost: '',
  expectedPrice: '',
  date: today(),
  supplier: '',
  additional: '',
  mode: 'inventory',
  notes: '',
  receipt: null,
  productImage: null,
  applyToSales: false,
};

function useSuggestions<T>(fn: () => Promise<T[]>, deps: unknown[]): T[] {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => {
      fn().then((r) => alive && setItems(r)).catch(() => {});
    }, 80);
    return () => {
      alive = false;
      clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return items;
}

export function PurchaseForm({ editId, initialBrand, initialModel }: { editId?: string; initialBrand?: string; initialModel?: string }) {
  const { db, mutate } = useApp();
  const requestId = useRequestId();
  const [form, setForm] = useState<FormState | null>(editId ? null : { ...EMPTY, brand: initialBrand ?? '', model: initialModel ?? '' });
  const [original, setOriginal] = useState<{ unitCost: number; quantity: number; reference: string } | null>(null);
  const [impact, setImpact] = useState<PurchaseEditImpact | null>(null);
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [saving, setSaving] = useState(false);
  const [modelTouched, setModelTouched] = useState(false);

  // Load existing purchase for editing
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const b = await getBatch(db, editId);
      if (!b) return;
      setImpact(await getPurchaseEditImpact(db, editId));
      setOriginal({ unitCost: b.unit_cost, quantity: b.quantity_purchased, reference: b.reference });
      setForm({
        brand: b.brand_name,
        model: b.model,
        sku: '',
        quantity: b.quantity_purchased,
        unitCost: moneyToInput(b.unit_cost),
        expectedPrice: moneyToInput(b.expected_selling_price),
        date: b.purchase_date,
        supplier: b.supplier_name ?? '',
        additional: b.additional_cost ? moneyToInput(b.additional_cost) : '',
        mode: b.additional_cost_mode,
        notes: b.notes ?? '',
        receipt: b.receipt_path,
        productImage: null,
        applyToSales: false,
      });
    })();
  }, [db, editId]);

  // Prefill expected price when an initial model is given (from "Buy more")
  useEffect(() => {
    if (editId || !initialBrand || !initialModel) return;
    searchModels(db, initialBrand, initialModel, 1).then((r) => {
      if (r[0]) setForm((f) => (f && !f.expectedPrice ? { ...f, expectedPrice: moneyToInput(r[0].default_selling_price) } : f));
    });
  }, [db, editId, initialBrand, initialModel]);

  const brands = useSuggestions(() => searchBrands(db, form?.brand ?? ''), [form?.brand]);
  const models = useSuggestions(() => searchModels(db, form?.brand ?? '', form?.model ?? ''), [form?.brand, form?.model]);
  const suppliers = useSuggestions(
    () =>
      db.all<{ name: string }>(
        `SELECT DISTINCT supplier_name AS name FROM purchase_batches WHERE supplier_name IS NOT NULL AND supplier_name LIKE ? ORDER BY supplier_name LIMIT 5`,
        [`%${form?.supplier ?? ''}%`],
      ),
    [form?.supplier],
  );

  const existingModel = useMemo(
    () => models.find((m) => m.model.toLowerCase() === (form?.model ?? '').trim().toLowerCase() && m.brand_name.toLowerCase() === (form?.brand ?? '').trim().toLowerCase()),
    [models, form?.model, form?.brand],
  );

  if (!form) return <Screen title="Edit purchase" back><Loading /></Screen>;
  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });

  const unitCost = parseMoney(form.unitCost);
  const expected = parseMoney(form.expectedPrice);
  const additional = form.additional.trim() ? parseMoney(form.additional) : 0;
  const total = unitCost != null ? unitCost * form.quantity : 0;
  const minQty = impact?.minQuantity ?? 1;
  const errors: string[] = [];
  if (!form.brand.trim()) errors.push('Brand');
  if (!form.model.trim()) errors.push('Model');
  if (unitCost == null) errors.push('Purchase price');
  if (expected == null) errors.push('Expected selling price');
  if (additional == null) errors.push('Additional costs');
  if (form.quantity < minQty) errors.push(`Quantity (min ${minQty})`);
  const costChanged = original && (unitCost !== original.unitCost || form.quantity !== original.quantity);
  const marginPerUnit = unitCost != null && expected != null ? expected - unitCost - (form.mode === 'inventory' && additional ? Math.round(additional / form.quantity) : 0) : null;

  const submit = async () => {
    setSaving(true);
    const input = {
      brandName: form.brand,
      model: form.model,
      sku: form.sku || null,
      quantity: form.quantity,
      unitCost: unitCost!,
      expectedSellingPrice: expected!,
      purchaseDate: form.date,
      supplierName: form.supplier,
      additionalCost: additional ?? 0,
      additionalCostMode: form.mode,
      notes: form.notes,
      receiptPath: form.receipt,
      productImagePath: form.productImage,
    };
    const res = editId
      ? await mutate((db) => updatePurchase(db, { ...input, id: editId, applyCostToExistingSales: form.applyToSales }), { success: 'Purchase updated' })
      : await mutate((db) => createPurchase(db, { ...input, requestId }), { success: 'Purchase recorded' });
    setSaving(false);
    if (res === undefined) return;
    if (editId) router.back();
    else router.replace({ pathname: '/purchase/[id]', params: { id: (res as { batchId: string }).batchId } });
  };

  if (step === 'review') {
    return (
      <Screen
        title={editId ? 'Confirm changes' : 'Confirm purchase'}
        back
        footer={
          <Row gap={space.sm}>
            <Button title="Back" variant="secondary" onPress={() => setStep('form')} style={{ flex: 1 }} />
            <Button title={editId ? 'Save changes' : 'Confirm purchase'} icon="checkmark" onPress={submit} loading={saving} style={{ flex: 2 }} />
          </Row>
        }
      >
        <Card>
          <KeyValue label="Brand" value={form.brand.trim()} />
          <KeyValue label="Model" value={form.model.trim() + (existingModel ? '' : '  (new model)')} />
          <KeyValue label="Quantity" value={String(form.quantity)} />
          <KeyValue label="Unit purchase price" value={formatMoney(unitCost!)} />
          <KeyValue label="Expected selling price" value={formatMoney(expected!)} />
          <KeyValue label="Purchase date" value={formatDate(form.date)} />
          {form.supplier.trim() ? <KeyValue label="Supplier" value={form.supplier.trim()} /> : null}
          {additional ? (
            <KeyValue label="Additional costs" value={`${formatMoney(additional)} · ${form.mode === 'inventory' ? 'added to watch cost' : 'operating expense'}`} />
          ) : null}
          <KeyValue label="Total purchase cost" value={formatMoney(total + (additional ?? 0))} strong />
          {marginPerUnit != null ? (
            <KeyValue label="Expected profit per watch" value={formatMoney(marginPerUnit, { sign: true })} tone={marginPerUnit < 0 ? 'negative' : 'positive'} />
          ) : null}
        </Card>
        {editId && impact && impact.unitsConsumed > 0 ? (
          <Notice
            tone="warning"
            icon="warning-outline"
            message={`${impact.unitsConsumed} unit(s) of this purchase were already sold or adjusted. Stock will be recalculated: ${form.quantity - impact.unitsConsumed} unit(s) will remain.${
              costChanged ? (form.applyToSales ? ' The corrected cost will also update past sales.' : ' Past sales keep the cost they were recorded with.') : ''
            }`}
          />
        ) : null}
        <Txt variant="small" tone="muted" style={{ marginTop: space.md }}>
          Buying stock is not an expense: it is recorded as inventory. The cost only counts against profit when a watch is sold.
        </Txt>
      </Screen>
    );
  }

  return (
    <Screen
      title={editId ? `Edit ${original?.reference ?? 'purchase'}` : 'New purchase'}
      back
      footer={<Button title="Review" icon="arrow-forward" onPress={() => setStep('review')} disabled={errors.length > 0} />}
    >
      {editId && impact && impact.unitsConsumed > 0 ? (
        <Notice
          tone="warning"
          icon="warning-outline"
          message={`${impact.unitsSold} unit(s) from this purchase were sold in ${impact.saleCount} sale(s). Quantity cannot go below ${impact.minQuantity}.`}
        />
      ) : null}

      <SectionTitle title="Watch" />
      <Autocomplete
        label="Brand"
        value={form.brand}
        onChangeText={(brand) => set({ brand })}
        placeholder="e.g. Casio"
        suggestions={brands.map<Suggestion>((b) => ({ key: b.id, title: b.name }))}
        onPick={(s) => set({ brand: s.title, model: modelTouched ? form.model : '' })}
        createLabel={(v) => `New brand “${v}” will be created`}
        autoFocus={!editId && !initialBrand}
      />
      <Autocomplete
        label="Model"
        value={form.model}
        onChangeText={(model) => {
          setModelTouched(true);
          set({ model });
        }}
        placeholder="e.g. G-Shock GA-2100"
        suggestions={models.map<Suggestion>((m) => ({
          key: m.id,
          title: m.model,
          subtitle: `${m.brand_name}${m.sku ? ` · ${m.sku}` : ''} · sells at ${formatMoney(m.default_selling_price)}`,
        }))}
        onPick={(s) => {
          const m = models.find((x) => x.id === s.key);
          set({ model: s.title, brand: m?.brand_name ?? form.brand, expectedPrice: form.expectedPrice || (m ? moneyToInput(m.default_selling_price) : '') });
        }}
        createLabel={(v) => `New model “${v}” will be created`}
      />
      {!existingModel && form.model.trim() && !editId ? (
        <>
          <Field label="SKU / internal reference" optional value={form.sku} onChangeText={(sku) => set({ sku })} autoCapitalize="characters" />
          <ImageField label="Watch picture" value={form.productImage} onChange={(productImage) => set({ productImage })} />
        </>
      ) : null}

      <SectionTitle title="Quantity & price" />
      <QuantityField label="Quantity purchased" value={form.quantity} onChange={(quantity) => set({ quantity })} min={minQty} />
      <MoneyField label="Purchase price per watch" value={form.unitCost} onChangeText={(unitCost) => set({ unitCost })} />
      <MoneyField label="Expected selling price per watch" value={form.expectedPrice} onChangeText={(expectedPrice) => set({ expectedPrice })} />
      {unitCost != null ? (
        <Card style={{ marginBottom: space.lg }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt tone="muted" variant="small">
              Total purchase cost
            </Txt>
            <Txt variant="heading" numeric>
              {formatMoney(total)}
            </Txt>
          </Row>
          {marginPerUnit != null ? (
            <Txt variant="caption" tone={marginPerUnit < 0 ? 'negative' : 'positive'} style={{ marginTop: 4, textAlign: 'right' }}>
              Expected profit {formatMoney(marginPerUnit, { sign: true })} per watch
            </Txt>
          ) : null}
        </Card>
      ) : null}
      {editId && costChanged && impact && impact.unitsSold > 0 ? (
        <Card padded={false} style={{ marginBottom: space.lg }}>
          <SwitchRow
            label="Also correct the cost on past sales"
            description={`Turn on if the original price was a mistake. ${impact.saleCount} sale(s) will be recalculated. Leave off to keep the historical cost.`}
            value={form.applyToSales}
            onChange={(applyToSales) => set({ applyToSales })}
          />
        </Card>
      ) : null}
      <DateField label="Purchase date" value={form.date} onChange={(date) => set({ date })} />

      <SectionTitle title="Optional details" />
      <Autocomplete
        label="Supplier"
        value={form.supplier}
        onChangeText={(supplier) => set({ supplier })}
        placeholder="Supplier name"
        suggestions={suppliers.map<Suggestion>((s) => ({ key: s.name, title: s.name }))}
        onPick={(s) => set({ supplier: s.title })}
      />
      <MoneyField label="Additional purchase costs" optional value={form.additional} onChangeText={(a) => set({ additional: a })} hint="shipping, customs…" />
      {additional ? (
        <View style={{ marginBottom: space.lg }}>
          <Segmented
            options={[
              { value: 'inventory', label: 'Add to watch cost' },
              { value: 'expense', label: 'Record as expense' },
            ]}
            value={form.mode}
            onChange={(mode) => set({ mode })}
          />
          <Txt variant="caption" tone="muted" style={{ marginTop: 6, lineHeight: 16 }}>
            {form.mode === 'inventory'
              ? `Spread over the ${form.quantity} watch(es): +${formatMoney(Math.round(additional / form.quantity))} each. Counted in cost of goods when sold.`
              : 'Recorded once as an operating expense (Supplier-related expenses) on the purchase date.'}
          </Txt>
        </View>
      ) : null}
      <ImageField label="Invoice / receipt" value={form.receipt} onChange={(receipt) => set({ receipt })} square={false} />
      <Field label="Notes" optional value={form.notes} onChangeText={(notes) => set({ notes })} multiline />
      {errors.length ? (
        <Txt variant="caption" tone="faint">
          Required: {errors.join(', ')}
        </Txt>
      ) : null}
    </Screen>
  );
}
