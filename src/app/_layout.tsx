import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../state/app';
import { ThemeContext, themes, space } from '../theme';
import { Button, Txt } from '../ui/primitives';
import { ToastHost } from '../ui/Toast';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Boot({ error }: { error: string | null }) {
  const c = themes.dark;
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      {error ? (
        <>
          <Ionicons name="alert-circle-outline" size={40} color={c.negative} />
          <Txt style={{ color: c.text, marginTop: 12, textAlign: 'center' }}>The database could not be opened.</Txt>
          <Txt style={{ color: c.textMuted, marginTop: 6, textAlign: 'center', fontSize: 13 }}>{error}</Txt>
        </>
      ) : (
        <ActivityIndicator color={c.gold} />
      )}
    </View>
  );
}

/** Optional Face ID / passcode lock (Settings › Security). */
function LockGate({ children }: { children: React.ReactNode }) {
  const { settings } = useApp();
  const [unlocked, setUnlocked] = useState(!settings.appLock);
  const lastBackground = useRef<number | null>(null);
  const colors = themes[settings.theme];
  const locked = settings.appLock && !unlocked;

  const authenticate = useCallback(async () => {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Watch Business', fallbackLabel: 'Use passcode' });
    if (res.success) setUnlocked(true);
  }, []);

  useEffect(() => {
    if (!settings.appLock) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') lastBackground.current = Date.now();
      if (s === 'active' && lastBackground.current && Date.now() - lastBackground.current > 60_000) setUnlocked(false);
    });
    return () => sub.remove();
  }, [settings.appLock]);

  useEffect(() => {
    // Showing the Face ID prompt is a side effect on the device, so it belongs in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is only set after the async prompt resolves
    if (locked) authenticate();
  }, [locked, authenticate]);

  if (!locked) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: space.lg }}>
      <Ionicons name="lock-closed-outline" size={40} color={colors.gold} />
      <Txt variant="heading">Watch Business is locked</Txt>
      <Button title="Unlock" icon="finger-print-outline" onPress={authenticate} full={false} />
    </View>
  );
}

function ThemedRoot() {
  const { settings } = useApp();
  const name = settings.theme;
  const colors = themes[name];
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
    SplashScreen.hideAsync().catch(() => {});
  }, [colors.bg]);
  return (
    <ThemeContext.Provider value={{ colors, name }}>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <LockGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'default',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="more" options={{ presentation: 'modal' }} />
        </Stack>
        <ToastHost />
      </LockGate>
    </ThemeContext.Provider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider fallback={Boot}>
        <ThemedRoot />
      </AppProvider>
    </SafeAreaProvider>
  );
}
