import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatDateTime } from '../domain/dates';
import type { ActivityRow } from '../domain/finance';
import { formatMoney } from '../domain/money';
import { useApp } from '../state/app';
import { radius, space, useTheme } from '../theme';
import { Badge, ListRow, Txt, type IconName } from './primitives';

export function StatTile({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone?: 'positive' | 'negative' | 'gold'; icon?: IconName }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: '46%',
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: colors.border,
        padding: space.md + 2,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? <Ionicons name={icon} size={13} color={colors.textFaint} /> : null}
        <Txt variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Txt>
      </View>
      <Txt variant="heading" tone={tone} numeric numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Txt>
      {sub ? (
        <Txt variant="caption" tone="faint" numberOfLines={1}>
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}

export function Grid({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm + 2 }}>{children}</View>;
}

export function QuickAction({ icon, label, onPress, primary }: { icon: IconName; label: string; onPress: () => void; primary?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 84,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: primary ? colors.gold : pressed ? colors.surfacePressed : colors.surface,
        borderWidth: primary ? 0 : StyleSheet.hairlineWidth * 2,
        borderColor: colors.border,
        opacity: pressed && primary ? 0.85 : 1,
      })}
    >
      <Ionicons name={icon} size={22} color={primary ? colors.onGold : colors.gold} />
      <Txt variant="caption" style={{ color: primary ? colors.onGold : colors.text, fontWeight: '600', fontSize: 12 }} numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}

const ENTITY_ICON: Record<string, { icon: IconName; tone: 'gold' | 'positive' | 'negative' | 'muted' | 'warning' }> = {
  purchase: { icon: 'cube-outline', tone: 'gold' },
  sale: { icon: 'bag-check-outline', tone: 'positive' },
  expense: { icon: 'receipt-outline', tone: 'negative' },
  product: { icon: 'watch-outline', tone: 'muted' },
  brand: { icon: 'pricetag-outline', tone: 'muted' },
  goal: { icon: 'flag-outline', tone: 'gold' },
  expense_category: { icon: 'folder-outline', tone: 'muted' },
};

export function activityHref(a: Pick<ActivityRow, 'id' | 'entity_type' | 'entity_id' | 'action'>): Href {
  const deleted = a.action.endsWith('.delete');
  if (!deleted && a.entity_id) {
    switch (a.entity_type) {
      case 'purchase':
        return { pathname: '/purchase/[id]', params: { id: a.entity_id } };
      case 'sale':
        return { pathname: '/sale/[id]', params: { id: a.entity_id } };
      case 'expense':
        return { pathname: '/expense/[id]', params: { id: a.entity_id } };
      case 'product':
        return { pathname: '/product/[id]', params: { id: a.entity_id } };
      case 'goal':
        return { pathname: '/goal/[id]', params: { id: a.entity_id } };
    }
  }
  return { pathname: '/activity/[id]', params: { id: a.id } };
}

const STATUS_TONE: Record<string, 'positive' | 'negative' | 'warning' | 'gold' | 'muted'> = {
  completed: 'positive',
  recorded: 'gold',
  edited: 'warning',
  cancelled: 'negative',
  deleted: 'negative',
  payment: 'positive',
  adjusted: 'warning',
};

export function ActivityItem({ a, last }: { a: ActivityRow; last?: boolean }) {
  const { settings } = useApp();
  const meta = ENTITY_ICON[a.entity_type] ?? { icon: 'ellipse-outline' as IconName, tone: 'muted' as const };
  const isMoneyOut = a.entity_type === 'expense' || a.entity_type === 'purchase';
  return (
    <ListRow
      icon={a.action === 'sale.cancel' ? 'close-circle-outline' : meta.icon}
      iconTone={a.action === 'sale.cancel' ? 'negative' : meta.tone}
      title={a.summary}
      subtitle={`${a.reference ? a.reference + ' · ' : ''}${formatDateTime(a.created_at, settings.dateFormat)}`}
      right={a.amount != null && a.action !== 'goal.create' ? formatMoney(a.amount) : undefined}
      rightTone={a.action === 'sale.cancel' ? 'faint' : isMoneyOut ? 'default' : a.entity_type === 'sale' ? 'positive' : 'default'}
      onPress={() => router.push(activityHref(a))}
      last={last}
    />
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge label={status.replace(/_/g, ' ').toUpperCase()} tone={STATUS_TONE[status] ?? 'muted'} />;
}

export function PaymentBadge({ status }: { status: 'paid' | 'partial' | 'unpaid' }) {
  const tone = status === 'paid' ? 'positive' : status === 'partial' ? 'warning' : 'negative';
  return <Badge label={status === 'partial' ? 'PARTIALLY PAID' : status.toUpperCase()} tone={tone} />;
}

export function StockBadge({ stock, threshold }: { stock: number; threshold: number }) {
  if (stock <= 0) return <Badge label="OUT OF STOCK" tone="negative" />;
  if (stock <= threshold) return <Badge label="LOW STOCK" tone="warning" />;
  return <Badge label="IN STOCK" tone="positive" />;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = { cash: 'Cash', bank_transfer: 'Bank transfer', other: 'Other' };
