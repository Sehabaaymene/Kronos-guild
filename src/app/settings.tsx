import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { Alert } from '../ui/dialog';
import { formatDate, formatDateTime, type DateFormat } from '../domain/dates';
import { exportCSV } from '../services/exportService';
import { listSafetyBackups, pickBackup, restoreBackup, shareBackup, shareFileUri } from '../services/backupService';
import { getPermission, requestPermission, showLocalNotification, type PermissionState } from '../services/nativeNotifications';
import { errorMessage, useApp } from '../state/app';
import { space } from '../theme';
import { Field, ImageField, SwitchRow } from '../ui/forms';
import { Button, Card, Chips, KeyValue, ListRow, Notice, Row, SectionTitle, Txt } from '../ui/primitives';
import { Screen } from '../ui/Screen';

const DATE_FORMATS: DateFormat[] = ['D MMM YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

export default function Settings() {
  const { db, settings, updateSettings, refresh, showToast } = useApp();
  const [name, setName] = useState(settings.businessName);
  const [perm, setPerm] = useState<PermissionState>('undetermined');
  const [busy, setBusy] = useState<string | null>(null);
  const [safety, setSafety] = useState(listSafetyBackups);
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    getPermission().then(setPerm);
  }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Error', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const toggleNative = async (on: boolean) => {
    if (!on) return updateSettings({ notifyNative: false });
    let p = await getPermission();
    if (p !== 'granted') p = await requestPermission();
    setPerm(p);
    if (p === 'granted') {
      await updateSettings({ notifyNative: true });
      showLocalNotification('Notifications are on', 'You will be alerted about low stock, goals and unpaid balances.');
    } else if (p === 'denied') {
      Alert.alert(
        'Notifications are blocked',
        'iPhone blocked notifications for this app. Open iPhone Settings › Notifications › Watch Business and allow them. Alerts will still appear in the in-app Notification center.',
        [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
      );
    } else {
      Alert.alert('Notifications unavailable', 'Banner notifications are not available here. Alerts will still appear in the in-app Notification center.');
    }
  };

  const toggleLock = async (on: boolean) => {
    if (!on) return updateSettings({ appLock: false });
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHw || !enrolled) {
      Alert.alert('Face ID not set up', 'Set up Face ID or a passcode on your iPhone first.');
      return;
    }
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm to enable the lock' });
    if (res.success) await updateSettings({ appLock: true });
  };

  const doRestore = () =>
    run('restore', async () => {
      const picked = await pickBackup();
      if (!picked) return;
      const s = picked.stats;
      Alert.alert(
        'Replace ALL current data?',
        `Backup from ${formatDateTime(s.exportedAt, settings.dateFormat)}:\n${s.products} models · ${s.purchases} purchases · ${s.sales} sales · ${s.expenses} expenses · ${s.goals} goals · ${s.images} pictures.\n\nEverything currently in the app will be replaced. A safety copy of the current data is saved on this iPhone first.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace my data',
            style: 'destructive',
            onPress: () =>
              run('restore', async () => {
                await restoreBackup(db, picked.data);
                await updateSettings({});
                refresh();
                setSafety(listSafetyBackups());
                showToast('Backup restored');
              }),
          },
        ],
      );
    });

  const lastBackup = settings.lastBackupAt;
  const backupOld = !lastBackup || openedAt - new Date(lastBackup).getTime() > 7 * 86_400_000;

  return (
    <Screen title="Settings" back>
      <SectionTitle title="Business" />
      <Card>
        <Field label="Business name" value={name} onChangeText={setName} onBlur={() => name.trim() && name !== settings.businessName && updateSettings({ businessName: name.trim() })} />
        <ImageField label="Business logo" value={settings.logoPath} onChange={(logoPath) => updateSettings({ logoPath })} />
        <KeyValue label="Currency" value="Algerian Dinar (DZD) — no conversion" />
      </Card>

      <SectionTitle title="Display" />
      <Card>
        <Txt variant="caption" tone="muted" style={{ marginBottom: space.sm }}>
          Theme
        </Txt>
        <Chips
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
          value={settings.theme}
          onChange={(theme) => updateSettings({ theme })}
        />
        <Txt variant="caption" tone="muted" style={{ marginTop: space.lg, marginBottom: space.sm }}>
          Date format
        </Txt>
        <Chips options={DATE_FORMATS.map((f) => ({ value: f, label: formatDate('2026-10-25', f) }))} value={settings.dateFormat} onChange={(dateFormat) => updateSettings({ dateFormat })} />
      </Card>

      <SectionTitle title="Inventory" />
      <Card>
        <Txt variant="caption" tone="muted" style={{ marginBottom: space.sm }}>
          Default low-stock alert for new models
        </Txt>
        <Chips options={[0, 1, 2, 3, 5, 10].map((n) => ({ value: String(n), label: n === 0 ? 'Only when out' : `≤ ${n}` }))} value={String(settings.defaultLowStock)} onChange={(v) => updateSettings({ defaultLowStock: Number(v) })} />
        <Txt variant="caption" tone="faint" style={{ marginTop: space.sm }}>
          Each model can have its own threshold (Inventory › model › Edit).
        </Txt>
      </Card>

      <SectionTitle title="Notifications" />
      <Card padded={false}>
        <SwitchRow
          label="iPhone banner notifications"
          description={
            perm === 'denied'
              ? 'Blocked in iPhone Settings — tap to see how to allow them.'
              : 'Shown when stock runs low, goals hit milestones or customers still owe money.'
          }
          value={settings.notifyNative && perm === 'granted'}
          onChange={toggleNative}
        />
        <SwitchRow label="Stock alerts" value={settings.notifyStock} onChange={(v) => updateSettings({ notifyStock: v })} disabled={!settings.notifyNative} />
        <SwitchRow label="Goal milestones (50%, 75%, 100%, exceeded)" value={settings.notifyGoals} onChange={(v) => updateSettings({ notifyGoals: v })} disabled={!settings.notifyNative} />
        <SwitchRow
          label="Unpaid balance reminders"
          description={`Reminder when a sale is still unpaid ${settings.unpaidAlertDays} days later.`}
          value={settings.notifyUnpaid}
          onChange={(v) => updateSettings({ notifyUnpaid: v })}
          disabled={!settings.notifyNative}
        />
      </Card>
      <Notice
        message={
          Platform.OS === 'web'
            ? 'Banners work only when the app was added to your Home Screen (iPhone with iOS 16.4 or later). Alerts are created when you use or open the app — nothing can run while it is closed. All alerts are always kept in the in-app Notification center.'
            : 'This app works fully offline with no server, so alerts are created on your iPhone when you use the app (and when you open it). They cannot be detected while the app is closed. All alerts are always kept in the in-app Notification center.'
        }
      />

      {Platform.OS !== 'web' ? (
        <>
          <SectionTitle title="Security" />
          <Card padded={false}>
            <SwitchRow label="Lock with Face ID / passcode" description="Asks for Face ID when opening the app or returning after 1 minute." value={settings.appLock} onChange={toggleLock} />
          </Card>
        </>
      ) : null}

      <SectionTitle title="Backup & restore" />
      {backupOld ? (
        <Notice
          tone="warning"
          icon="warning-outline"
          message={lastBackup ? `Last backup: ${formatDateTime(lastBackup, settings.dateFormat)}. Make a new one — if this iPhone is lost, data that is not backed up is lost too.` : 'You have never made a backup. Your data exists only on this iPhone — make a backup and save it to Files / iCloud Drive.'}
        />
      ) : null}
      <Card>
        <Button title="Create full backup" icon="cloud-upload-outline" loading={busy === 'backup'} onPress={() => run('backup', async () => { await shareBackup(db); await updateSettings({}); })} />
        <Txt variant="caption" tone="muted" style={{ marginTop: space.sm, lineHeight: 16 }}>
          One file with everything: models, purchases, sales, payments, expenses, goals, history and all pictures. Save it to iCloud Drive (Files) or send it to yourself.
        </Txt>
        <Button title="Restore from a backup…" icon="cloud-download-outline" variant="secondary" loading={busy === 'restore'} onPress={doRestore} style={{ marginTop: space.lg }} />
        {lastBackup ? <KeyValue label="Last backup" value={formatDateTime(lastBackup, settings.dateFormat)} /> : null}
      </Card>
      {safety.length ? (
        <>
          <SectionTitle title="Automatic safety copies (made before each restore)" />
          <Card padded={false}>
            {safety.slice(0, 5).map((f, i) => (
              <ListRow
                key={f.uri}
                icon="shield-checkmark-outline"
                title={f.name.replace('WatchBusiness-backup-', '').replace('.json', '')}
                subtitle={`${Math.round(f.size / 1024)} KB · tap to save or share`}
                onPress={() => shareFileUri(f.uri, 'application/json', 'public.json')}
                last={i === Math.min(5, safety.length) - 1}
              />
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle title="Export data" />
      <Card>
        <Row gap={space.sm}>
          <Button title="Purchases" small variant="secondary" loading={busy === 'purchases'} onPress={() => run('purchases', () => exportCSV(db, 'purchases'))} style={{ flex: 1 }} />
          <Button title="Sales" small variant="secondary" loading={busy === 'sales'} onPress={() => run('sales', () => exportCSV(db, 'sales'))} style={{ flex: 1 }} />
        </Row>
        <Row gap={space.sm} style={{ marginTop: space.sm }}>
          <Button title="Expenses" small variant="secondary" loading={busy === 'expenses'} onPress={() => run('expenses', () => exportCSV(db, 'expenses'))} style={{ flex: 1 }} />
          <Button title="Inventory" small variant="secondary" loading={busy === 'inventory'} onPress={() => run('inventory', () => exportCSV(db, 'inventory'))} style={{ flex: 1 }} />
        </Row>
        <Txt variant="caption" tone="faint" style={{ marginTop: space.sm }}>
          Excel-compatible CSV files of your full history. PDF reports are in Reports.
        </Txt>
        <Button title="Open reports" variant="ghost" small icon="bar-chart-outline" onPress={() => router.push('/reports')} style={{ marginTop: space.sm }} />
      </Card>

      <SectionTitle title="How your data is protected" />
      <Card>
        <Txt variant="small" tone="muted" style={{ lineHeight: 20 }}>
          • Everything is stored only on this iPhone, in a private database no other app can read. Nothing is sent to the internet.{'\n'}
          • Every purchase, sale, edit and cancellation is saved atomically: it either fully succeeds or changes nothing.{'\n'}
          • If iCloud Backup is enabled on your iPhone (Settings › your name › iCloud › iCloud Backup), the app&apos;s data is included in your iPhone backup.{'\n'}
          • For extra safety, create a full backup here every week and keep it in iCloud Drive or on a computer.{'\n'}
          • Accidentally deleted or wrong data? Restore the most recent backup file. Every change is also recorded in Business history.
        </Txt>
      </Card>

      <View style={{ height: space.xl }} />
      <Txt variant="caption" tone="faint" style={{ textAlign: 'center' }}>
        Watch Business · version 1.0.0 · single user, no account needed
      </Txt>
    </Screen>
  );
}
