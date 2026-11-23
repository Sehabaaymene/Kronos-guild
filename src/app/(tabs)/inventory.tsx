import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { listProducts, stockStatus, type ProductWithStock } from '../../domain/catalog';
import { getInventorySnapshot } from '../../domain/finance';
import { formatMoney } from '../../domain/money';
import { useData } from '../../state/app';
import { radius, space, useTheme } from '../../theme';
import { StockBadge } from '../../ui/business';
import { Card, Chips, EmptyState, IconButton, Loading, ProductThumb, Row, Txt } from '../../ui/primitives';
import { Screen, SearchBar } from '../../ui/Screen';

type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
type Sort = 'recent' | 'stock_desc' | 'stock_asc' | 'price_desc' | 'brand';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'stock_desc', label: 'Highest stock' },
  { value: 'stock_asc', label: 'Lowest stock' },
  { value: 'price_desc', label: 'Highest price' },
  { value: 'brand', label: 'Brand' },
];

export default function Inventory() {
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [brand, setBrand] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const { data } = useData(async (db) => ({ products: await listProducts(db), inv: await getInventorySnapshot(db) }));

  const brands = useMemo(() => [...new Set((data?.products ?? []).map((p) => p.brand_name))].sort(), [data]);

  const items = useMemo(() => {
    let list = (data?.products ?? []).slice();
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((p) => `${p.brand_name} ${p.model} ${p.sku ?? ''}`.toLowerCase().includes(s));
    if (brand !== 'all') list = list.filter((p) => p.brand_name === brand);
    if (filter !== 'all') list = list.filter((p) => stockStatus(p.stock, p.low_stock_threshold) === filter);
    const cmp: Record<Sort, (a: ProductWithStock, b: ProductWithStock) => number> = {
      recent: (a, b) => b.created_at.localeCompare(a.created_at),
      stock_desc: (a, b) => b.stock - a.stock,
      stock_asc: (a, b) => a.stock - b.stock,
      price_desc: (a, b) => b.default_selling_price - a.default_selling_price,
      brand: (a, b) => (a.brand_name + a.model).localeCompare(b.brand_name + b.model),
    };
    return list.sort(cmp[sort]);
  }, [data, q, brand, filter, sort]);

  return (
    <Screen
      title="Inventory"
      subtitle={data ? `${data.inv.unitsInStock} watches · ${formatMoney(data.inv.inventoryValue)} at cost` : undefined}
      right={<IconButton icon="add" label="Add purchase" tone="gold" onPress={() => router.push('/purchase/new')} />}
      tabScreen
    >
      <SearchBar value={q} onChangeText={setQ} placeholder="Search brand, model or SKU" />
      <View style={{ marginTop: space.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg }}>
          <Chips
            scroll
            options={[
              { value: 'all', label: `All${data ? ` (${data.products.length})` : ''}` },
              { value: 'in_stock', label: 'In stock' },
              { value: 'low_stock', label: `Low stock${data?.inv.lowStockCount ? ` (${data.inv.lowStockCount})` : ''}` },
              { value: 'out_of_stock', label: `Out of stock${data?.inv.outOfStockCount ? ` (${data.inv.outOfStockCount})` : ''}` },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </ScrollView>
      </View>
      {brands.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg, marginTop: space.sm }} contentContainerStyle={{ paddingHorizontal: space.lg }}>
          <Chips scroll options={[{ value: 'all', label: 'All brands' }, ...brands.map((b) => ({ value: b, label: b }))]} value={brand} onChange={setBrand} />
        </ScrollView>
      ) : null}
      <Row style={{ marginTop: space.md, justifyContent: 'space-between' }}>
        <Txt variant="caption" tone="faint">
          {items.length} model(s)
        </Txt>
        <Pressable
          hitSlop={10}
          onPress={() => setSort(SORTS[(SORTS.findIndex((s) => s.value === sort) + 1) % SORTS.length].value)}
          accessibilityRole="button"
        >
          <Txt variant="caption" tone="gold" style={{ fontWeight: '600' }}>
            Sort: {SORTS.find((s) => s.value === sort)?.label} ↻
          </Txt>
        </Pressable>
      </Row>

      {!data ? (
        <Loading />
      ) : !data.products.length ? (
        <Card style={{ marginTop: space.md }}>
          <EmptyState icon="watch-outline" title="No watches yet" message="Record a purchase to add watches to your inventory." action="Add purchase" onAction={() => router.push('/purchase/new')} />
        </Card>
      ) : !items.length ? (
        <EmptyState icon="search-outline" title="Nothing found" message="Try another search or filter." />
      ) : (
        <View style={{ marginTop: space.md, gap: space.sm + 2 }}>
          {items.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                gap: space.md,
                padding: space.md,
                borderRadius: radius.lg,
                backgroundColor: pressed ? colors.surfacePressed : colors.surface,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: colors.border,
                alignItems: 'center',
              })}
            >
              <ProductThumb path={p.image_path} size={64} rounded={14} />
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Txt variant="caption" tone="gold" style={{ fontWeight: '700', letterSpacing: 0.5 }} numberOfLines={1}>
                  {p.brand_name.toUpperCase()}
                </Txt>
                <Txt variant="bodyStrong" numberOfLines={1}>
                  {p.model}
                </Txt>
                <Row gap={space.sm}>
                  <StockBadge stock={p.stock} threshold={p.low_stock_threshold} />
                  <Txt variant="caption" tone="muted" numeric>
                    {formatMoney(p.default_selling_price)}
                  </Txt>
                </Row>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt variant="title" numeric tone={p.stock <= 0 ? 'negative' : p.stock <= p.low_stock_threshold ? 'warning' : 'default'}>
                  {p.stock}
                </Txt>
                <Txt variant="caption" tone="faint">
                  in stock
                </Txt>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
