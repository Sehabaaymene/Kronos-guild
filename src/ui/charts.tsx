import React, { useMemo, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { formatMoney } from '../domain/money';
import { radius, space, useTheme } from '../theme';
import { Txt } from './primitives';

export type ChartPoint = { label: string; value: number };

const H = 150;

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(Math.round(e.nativeEvent.layout.width))];
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Tooltip header: shows the touched point, or the total when nothing is touched. */
function ChartHeader({ title, active, totalLabel, format }: { title: string; active: ChartPoint | null; totalLabel: string; format: (v: number) => string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: space.md, minHeight: 40 }}>
      <View style={{ flex: 1 }}>
        <Txt variant="overline" tone="muted">
          {title}
        </Txt>
        <Txt variant="heading" numeric style={{ marginTop: 4 }}>
          {active ? format(active.value) : totalLabel}
        </Txt>
      </View>
      <Txt variant="caption" tone="faint">
        {active ? active.label : 'Touch the chart'}
      </Txt>
    </View>
  );
}

/**
 * Bar chart supporting negative values (e.g. net profit). Touch and slide to
 * read each bar.
 */
export function BarChart({
  title,
  data,
  format = (v) => formatMoney(v, { compact: true }),
  totalLabel,
  tone = 'gold',
  signed,
}: {
  title: string;
  data: ChartPoint[];
  format?: (v: number) => string;
  totalLabel: string;
  tone?: 'gold' | 'positive' | 'negative' | 'neutral';
  signed?: boolean;
}) {
  const { colors } = useTheme();
  const [w, onLayout] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const min = signed ? -niceMax(Math.max(0, ...data.map((d) => -d.value))) : 0;
  const span = max - min || 1;
  const zeroY = (max / span) * H;
  const n = Math.max(1, data.length);
  const slot = w / n;
  const barW = Math.max(2, Math.min(28, slot * 0.62));
  const base = { gold: colors.gold, positive: colors.positive, negative: colors.negative, neutral: colors.textMuted }[tone];
  const pick = (e: GestureResponderEvent) => {
    const i = Math.floor(e.nativeEvent.locationX / slot);
    setActive(Math.max(0, Math.min(data.length - 1, i)));
  };
  return (
    <View>
      <ChartHeader title={title} active={active != null ? data[active] : null} totalLabel={totalLabel} format={format} />
      <View
        onLayout={onLayout}
        style={{ height: H }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderRelease={() => setTimeout(() => setActive(null), 1800)}
      >
        {w > 0 ? (
          <Svg width={w} height={H}>
            <Line x1={0} x2={w} y1={zeroY} y2={zeroY} stroke={colors.border} strokeWidth={1} />
            {data.map((d, i) => {
              const hgt = (Math.abs(d.value) / span) * H;
              const x = i * slot + (slot - barW) / 2;
              const y = d.value >= 0 ? zeroY - hgt : zeroY;
              const fill = signed && d.value < 0 ? colors.negative : base;
              return (
                <Rect
                  key={i}
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(d.value !== 0 ? 2 : 0, hgt)}
                  rx={Math.min(4, barW / 2)}
                  fill={fill}
                  opacity={active == null || active === i ? 1 : 0.35}
                />
              );
            })}
          </Svg>
        ) : null}
      </View>
      <AxisLabels data={data} />
    </View>
  );
}

/** Smooth area chart for trends (revenue). */
export function AreaChart({
  title,
  data,
  format = (v) => formatMoney(v, { compact: true }),
  totalLabel,
}: {
  title: string;
  data: ChartPoint[];
  format?: (v: number) => string;
  totalLabel: string;
}) {
  const { colors } = useTheme();
  const [w, onLayout] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const pad = 6;
  const pts = useMemo(() => {
    if (!w || !data.length) return [];
    const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
    return data.map((d, i) => ({ x: pad + i * step + (data.length === 1 ? (w - pad * 2) / 2 : 0), y: H - 4 - (Math.max(0, d.value) / max) * (H - 12) }));
  }, [w, data, max]);
  const path = pts.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x},${p.y}`;
    const prev = pts[i - 1];
    const cx = (prev.x + p.x) / 2;
    return `${acc} C${cx},${prev.y} ${cx},${p.y} ${p.x},${p.y}`;
  }, '');
  const area = pts.length ? `${path} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z` : '';
  const pick = (e: GestureResponderEvent) => {
    if (!pts.length) return;
    const x = e.nativeEvent.locationX;
    let best = 0;
    pts.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(pts[best].x - x)) best = i;
    });
    setActive(best);
  };
  return (
    <View>
      <ChartHeader title={title} active={active != null ? data[active] : null} totalLabel={totalLabel} format={format} />
      <View
        onLayout={onLayout}
        style={{ height: H }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderRelease={() => setTimeout(() => setActive(null), 1800)}
      >
        {w > 0 && pts.length ? (
          <Svg width={w} height={H}>
            <Defs>
              <LinearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.gold} stopOpacity={0.35} />
                <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Line x1={0} x2={w} y1={H - 4} y2={H - 4} stroke={colors.border} strokeWidth={1} />
            <Path d={area} fill="url(#g)" />
            <Path d={path} stroke={colors.gold} strokeWidth={2.2} fill="none" />
            {active != null && pts[active] ? (
              <>
                <Line x1={pts[active].x} x2={pts[active].x} y1={0} y2={H} stroke={colors.borderStrong} strokeDasharray="3,3" />
                <Rect x={pts[active].x - 4} y={pts[active].y - 4} width={8} height={8} rx={4} fill={colors.gold} />
              </>
            ) : null}
          </Svg>
        ) : null}
      </View>
      <AxisLabels data={data} />
    </View>
  );
}

function AxisLabels({ data }: { data: ChartPoint[] }) {
  if (!data.length) return null;
  const picks = data.length <= 3 ? data.map((_, i) => i) : [0, Math.floor((data.length - 1) / 2), data.length - 1];
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
      {picks.map((i) => (
        <Txt key={i} variant="caption" tone="faint">
          {data[i].label}
        </Txt>
      ))}
    </View>
  );
}

/** Ranked horizontal bars (profit by brand, best sellers, stock by brand…). */
export function RankBars({
  rows,
  format = (v) => formatMoney(v),
  emptyText = 'No data for this period',
  max: maxRows = 6,
}: {
  rows: { key: string; label: string; value: number; sub?: string }[];
  format?: (v: number) => string;
  emptyText?: string;
  max?: number;
}) {
  const { colors } = useTheme();
  const shown = rows.slice(0, maxRows);
  const top = Math.max(1, ...shown.map((r) => Math.abs(r.value)));
  if (!shown.length)
    return (
      <Txt variant="small" tone="faint" style={{ paddingVertical: space.md }}>
        {emptyText}
      </Txt>
    );
  return (
    <View style={{ gap: space.md }}>
      {shown.map((r, i) => (
        <View key={r.key}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, gap: space.sm }}>
            <Txt variant="small" numberOfLines={1} style={{ flex: 1 }}>
              {r.label}
              {r.sub ? <Txt variant="caption" tone="faint">{`  ${r.sub}`}</Txt> : null}
            </Txt>
            <Txt variant="small" numeric tone={r.value < 0 ? 'negative' : 'default'} style={{ fontWeight: '600' }}>
              {format(r.value)}
            </Txt>
          </View>
          <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surface2, overflow: 'hidden' }}>
            <View
              style={{
                width: `${(Math.abs(r.value) / top) * 100}%`,
                height: 6,
                borderRadius: radius.pill,
                backgroundColor: r.value < 0 ? colors.negative : colors.chart[i % colors.chart.length],
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
