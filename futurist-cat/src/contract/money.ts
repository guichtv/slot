// The ONE conversion layer. API (RGS) amounts: integers in micro-units (10^6 = 1 unit).
// Book amounts: integers in hundredths of the BASE bet (100 = x1). Display: Intl, never "0.00"
// for a sub-cent amount, never a "$" in front of SC/GC (social coins).
export const API_UNIT = 1_000_000;
export const BOOK_UNIT = 100;

/** book hundredths x base bet (micros) -> micros, exact (BigInt when the product is large) */
export function bookToMicros(hundredths: number, baseBetMicros: number): number {
  const p = hundredths * baseBetMicros;
  if (Number.isSafeInteger(p)) return Math.round(p / BOOK_UNIT);
  return Number((BigInt(hundredths) * BigInt(baseBetMicros)) / BigInt(BOOK_UNIT));
}
/** cost of one play for a mode (micros); costMultiplier applied here and only here */
export function costMicros(baseBetMicros: number, costMultiplier: number): number {
  return Math.round(baseBetMicros * costMultiplier);
}
export const unitsToMicros = (u: number): number => Math.round(u * API_UNIT);
export const microsToUnits = (m: number): number => m / API_UNIT;

const SOCIAL = new Set(['SC', 'GC']);
const CRYPTO_DECIMALS: Record<string, number> = { BTC: 6, ETH: 6, LTC: 6, DOGE: 4, XRP: 4, TRX: 4, SOL: 6, BNB: 6, USDT: 2, USDC: 2 };

export interface MoneyFormat { currency: string; locale: string }

function fractionDigits(currency: string): number {
  if (SOCIAL.has(currency)) return 2;
  if (currency in CRYPTO_DECIMALS) return CRYPTO_DECIMALS[currency]!;
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2; } catch { return 2; }
}

/** digits needed so that a non-zero amount never shows as zero (max 6, the API precision) */
export function displayDigits(micros: number, currency: string): number {
  const base = fractionDigits(currency);
  const units = Math.abs(micros) / API_UNIT;
  if (micros === 0 || units >= 1) return base;
  let d = base;
  while (d < 6 && Math.round(units * 10 ** d) === 0) d++;
  // keep the exact value when it has more digits than the currency default (e.g. 0.005)
  while (d < 6 && Math.abs(Math.round(units * 10 ** d) / 10 ** d - units) > 1e-12) d++;
  return d;
}

export function formatMoney(micros: number, f: MoneyFormat, opts: { digits?: number } = {}): string {
  const units = micros / API_UNIT;
  const digits = opts.digits ?? displayDigits(micros, f.currency);
  const num = new Intl.NumberFormat(f.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(units);
  if (SOCIAL.has(f.currency)) return `${num} ${f.currency}`;
  try {
    const parts = new Intl.NumberFormat(f.locale, { style: 'currency', currency: f.currency, minimumFractionDigits: digits, maximumFractionDigits: digits, currencyDisplay: 'narrowSymbol' }).format(units);
    return parts;
  } catch {
    return `${num} ${f.currency}`;
  }
}

export function formatMult(x: number, locale: string): string {
  return `×${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(x)}`;
}
