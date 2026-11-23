import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/app';
import { radius, space, useTheme } from '../theme';
import { Txt } from './primitives';

export function ToastHost() {
  const { toast } = useApp();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(anim, { toValue: toast ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [toast, anim]);
  if (!toast) return null;
  const color = toast.tone === 'error' ? colors.negative : toast.tone === 'info' ? colors.gold : colors.positive;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + space.sm, left: space.lg, right: space.lg, alignItems: 'center' }}>
      <Animated.View
        style={{
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          backgroundColor: colors.surface2,
          borderColor: colors.borderStrong,
          borderWidth: 1,
          borderRadius: radius.pill,
          paddingVertical: 10,
          paddingHorizontal: space.lg,
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        <Ionicons name={toast.tone === 'error' ? 'alert-circle' : 'checkmark-circle'} size={18} color={color} />
        <Txt variant="small" style={{ fontWeight: '600' }}>
          {toast.message}
        </Txt>
      </Animated.View>
    </View>
  );
}
