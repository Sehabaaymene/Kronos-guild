/**
 * Money helpers. All amounts are stored and calculated as INTEGER centimes
 * (1 DZD = 100 centimes). Never use floating point for business totals.
 */
export type Money = number; // integer centimes

export const CENTS = 100;

/** Convert whole/decimal dinars (from code, e.g. tests) to centimes. */
export function dzd(amount: number): Money {
  return Math.round(amount * CENTS);
}

/** Parse user input like "12 000", "12,000", "12000.50" into centimes. Returns null if invalid. */
export function parseMoney(input: string | null | undefined): Money | null {
  if (input == null) return null;
  let s = String(input).trim().replace(/\s| | /g, '').replace(/DZD|DA/gi, '');
  if (s === '') return null;
  // "12,000" or "12.000" used as thousands separators → strip when followed by exactly 3 digits groups
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * CENTS + Number((frac + '00').slice(0, 2));
}

/** Format centimes as "12,000 DZD" (decimals shown only when non-zero). */
export function formatMoney(value: Money, opts: { sign?: boolean; currency?: boolean; compact?: boolean } = {}): string {
  const { sign = false, currency = true, compact = false } = opts;
  const negative = value < 0;
  const abs = Math.abs(Math.round(value));
  let body: string;
  if (compact && abs >= 1_000_000 * CENTS) {
    body = trimZeros((abs / CENTS / 1_000_000).toFixed(1)) + 'M';
  } else if (compact && abs >= 100_000 * CENTS) {
    body = trimZeros((abs / CENTS / 1000).toFixed(0)) + 'K';
  } else {
    const whole = Math.floor(abs / CENTS);
    const frac = abs % CENTS;
    body = groupThousands(whole) + (frac ? '.' + String(frac).padStart(2, '0') : '');
  }
  const prefix = negative ? '−' : sign && value > 0 ? '+' : '';
  return prefix + body + (currency ? ' DZD' : '');
}

/** Value to prefill a money input with (no separators, no currency). */
export function moneyToInput(value: Money | null | undefined): string {
  if (value == null) return '';
  const whole = Math.floor(Math.abs(value) / CENTS);
  const frac = Math.abs(value) % CENTS;
  return (value < 0 ? '-' : '') + whole + (frac ? '.' + String(frac).padStart(2, '0') : '');
}

export function groupThousands(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function trimZeros(s: string): string {
  return s.replace(/\.0+$/, '');
}

/** Integer share of an amount: round(total * part / whole), safe for whole = 0. */
export function share(total: Money, part: number, whole: number): Money {
  if (whole <= 0) return 0;
  return Math.round((total * part) / whole);
}
