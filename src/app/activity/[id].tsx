import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { formatDateTime } from '../../domain/dates';
import { getAuditEntry } from '../../domain/finance';
import { formatMoney } from '../../domain/money';
import { useApp, useData } from '../../state/app';
import { space } from '../../theme';
import { Card, EmptyState, KeyValue, Loading, SectionTitle, Txt } from '../../ui/primitives';
import { Screen } from '../../ui/Screen';

const MONEY_KEYS = /(cost|price|amount|revenue|fee|profit|paid|total|value)/i;

function flatten(obj: unknown, prefix = ''): [string, string][] {
  if (obj == null) return [];
  if (typeof obj !== 'object') return [[prefix || 'value', String(obj)]];
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix} › ${k}` : k;
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach((item, i) => out.push(...flatten(item, `${key} ${i + 1}`)));
    else if (typeof v === 'object') out.push(...flatten(v, key));
    else if (typeof v === 'number' && MONEY_KEYS.test(k) && !/quantity|qty|threshold/i.test(k)) out.push([key, formatMoney(v)]);
    else out.push([key, String(v)]);
  }
  return out.filter(([k]) => !/(^|› )(id|request_id|requestId|created_at|updated_at|sale_id|product_id|purchase_batch_id|category_id|brand_id)$/.test(k));
}

const human = (k: string) => k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^\w/, (c) => c.toUpperCase());

export default function ActivityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useApp();
  const { data, loading } = useData((db) => getAuditEntry(db, id), [id]);
  if (loading && !data) return <Screen title="Activity" back><Loading /></Screen>;
  if (!data) return <Screen title="Activity" back><EmptyState title="Not found" /></Screen>;
  const before = data.old_values ? flatten(JSON.parse(data.old_values)) : [];
  const after = data.new_values ? flatten(JSON.parse(data.new_values)) : [];
  return (
    <Screen title={data.reference ?? 'Activity'} subtitle={formatDateTime(data.created_at, settings.dateFormat)} back>
      <Card>
        <Txt variant="bodyStrong">{data.summary}</Txt>
        <KeyValue label="Type" value={human(data.action.replace('.', ' · '))} />
        {data.status ? <KeyValue label="Status" value={data.status} /> : null}
        {data.amount != null ? <KeyValue label="Amount" value={formatMoney(data.amount)} /> : null}
        <KeyValue label="Recorded at" value={formatDateTime(data.created_at, settings.dateFormat)} />
      </Card>
      {before.length ? (
        <>
          <SectionTitle title="Before" />
          <Card>
            {before.map(([k, v], i) => (
              <KeyValue key={i} label={human(k)} value={v} />
            ))}
          </Card>
        </>
      ) : null}
      {after.length ? (
        <>
          <SectionTitle title={before.length ? 'After' : 'Details'} />
          <Card>
            {after.map(([k, v], i) => (
              <KeyValue key={i} label={human(k)} value={v} />
            ))}
          </Card>
        </>
      ) : null}
      <Txt variant="caption" tone="faint" style={{ marginTop: space.lg }}>
        History entries are permanent and cannot be edited.
      </Txt>
    </Screen>
  );
}
