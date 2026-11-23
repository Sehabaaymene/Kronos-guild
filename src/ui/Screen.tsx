import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, useTheme } from '../theme';
import { Txt } from './primitives';

/**
 * Standard page: large title header, scrolling content, optional sticky
 * footer for the main action (thumb-reachable at the bottom of the screen).
 */
export function Screen({
  title,
  subtitle,
  right,
  back,
  footer,
  children,
  scroll = true,
  scrollProps,
  tabScreen,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  back?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  scrollProps?: ScrollViewProps;
  /** Tab screens leave room for the floating tab bar. */
  tabScreen?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space.sm }}>
        {back ? (
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={10}
            accessibilityLabel="Back"
            accessibilityRole="button"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: -6,
              backgroundColor: pressed ? colors.surfacePressed : 'transparent',
            })}
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant={back ? 'heading' : 'title'} numberOfLines={1} style={back ? { fontSize: 20 } : undefined}>
            {title}
          </Txt>
          {subtitle ? (
            <Txt variant="small" tone="muted" numberOfLines={1} style={{ marginTop: 1 }}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
        {right ? <View style={{ flexDirection: 'row', gap: space.sm }}>{right}</View> : null}
      </View>
    </View>
  ) : (
    <View style={{ height: insets.top }} />
  );

  const bottomPad = tabScreen ? space.xxxl : footer ? space.xl : insets.bottom + space.xxl;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: bottomPad }}
            showsVerticalScrollIndicator={false}
            {...scrollProps}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, paddingHorizontal: space.lg }}>{children}</View>
        )}
        {footer ? (
          <View
            style={{
              paddingHorizontal: space.lg,
              paddingTop: space.md,
              paddingBottom: Math.max(insets.bottom, space.lg),
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
              backgroundColor: colors.bg,
            }}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder = 'Search' }: { value: string; onChangeText: (v: string) => void; placeholder?: string }) {
  const { colors, name } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        backgroundColor: colors.surface,
        borderRadius: 14,
        paddingHorizontal: space.md,
        minHeight: 46,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: colors.border,
      }}
    >
      <Ionicons name="search" size={17} color={colors.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        keyboardAppearance={name}
        selectionColor={colors.gold}
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        style={{ flex: 1, color: colors.text, fontSize: 16, minHeight: 44 }}
      />
    </View>
  );
}
