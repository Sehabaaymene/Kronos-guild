import { router, type Href } from 'expo-router';
import React from 'react';
import { clearReadNotifications, listNotifications, markRead, type AppNotification } from '../domain/alerts';
import { formatDateTime } from '../domain/dates';
import { useApp, useData } from '../state/app';
import { space } from '../theme';
import { Button, Card, EmptyState, IconButton, ListRow, Loading, Notice, Row, type IconName } from '../ui/primitives';
import { Screen } from '../ui/Screen';

const ICONS: Record<string, { icon: IconName; tone: 'gold' | 'positive' | 'negative' | 'muted' | 'warning' }> = {
  low_stock: { icon: 'warning-outline', tone: 'warning' },
  out_of_stock: { icon: 'alert-circle-outline', tone: 'negative' },
  sale: { icon: 'bag-check-outline', tone: 'positive' },
  goal: { icon: 'flag-outline', tone: 'gold' },
  unpaid: { icon: 'time-outline', tone: 'negative' },
  inventory: { icon: 'swap-vertical', tone: 'muted' },
  system: { icon: 'information-circle-outline', tone: 'muted' },
};

function target(n: AppNotification): Href | null {
  if (!n.related_entity_id) return null;
  switch (n.related_entity_type) {
    case 'product':
      return { pathname: '/product/[id]', params: { id: n.related_entity_id } };
    case 'sale':
      return { pathname: '/sale/[id]', params: { id: n.related_entity_id } };
    case 'goal':
      return { pathname: '/goal/[id]', params: { id: n.related_entity_id } };
    case 'purchase':
      return { pathname: '/purchase/[id]', params: { id: n.related_entity_id } };
  }
  return null;
}

export default function Notifications() {
  const { db, mutate, settings, refresh } = useApp();
  const { data } = useData((db) => listNotifications(db));
  const unread = (data ?? []).filter((n) => !n.is_read).length;

  return (
    <Screen
      title="Notifications"
      subtitle={unread ? `${unread} unread` : 'All caught up'}
      back
      right={<IconButton icon="settings-outline" label="Notification settings" onPress={() => router.push('/settings')} />}
    >
      {!settings.notifyNative ? (
        <Notice message="iPhone banner notifications are off. Alerts are always kept here. You can enable banners in Settings › Notifications." />
      ) : null}
      {data && data.length ? (
        <Row gap={space.sm} style={{ marginBottom: space.md }}>
          <Button title="Mark all read" small variant="secondary" disabled={!unread} onPress={() => mutate((db) => markRead(db))} style={{ flex: 1 }} />
          <Button title="Clear read" small variant="secondary" onPress={() => mutate((db) => clearReadNotifications(db))} style={{ flex: 1 }} />
        </Row>
      ) : null}
      {!data ? (
        <Loading />
      ) : !data.length ? (
        <EmptyState icon="notifications-outline" title="No notifications" message="Low stock, out of stock, goal milestones, unpaid balances and sales will appear here." />
      ) : (
        <Card padded={false}>
          {data.map((n, i) => {
            const meta = ICONS[n.type] ?? ICONS.system;
            const href = target(n);
            return (
              <ListRow
                key={n.id}
                icon={meta.icon}
                iconTone={meta.tone}
                title={`${n.is_read ? '' : '● '}${n.title}`}
                subtitle={`${n.message}\n${formatDateTime(n.created_at, settings.dateFormat)}`}
                onPress={async () => {
                  if (!n.is_read) {
                    await markRead(db, n.id);
                    refresh();
                  }
                  if (href) router.push(href);
                }}
                chevron={!!href}
                last={i === data.length - 1}
              />
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
