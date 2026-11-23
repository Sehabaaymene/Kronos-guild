import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { getProduct, updateProduct, type ProductWithStock } from '../../../domain/catalog';
import { moneyToInput, parseMoney } from '../../../domain/money';
import { useApp, useData } from '../../../state/app';
import { Field, ImageField, MoneyField, QuantityField } from '../../../ui/forms';
import { Button, EmptyState, Loading } from '../../../ui/primitives';
import { Screen } from '../../../ui/Screen';

export default function EditProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading } = useData((db) => getProduct(db, id), [id]);
  if (!data) return <Screen title="Edit model" back>{loading ? <Loading /> : <EmptyState title="Not found" />}</Screen>;
  return <EditProductForm product={data} />;
}

function EditProductForm({ product }: { product: ProductWithStock }) {
  const { mutate } = useApp();
  const [form, setForm] = useState({
    brand: product.brand_name,
    model: product.model,
    sku: product.sku ?? '',
    description: product.description ?? '',
    notes: product.notes ?? '',
    price: moneyToInput(product.default_selling_price),
    threshold: product.low_stock_threshold,
    image: product.image_path,
  });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const price = parseMoney(form.price);

  const save = async () => {
    setSaving(true);
    const ok = await mutate(
      (db) =>
        updateProduct(db, {
          id: product.id,
          brandName: form.brand,
          model: form.model,
          sku: form.sku,
          description: form.description,
          notes: form.notes,
          imagePath: form.image,
          defaultSellingPrice: price ?? 0,
          lowStockThreshold: form.threshold,
        }),
      { success: 'Model updated' },
    );
    setSaving(false);
    if (ok !== undefined) router.back();
  };

  return (
    <Screen title="Edit model" back footer={<Button title="Save changes" icon="checkmark" onPress={save} loading={saving} disabled={!form.brand.trim() || !form.model.trim() || price == null} />}>
      <ImageField label="Watch picture" value={form.image} onChange={(image) => set({ image })} />
      <Field label="Brand" value={form.brand} onChangeText={(brand) => set({ brand })} autoCapitalize="words" />
      <Field label="Model" value={form.model} onChangeText={(model) => set({ model })} autoCapitalize="words" />
      <Field label="SKU / internal reference" optional value={form.sku} onChangeText={(sku) => set({ sku })} autoCapitalize="characters" />
      <MoneyField label="Default expected selling price" value={form.price} onChangeText={(p) => set({ price: p })} />
      <QuantityField label="Low-stock alert threshold" value={form.threshold} onChange={(threshold) => set({ threshold })} min={0} />
      <Field label="Description" optional value={form.description} onChangeText={(description) => set({ description })} multiline />
      <Field label="Notes" optional value={form.notes} onChangeText={(notes) => set({ notes })} multiline />
    </Screen>
  );
}
