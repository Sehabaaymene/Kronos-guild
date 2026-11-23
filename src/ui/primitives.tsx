import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { resolveFile } from '../services/files';
import { radius, space, TOUCH, type, useTheme } from '../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---------------------------------------------------------------- Text
type Variant = keyof typeof type;
type Tone = 'default' | 'muted' | 'faint' | 'positive' | 'negative' | 'gold' | 'warning' | 'onGold';

export function Txt({
  variant = 'body',
  tone = 'default',
  style,
  numeric,
  ...rest
}: TextProps & { variant?: Variant; tone?: Tone; numeric?: boolean }) {
  const { colors } = useTheme();
  const color = {
    default: colors.text,
    muted: colors.textMuted,
    faint: colors.textFaint,
    positive: colors.positive,
    negative: colors.negative,
    gold: colors.gold,
    warning: colors.warning,
    onGold: colors.onGold,
  }[tone];
  return (
    <Text
      maxFontSizeMultiplier={1.4}
      {...rest}
      style={[type[variant] as TextStyle, { color }, numeric && { fontVariant: ['tabular-nums'] }, style]}
    />
  );
}

// ---------------------------------------------------------------- Card
export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const { colors } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.lg,
    padding: padded ? space.lg : 0,
    overflow: 'hidden',
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { backgroundColor: colors.surfacePressed }, style]}>
      {children}
    </Pressable>
  );
}

// ---------------------------------------------------------------- Button
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  small,
  full = true,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  full?: boolean;
}) {
  const { colors } = useTheme();
  const bg = { primary: colors.gold, secondary: colors.surface2, ghost: 'transparent', danger: colors.negativeSoft }[variant];
  const fg = { primary: colors.onGold, secondary: colors.text, ghost: colors.gold, danger: colors.negative }[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          minHeight: small ? 40 : 52,
          paddingHorizontal: small ? space.md : space.xl,
          borderRadius: radius.md,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
          alignSelf: full ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.45 : pressed ? 0.8 : 1,
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 19} color={fg} /> : null}
      <Txt variant={small ? 'small' : 'bodyStrong'} style={{ color: fg, fontWeight: '600' }}>
        {title}
      </Txt>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  badge,
  tone = 'default',
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  badge?: number;
  tone?: 'default' | 'gold';
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: colors.border,
      })}
    >
      <Ionicons name={icon} size={20} color={tone === 'gold' ? colors.gold : colors.text} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: colors.negative,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 3,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------- Rows & sections
export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.sm }}>
      <Txt variant="overline" tone="muted">
        {title}
      </Txt>
      {action ? (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button">
          <Txt variant="small" tone="gold" style={{ fontWeight: '600' }}>
            {action}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  rightSub,
  rightTone,
  left,
  icon,
  iconTone,
  onPress,
  chevron = !!onPress,
  last,
}: {
  title: string;
  subtitle?: string | null;
  right?: string;
  rightSub?: string;
  rightTone?: Tone;
  left?: React.ReactNode;
  icon?: IconName;
  iconTone?: 'gold' | 'positive' | 'negative' | 'muted' | 'warning';
  onPress?: () => void;
  chevron?: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const iconColor = { gold: colors.gold, positive: colors.positive, negative: colors.negative, muted: colors.textMuted, warning: colors.warning }[
    iconTone ?? 'muted'
  ];
  const iconBg = { gold: colors.goldSoft, positive: colors.positiveSoft, negative: colors.negativeSoft, muted: colors.surface2, warning: colors.warningSoft }[
    iconTone ?? 'muted'
  ];
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.md,
        paddingHorizontal: space.lg,
        minHeight: 60,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      {left ??
        (icon ? (
          <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: iconBg }}>
            <Ionicons name={icon} size={18} color={iconColor} />
          </View>
        ) : null)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15 }}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="small" tone="muted" numberOfLines={2} style={{ marginTop: 2, fontSize: 13 }}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right != null ? (
        <View style={{ alignItems: 'flex-end', maxWidth: '45%' }}>
          <Txt variant="bodyStrong" tone={rightTone} numeric numberOfLines={1} style={{ fontSize: 15 }}>
            {right}
          </Txt>
          {rightSub ? (
            <Txt variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
              {rightSub}
            </Txt>
          ) : null}
        </View>
      ) : null}
      {chevron ? <Ionicons name="chevron-forward" size={16} color={colors.textFaint} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { backgroundColor: colors.surfacePressed }}>
      {content}
    </Pressable>
  );
}

export function KeyValue({ label, value, tone, strong }: { label: string; value: string; tone?: Tone; strong?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        gap: space.md,
      }}
    >
      <Txt variant="small" tone="muted" style={{ flexShrink: 1 }}>
        {label}
      </Txt>
      <Txt variant={strong ? 'bodyStrong' : 'body'} tone={tone} numeric style={{ fontSize: 15, textAlign: 'right', flexShrink: 1 }}>
        {value}
      </Txt>
    </View>
  );
}

// ---------------------------------------------------------------- Badges, progress
export function Badge({ label, tone = 'muted' }: { label: string; tone?: 'positive' | 'negative' | 'warning' | 'gold' | 'muted' }) {
  const { colors } = useTheme();
  const fg = { positive: colors.positive, negative: colors.negative, warning: colors.warning, gold: colors.gold, muted: colors.textMuted }[tone];
  const bg = { positive: colors.positiveSoft, negative: colors.negativeSoft, warning: colors.warningSoft, gold: colors.goldSoft, muted: colors.surface2 }[tone];
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: bg, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ value, tone = 'gold', height = 8 }: { value: number; tone?: 'gold' | 'positive' | 'negative'; height?: number }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  const fill = { gold: colors.gold, positive: colors.positive, negative: colors.negative }[tone];
  return (
    <View style={{ height, borderRadius: height, backgroundColor: colors.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height, borderRadius: height, backgroundColor: fill }} />
    </View>
  );
}

// ---------------------------------------------------------------- Empty / loading
export function EmptyState({
  icon = 'file-tray-outline',
  title,
  message,
  action,
  onAction,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxxl, paddingHorizontal: space.xl, gap: space.sm }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldSoft }}>
        <Ionicons name={icon} size={26} color={colors.gold} />
      </View>
      <Txt variant="heading" style={{ textAlign: 'center', marginTop: space.sm }}>
        {title}
      </Txt>
      {message ? (
        <Txt variant="small" tone="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
          {message}
        </Txt>
      ) : null}
      {action ? <Button title={action} onPress={onAction} full={false} style={{ marginTop: space.md }} small /> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: space.xxxl, alignItems: 'center', gap: space.md }}>
      <ActivityIndicator color={colors.gold} />
      {label ? (
        <Txt variant="small" tone="muted">
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

export function ErrorBox({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ padding: space.lg, borderRadius: radius.md, backgroundColor: colors.negativeSoft, marginVertical: space.md }}>
      <Txt variant="small" tone="negative">
        {message}
      </Txt>
    </View>
  );
}

export function Notice({ message, tone = 'gold', icon = 'information-circle-outline' }: { message: string; tone?: 'gold' | 'warning' | 'negative' | 'positive'; icon?: IconName }) {
  const { colors } = useTheme();
  const fg = { gold: colors.gold, warning: colors.warning, negative: colors.negative, positive: colors.positive }[tone];
  const bg = { gold: colors.goldSoft, warning: colors.warningSoft, negative: colors.negativeSoft, positive: colors.positiveSoft }[tone];
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: bg, marginVertical: space.sm }}>
      <Ionicons name={icon} size={18} color={fg} style={{ marginTop: 1 }} />
      <Txt variant="small" style={{ flex: 1, color: fg, lineHeight: 19 }}>
        {message}
      </Txt>
    </View>
  );
}

// ---------------------------------------------------------------- Product image
export function ProductThumb({ path, size = 44, rounded = 12 }: { path?: string | null; size?: number; rounded?: number }) {
  const { colors } = useTheme();
  const uri = resolveFile(path);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        backgroundColor: colors.surface2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" transition={150} />
      ) : (
        <Ionicons name="watch-outline" size={size * 0.45} color={colors.textFaint} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------- Chips / segmented
export function Chips<T extends string>({
  options,
  value,
  onChange,
  scroll,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  scroll?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: scroll ? 'nowrap' : 'wrap', gap: space.sm }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              minHeight: 40,
              paddingHorizontal: 14,
              justifyContent: 'center',
              borderRadius: radius.pill,
              backgroundColor: active ? colors.gold : colors.surface,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: active ? colors.gold : colors.border,
            }}
          >
            <Txt variant="small" style={{ color: active ? colors.onGold : colors.text, fontWeight: active ? '700' : '500' }}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 3, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.border }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{ flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: active ? colors.surface2 : 'transparent' }}
          >
            <Txt variant="small" style={{ fontWeight: active ? '700' : '500', color: active ? colors.text : colors.textMuted, fontSize: 13 }} numberOfLines={1}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ children, gap = space.md, style }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', gap, alignItems: 'center' }, style]}>{children}</View>;
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space.md }} />;
}

export function PressableArea(props: PressableProps & { style?: StyleProp<ViewStyle> }) {
  return <Pressable {...props} style={[{ minHeight: TOUCH }, props.style]} />;
}
