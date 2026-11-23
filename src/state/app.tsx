import { Alert } from '../ui/dialog';
import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { openAppDb } from '../db/expoDb';
import type { Db } from '../db/types';
import { runAlertChecks } from '../domain/alerts';
import { BusinessError, setSetting, uuid } from '../domain/core';
import type { DateFormat } from '../domain/dates';
import { getPermission, setupNotificationHandler, showLocalNotification } from '../services/nativeNotifications';

export type Settings = {
  businessName: string;
  logoPath: string | null;
  currency: 'DZD';
  dateFormat: DateFormat;
  theme: 'dark' | 'light';
  defaultLowStock: number;
  notifyNative: boolean;
  notifyStock: boolean;
  notifyGoals: boolean;
  notifyUnpaid: boolean;
  unpaidAlertDays: number;
  appLock: boolean;
  onboarded: boolean;
  lastBackupAt: string | null;
};

const DEFAULTS: Settings = {
  businessName: 'My Watch Business',
  logoPath: null,
  currency: 'DZD',
  dateFormat: 'D MMM YYYY',
  theme: 'dark',
  defaultLowStock: 2,
  notifyNative: false,
  notifyStock: true,
  notifyGoals: true,
  notifyUnpaid: true,
  unpaidAlertDays: 3,
  appLock: false,
  onboarded: false,
  lastBackupAt: null,
};

const KEY_MAP: Record<keyof Settings, string> = {
  businessName: 'business_name',
  logoPath: 'logo_path',
  currency: 'currency',
  dateFormat: 'date_format',
  theme: 'theme',
  defaultLowStock: 'default_low_stock_threshold',
  notifyNative: 'notify_native',
  notifyStock: 'notify_stock',
  notifyGoals: 'notify_goals',
  notifyUnpaid: 'notify_unpaid',
  unpaidAlertDays: 'unpaid_alert_days',
  appLock: 'app_lock',
  onboarded: 'onboarded',
  lastBackupAt: 'last_backup_at',
};

async function loadSettings(db: Db): Promise<Settings> {
  const rows = await db.all<{ key: string; value: string | null }>('SELECT key, value FROM settings');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const [k, dbKey] of Object.entries(KEY_MAP) as [keyof Settings, string][]) {
    if (!map.has(dbKey)) continue;
    const raw = map.get(dbKey);
    const def = DEFAULTS[k];
    out[k] = typeof def === 'boolean' ? raw === '1' : typeof def === 'number' ? Number(raw) : raw;
  }
  return out as Settings;
}

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };

type MutateOptions = { success?: string; silentError?: boolean };

type AppContextValue = {
  db: Db;
  settings: Settings;
  version: number;
  refresh: () => void;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /**
   * Runs a change against the database, then refreshes every screen, runs
   * stock/goal/unpaid alert checks and shows feedback. Business errors are
   * shown to the user as a clear message. Returns undefined on failure.
   */
  mutate: <T>(fn: (db: Db) => Promise<T>, opts?: MutateOptions) => Promise<T | undefined>;
  toast: Toast | null;
  showToast: (message: string, tone?: Toast['tone']) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function errorMessage(e: unknown): string {
  if (e instanceof BusinessError) return e.message;
  const msg = e instanceof Error ? e.message : String(e);
  if (/CHECK constraint failed: .*quantity_remaining/i.test(msg)) return 'Not enough stock for this operation.';
  if (/UNIQUE constraint failed: products/i.test(msg)) return 'This brand and model already exist.';
  if (/FOREIGN KEY/i.test(msg)) return 'This record is linked to other records and cannot be changed this way.';
  return 'Something went wrong. Nothing was saved. Please try again.';
}

export function AppProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ComponentType<{ error: string | null }> }) {
  const [db, setDb] = useState<Db | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const showToast = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, tone });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const deliverAlerts = useCallback(async (theDb: Db) => {
    const events = await runAlertChecks(theDb);
    const s = settingsRef.current;
    if (!s.notifyNative || !events.length) return;
    if ((await getPermission()) !== 'granted') return;
    for (const e of events) {
      if ((e.kind === 'stock' && s.notifyStock) || (e.kind === 'goal' && s.notifyGoals) || (e.kind === 'unpaid' && s.notifyUnpaid)) {
        await showLocalNotification(e.title, e.message);
      }
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setupNotificationHandler();
        const theDb = await openAppDb();
        const s = await loadSettings(theDb);
        if (!alive) return;
        settingsRef.current = s;
        setSettings(s);
        setDb(theDb);
        deliverAlerts(theDb).then(() => alive && setVersion((v) => v + 1)).catch(() => {});
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [deliverAlerts]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      if (!db) return;
      for (const [k, v] of Object.entries(patch) as [keyof Settings, unknown][]) {
        await setSetting(db, KEY_MAP[k], typeof v === 'boolean' ? (v ? '1' : '0') : v == null ? null : String(v));
      }
      const next = await loadSettings(db);
      settingsRef.current = next;
      setSettings(next);
      setVersion((v) => v + 1);
    },
    [db],
  );

  const mutate = useCallback(
    async <T,>(fn: (db: Db) => Promise<T>, opts: MutateOptions = {}): Promise<T | undefined> => {
      if (!db) return undefined;
      try {
        const result = await fn(db);
        try {
          await deliverAlerts(db);
        } catch {
          // alerts must never block a saved transaction
        }
        setVersion((v) => v + 1);
        if (opts.success) showToast(opts.success);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        return result;
      } catch (e) {
        if (!(e instanceof BusinessError)) console.error(e);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        if (!opts.silentError) Alert.alert('Not saved', errorMessage(e));
        return undefined;
      }
    },
    [db, deliverAlerts, showToast],
  );

  const value = useMemo<AppContextValue | null>(
    () => (db ? { db, settings, version, refresh, updateSettings, mutate, toast, showToast } : null),
    [db, settings, version, refresh, updateSettings, mutate, toast, showToast],
  );

  const Fallback = fallback;
  if (!db) return <Fallback error={error} />;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/**
 * Loads data from the database and reloads automatically whenever anything
 * changes (after every purchase, sale, expense, edit...).
 */
export function useData<T>(loader: (db: Db) => Promise<T>, deps: unknown[] = []): { data: T | undefined; loading: boolean; error: string | null; reload: () => void } {
  const { db, version } = useApp();
  const [local, setLocal] = useState(0);
  // The key identifies which request a result belongs to; while the latest key has no result yet, we are loading.
  const key = JSON.stringify([version, local, deps]);
  const [state, setState] = useState<{ key: string | null; data: T | undefined; error: string | null }>({ key: null, data: undefined, error: null });
  useEffect(() => {
    let alive = true;
    loader(db)
      .then((data) => alive && setState({ key, data, error: null }))
      .catch((e) => {
        console.error(e);
        if (alive) setState((s) => ({ ...s, key, error: errorMessage(e) }));
      });
    return () => {
      alive = false;
    };
    // `loader` is intentionally excluded: it is a new function on every render; `deps` (inside key) controls reloading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, key]);
  return { data: state.data, loading: state.key !== key, error: state.error, reload: () => setLocal((n) => n + 1) };
}

/** A stable random id per form instance, used to make submissions idempotent. */
export function useRequestId(): string {
  const [id] = useState(() => uuid());
  return id;
}
