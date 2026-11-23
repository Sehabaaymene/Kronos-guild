import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { ActionSheetIOS, Platform, Pressable, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';
import { Alert } from './dialog';
import { errorMessage, useApp } from '../state/app';
import { formatDate, parseISODate, toISODate } from '../domain/dates';
import { formatMoney, parseMoney } from '../domain/money';
import { pickAndSaveImage } from '../services/files';
import { radius, space, useTheme } from '../theme';
import { ProductThumb, Row, Txt } from './primitives';

export function FieldLabel({ label, optional, hint }: { label: string; optional?: boolean; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
      <Txt variant="caption" tone="muted" style={{ fontSize: 13 }}>
        {label}
        {optional ? <Txt variant="caption" tone="faint">{'  optional'}</Txt> : null}
      </Txt>
      {hint ? (
        <Txt variant="caption" tone="faint">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function Field({
  label,
  optional,
  error,
  hint,
  suffix,
  style,
  ...input
}: TextInputProps & { label?: string; optional?: boolean; error?: string | null; hint?: string; suffix?: string }) {
  const { colors, name } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: space.lg }}>
      {label ? <FieldLabel label={label} optional={optional} hint={hint} /> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: input.multiline ? 'flex-start' : 'center',
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: error ? colors.negative : focused ? colors.gold : colors.border,
          paddingHorizontal: space.md,
        }}
      >
        <TextInput
          placeholderTextColor={colors.textFaint}
          keyboardAppearance={name}
          selectionColor={colors.gold}
          maxFontSizeMultiplier={1.4}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              minWidth: 0,
              minHeight: input.multiline ? 88 : 50,
              color: colors.text,
              fontSize: 16,
              paddingVertical: input.multiline ? 12 : 0,
              textAlignVertical: input.multiline ? 'top' : 'center',
            },
            style,
          ]}
        />
        {suffix ? (
          <Txt variant="small" tone="faint" style={{ marginLeft: 6 }}>
            {suffix}
          </Txt>
        ) : null}
      </View>
      {error ? (
        <Txt variant="caption" tone="negative" style={{ marginTop: 6 }}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

/** Amount input in DZD. Keeps the raw text; parse with parseMoney(). Shows a formatted preview. */
export function MoneyField({
  label,
  value,
  onChangeText,
  optional,
  error,
  hint,
  placeholder = '0',
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  optional?: boolean;
  error?: string | null;
  hint?: string;
  placeholder?: string;
}) {
  const parsed = parseMoney(value);
  const preview = value.trim() && parsed != null && parsed >= 100_000 ? formatMoney(parsed) : undefined;
  return (
    <Field
      label={label}
      optional={optional}
      error={error ?? (value.trim() && parsed == null ? 'Enter a valid amount' : null)}
      hint={hint ?? preview}
      value={value}
      onChangeText={(t) => onChangeText(t.replace(/[^0-9.,\s]/g, ''))}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      suffix="DZD"
      inputMode="decimal"
    />
  );
}

export function QuantityField({ label, value, onChange, min = 1, max }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const { colors } = useTheme();
  const step = (d: number) => {
    const next = Math.max(min, max != null ? Math.min(max, value + d) : value + d);
    if (next !== value) {
      Haptics.selectionAsync().catch(() => {});
      onChange(next);
    }
  };
  const btn = (icon: 'remove' | 'add', d: number, disabled: boolean) => (
    <Pressable
      onPress={() => step(d)}
      disabled={disabled}
      accessibilityLabel={icon === 'add' ? 'Increase' : 'Decrease'}
      style={({ pressed }) => ({
        width: 50,
        height: 50,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surfacePressed : colors.surface2,
        opacity: disabled ? 0.35 : 1,
      })}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
    </Pressable>
  );
  return (
    <View style={{ marginBottom: space.lg }}>
      <FieldLabel label={label} hint={max != null ? `max ${max}` : undefined} />
      <Row gap={space.sm}>
        {btn('remove', -1, value <= min)}
        <TextInput
          value={String(value)}
          onChangeText={(t) => {
            const n = parseInt(t.replace(/\D/g, '') || '0', 10);
            onChange(max != null ? Math.min(max, n) : n);
          }}
          onBlur={() => value < min && onChange(min)}
          keyboardType="number-pad"
          maxFontSizeMultiplier={1.3}
          style={{
            flex: 1,
            minWidth: 0,
            height: 50,
            textAlign: 'center',
            fontSize: 20,
            fontWeight: '700',
            color: colors.text,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
        {btn('add', 1, max != null && value >= max)}
      </Row>
    </View>
  );
}

export function DateField({ label, value, onChange, optional }: { label: string; value: string; onChange: (iso: string) => void; optional?: boolean }) {
  const { colors, name } = useTheme();
  const { settings } = useApp();
  const [open, setOpen] = useState(false);
  const date = parseISODate(value);
  if (Platform.OS === 'web') {
    // Web app: the browser's own date input (on iPhone Safari it opens the native date wheel).
    return (
      <View style={{ marginBottom: space.lg }}>
        <FieldLabel label={label} optional={optional} hint={formatDate(value, settings.dateFormat)} />
        {React.createElement('input', {
          type: 'date',
          value,
          onChange: (e: { target: { value: string } }) => e.target.value && onChange(e.target.value),
          'aria-label': label,
          style: {
            minHeight: 50,
            boxSizing: 'border-box',
            width: '100%',
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
            background: colors.surface,
            color: colors.text,
            padding: `0 ${space.md}px`,
            fontSize: 16,
            colorScheme: name,
            fontFamily: 'inherit',
          },
        })}
      </View>
    );
  }
  return (
    <View style={{ marginBottom: space.lg }}>
      <FieldLabel label={label} optional={optional} />
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{
          minHeight: 50,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: open ? colors.gold : colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: space.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Txt>{formatDate(value, settings.dateFormat)}</Txt>
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={{ marginTop: space.sm, backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' }}>
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            themeVariant={name}
            accentColor={colors.gold}
            onChange={(_e, d) => {
              if (Platform.OS !== 'ios') setOpen(false);
              if (d) {
                onChange(toISODate(d));
                if (Platform.OS === 'ios') setOpen(false);
              }
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

export function SwitchRow({ label, description, value, onChange, disabled }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, paddingHorizontal: space.lg, gap: space.md, minHeight: 56, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong" style={{ fontSize: 15 }}>
          {label}
        </Txt>
        {description ? (
          <Txt variant="caption" tone="muted" style={{ marginTop: 2, lineHeight: 16 }}>
            {description}
          </Txt>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.gold, false: colors.surface2 }} thumbColor="#fff" />
    </View>
  );
}

export type Suggestion = { key: string; title: string; subtitle?: string };

/**
 * Text input with live suggestions shown underneath (not a long dropdown).
 * Typing a value that is not suggested is allowed — it will be created.
 */
export function Autocomplete({
  label,
  value,
  onChangeText,
  suggestions,
  onPick,
  placeholder,
  createLabel,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  suggestions: Suggestion[];
  onPick: (s: Suggestion) => void;
  placeholder?: string;
  createLabel?: (v: string) => string;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const exact = suggestions.some((s) => s.title.toLowerCase() === value.trim().toLowerCase());
  const show = focused && (suggestions.length > 0 || (!!value.trim() && !exact));
  return (
    <View style={{ marginBottom: space.lg }}>
      <Field
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoCorrect={false}
        autoCapitalize="words"
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        style={{}}
      />
      {show ? (
        <View
          style={{
            marginTop: -space.md,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            overflow: 'hidden',
          }}
        >
          {suggestions.slice(0, 6).map((s, i) => (
            <Pressable
              key={s.key}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onPick(s);
                setFocused(false);
              }}
              style={({ pressed }) => ({
                minHeight: 48,
                paddingHorizontal: space.md,
                justifyContent: 'center',
                backgroundColor: pressed ? colors.surfacePressed : 'transparent',
                borderTopWidth: i ? StyleSheet.hairlineWidth : 0,
                borderTopColor: colors.border,
              })}
            >
              <Txt style={{ fontSize: 15 }}>{s.title}</Txt>
              {s.subtitle ? (
                <Txt variant="caption" tone="muted">
                  {s.subtitle}
                </Txt>
              ) : null}
            </Pressable>
          ))}
          {value.trim() && !exact && createLabel ? (
            <View style={{ minHeight: 44, paddingHorizontal: space.md, justifyContent: 'center', borderTopWidth: suggestions.length ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="add-circle-outline" size={16} color={colors.gold} />
              <Txt variant="small" tone="gold">
                {createLabel(value.trim())}
              </Txt>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Picture field: take a photo, choose from the library, or remove. */
export function ImageField({ label, value, onChange, square = true }: { label: string; value: string | null; onChange: (path: string | null) => void; square?: boolean }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const choose = async (source: 'camera' | 'library') => {
    setBusy(true);
    try {
      const path = await pickAndSaveImage(source, { square });
      if (path) onChange(path);
    } catch (e) {
      Alert.alert('Picture', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const open = () => {
    const options = ['Take photo', 'Choose from library', ...(value ? ['Remove picture'] : []), 'Cancel'];
    if (Platform.OS === 'web') {
      // Safari itself offers "Take Photo" or "Photo Library"; the picker must open directly from the tap.
      choose('library');
    } else if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: value ? 2 : undefined, userInterfaceStyle: 'dark' },
        (i) => {
          if (i === 0) choose('camera');
          else if (i === 1) choose('library');
          else if (value && i === 2) onChange(null);
        },
      );
    } else {
      Alert.alert(label, undefined, [
        { text: 'Take photo', onPress: () => choose('camera') },
        { text: 'Choose from library', onPress: () => choose('library') },
        ...(value ? [{ text: 'Remove picture', style: 'destructive' as const, onPress: () => onChange(null) }] : []),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };
  return (
    <View style={{ marginBottom: space.lg }}>
      <FieldLabel label={label} optional />
      <Pressable
        onPress={open}
        disabled={busy}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          padding: space.md,
          borderRadius: radius.md,
          borderWidth: 1,
          borderStyle: value ? 'solid' : 'dashed',
          borderColor: colors.borderStrong,
          backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        })}
      >
        <ProductThumb path={value} size={64} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong" style={{ fontSize: 15 }}>
            {busy ? 'Saving picture…' : value ? 'Change picture' : 'Add picture'}
          </Txt>
          <Txt variant="caption" tone="muted">
            Camera or photo library
          </Txt>
        </View>
        <Ionicons name="camera-outline" size={20} color={colors.gold} />
      </Pressable>
      {Platform.OS === 'web' && value ? (
        <Pressable onPress={() => onChange(null)} hitSlop={8} style={{ alignSelf: 'flex-end', marginTop: 6 }} accessibilityRole="button">
          <Txt variant="caption" tone="negative" style={{ fontWeight: '600' }}>
            Remove picture
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}
