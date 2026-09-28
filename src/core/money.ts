/**
 * Argent : entiers uniquement.
 * - Monnaie (API Stake et solde local) : base 10^6 (1 000 000 = 1 unité de devise).
 * - Montants des books : centièmes de la mise de base (100 = ×1). Seule couche de conversion : bookToMoney().
 */
export const MONEY_BASE = 1_000_000;
export const BOOK_BASE = 100;

/** Montant de book (×100) -> monnaie (base 1e6), arrondi au plus proche, sans flottant cumulé. */
export function bookToMoney(bookAmount: number, baseBet: number): number {
  const n = BigInt(Math.round(baseBet)) * BigInt(Math.round(bookAmount));
  const q = n / BigInt(BOOK_BASE);
  const r = n % BigInt(BOOK_BASE);
  return Number(r * 2n >= BigInt(BOOK_BASE) ? q + 1n : q);
}

/** Multiplicateur de book (×100) -> rapport lisible (ex. 2550 -> 25.5). Affichage uniquement. */
export function bookToX(bookAmount: number): number {
  return bookAmount / BOOK_BASE;
}

export function moneyFromUnits(units: number): number {
  return Math.round(units * MONEY_BASE);
}

const SOCIAL: Record<string, string> = { XGC: 'GC', XSC: 'SC', XEC: 'SC' };

export interface MoneyFormat {
  currency: string;
  locale: string;
}

let fmt: MoneyFormat = { currency: 'EUR', locale: 'fr-FR' };
const cache = new Map<string, Intl.NumberFormat>();

export function setMoneyFormat(f: Partial<MoneyFormat>): void {
  fmt = { ...fmt, ...f };
  cache.clear();
}

export function getMoneyFormat(): MoneyFormat {
  return fmt;
}

function nf(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = cache.get(key);
  if (!f) {
    f = make();
    cache.set(key, f);
  }
  return f;
}

function decimalsFor(amount: number): number {
  // un sous-centime ne s'affiche jamais « 0,00 »
  const abs = Math.abs(amount);
  if (abs === 0 || abs >= 10_000) return 2;
  let d = 2;
  while (d < 6 && Math.round(abs / 10 ** (6 - d)) === 0) d++;
  return d;
}

/** Formate un montant (base 1e6) dans la devise courante. */
export function formatMoney(amount: number, opts: { compact?: boolean } = {}): string {
  const { currency, locale } = fmt;
  const units = amount / MONEY_BASE;
  const d = decimalsFor(amount);
  const social = SOCIAL[currency];
  if (social) {
    const f = nf(`s${locale}${d}`, () => new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }));
    return `${f.format(units)} ${social}`;
  }
  const f = nf(`c${locale}${currency}${d}${opts.compact ? 'k' : ''}`, () => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d, currencyDisplay: 'narrowSymbol' });
    } catch {
      return new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
    }
  });
  const s = f.format(units);
  return f.resolvedOptions().style === 'currency' ? s : `${s} ${currency}`;
}

/** Multiplicateur lisible pour un badge (×2, ×25, ×1 024). Jamais pour ×0 / ×1 (règle 15). */
export function formatMult(x: number): string {
  const f = nf(`m${fmt.locale}`, () => new Intl.NumberFormat(fmt.locale, { maximumFractionDigits: 2 }));
  return `×${f.format(x)}`;
}
