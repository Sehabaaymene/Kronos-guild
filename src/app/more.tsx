import { router, type Href } from 'expo-router';
import React from 'react';
import { unreadCount } from '../domain/alerts';
import { t, type TKey } from '../i18n';
import { useData } from '../state/app';
import { space } from '../theme';
import { Card, ListRow, SectionTitle, type IconName } from '../ui/primitives';
import { Screen } from '../ui/Screen';

const GROUPS: { title: string; items: { key: TKey; icon: IconName; href: Href; tone?: 'gold' }[] }[] = [
  {
    title: 'Record',
    items: [
      { key: 'nav.newPurchase', icon: 'add-circle-outline', href: '/purchase/new', tone: 'gold' },
      { key: 'nav.sell', icon: 'bag-handle-outline', href: '/sell', tone: 'gold' },
      { key: 'nav.newExpense', icon: 'receipt-outline', href: '/expense/new', tone: 'gold' },
    ],
  },
  {
    title: 'History',
    items: [
      { key: 'nav.purchases', icon: 'cube-outline', href: '/purchases' },
      { key: 'nav.sales', icon: 'bag-check-outline', href: '/sales' },
      { key: 'nav.expenses', icon: 'wallet-outline', href: '/expenses' },
      { key: 'nav.history', icon: 'time-outline', href: '/history' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { key: 'nav.reports', icon: 'bar-chart-outline', href: '/reports' },
      { key: 'nav.notifications', icon: 'notifications-outline', href: '/notifications' },
    ],
  },
  {
    title: 'App',
    items: [
      { key: 'nav.categories', icon: 'folder-outline', href: '/categories' },
      { key: 'nav.settings', icon: 'settings-outline', href: '/settings' },
    ],
  },
];

export default function More() {
  const { data: unread } = useData((db) => unreadCount(db));
  return (
    <Screen title={t('nav.more')} back>
      {GROUPS.map((g) => (
        <React.Fragment key={g.title}>
          <SectionTitle title={g.title} />
          <Card padded={false}>
            {g.items.map((it, i) => (
              <ListRow
                key={it.key}
                icon={it.icon}
                iconTone={it.tone ?? 'muted'}
                title={t(it.key)}
                right={it.key === 'nav.notifications' && unread ? String(unread) : undefined}
                rightTone="negative"
                onPress={() => {
                  router.back();
                  setTimeout(() => router.push(it.href), 50);
                }}
                last={i === g.items.length - 1}
              />
            ))}
          </Card>
        </React.Fragment>
      ))}
      <SectionTitle title="" />
      <Card padded={false} style={{ marginTop: space.sm }}>
        <ListRow icon="information-circle-outline" title="Watch Business · private & offline" subtitle="All data stays on this iPhone. Back it up regularly in Settings." />
      </Card>
    </Screen>
  );
}
