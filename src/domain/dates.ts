/**
 * Date helpers. Business dates are local calendar days stored as 'YYYY-MM-DD'.
 * The week starts on Sunday (Algerian working week).
 */
export type DateRange = { from: string | null; to: string | null }; // inclusive; null = unbounded

export const WEEK_STARTS_ON = 0; // 0 = Sunday

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidISODate(s: string | null | undefined): boolean {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  return toISODate(d) === s;
}

export function today(): string {
  return toISODate(new Date());
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function addDays(date: string, days: number): string {
  const d = parseISODate(date);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function startOfWeek(date: string): string {
  const d = parseISODate(date);
  const diff = (d.getDay() - WEEK_STARTS_ON + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toISODate(d);
}

export function startOfMonth(date: string): string {
  return date.slice(0, 7) + '-01';
}

export function endOfMonth(date: string): string {
  const d = parseISODate(startOfMonth(date));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return toISODate(d);
}

export function startOfYear(date: string): string {
  return date.slice(0, 4) + '-01-01';
}

export function endOfYear(date: string): string {
  return date.slice(0, 4) + '-12-31';
}

export type PeriodKey = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

export function rangeForPeriod(period: PeriodKey, ref: string = today(), custom?: DateRange): DateRange {
  switch (period) {
    case 'today':
      return { from: ref, to: ref };
    case 'week':
      return { from: startOfWeek(ref), to: addDays(startOfWeek(ref), 6) };
    case 'month':
      return { from: startOfMonth(ref), to: endOfMonth(ref) };
    case 'year':
      return { from: startOfYear(ref), to: endOfYear(ref) };
    case 'custom':
      return custom ?? { from: null, to: null };
    case 'all':
    default:
      return { from: null, to: null };
  }
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

export function inRange(date: string, range: DateRange): boolean {
  return (range.from == null || date >= range.from) && (range.to == null || date <= range.to);
}

export type Bucket = 'day' | 'week' | 'month' | 'year';

export function bucketKey(date: string, bucket: Bucket): string {
  switch (bucket) {
    case 'day':
      return date;
    case 'week':
      return startOfWeek(date);
    case 'month':
      return date.slice(0, 7);
    case 'year':
      return date.slice(0, 4);
  }
}

export function nextBucket(key: string, bucket: Bucket): string {
  switch (bucket) {
    case 'day':
      return addDays(key, 1);
    case 'week':
      return addDays(key, 7);
    case 'month': {
      const d = parseISODate(key + '-01');
      d.setMonth(d.getMonth() + 1);
      return toISODate(d).slice(0, 7);
    }
    case 'year':
      return String(Number(key) + 1);
  }
}

/** Choose a readable chart granularity for a range. */
export function bucketForRange(from: string, to: string): Bucket {
  const days = daysBetween(from, to);
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  if (days <= 3 * 366) return 'month';
  return 'year';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function bucketLabel(key: string, bucket: Bucket): string {
  switch (bucket) {
    case 'day':
    case 'week': {
      const d = parseISODate(key);
      return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    }
    case 'month':
      return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;
    case 'year':
      return key;
  }
}

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'D MMM YYYY';

export function formatDate(iso: string | null | undefined, fmt: DateFormat = 'D MMM YYYY'): string {
  if (!iso) return '—';
  const date = iso.slice(0, 10);
  const [y, m, d] = date.split('-');
  switch (fmt) {
    case 'DD/MM/YYYY':
      return `${d}/${m}/${y}`;
    case 'MM/DD/YYYY':
      return `${m}/${d}/${y}`;
    case 'YYYY-MM-DD':
      return date;
    default:
      return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
  }
}

export function formatDateTime(isoTimestamp: string, fmt: DateFormat = 'D MMM YYYY'): string {
  const d = new Date(isoTimestamp);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(toISODate(d), fmt)} · ${hh}:${mm}`;
}
