import { socialize } from './social';

/**
 * i18n : 17 langues Engine (ar da de en es fi fr hi id ja ko pl pt ru tr vi zh), repli anglais.
 * - lang pilote tout, y compris les bulles de la mascotte.
 * - social=true : anglais imposé (guideline reçue, à revérifier) + dictionnaire social.
 * - arabe : dir="rtl" sur l'interface HTML ; la scène (canvas) garde sa géométrie.
 */
export const LANGS = ['ar', 'da', 'de', 'en', 'es', 'fi', 'fr', 'hi', 'id', 'ja', 'ko', 'pl', 'pt', 'ru', 'tr', 'vi', 'zh'] as const;
export type Lang = (typeof LANGS)[number];

type Dict = Record<string, string>;
const modules = import.meta.glob('./locales/*.json', { eager: true, import: 'default' }) as Record<string, Dict>;
const dicts: Partial<Record<Lang, Dict>> = {};
for (const [p, d] of Object.entries(modules)) {
  const code = p.match(/([a-z]{2})\.json$/)?.[1] as Lang | undefined;
  if (code) dicts[code] = d;
}

const INTL_LOCALE: Record<Lang, string> = {
  ar: 'ar', da: 'da-DK', de: 'de-DE', en: 'en-US', es: 'es-ES', fi: 'fi-FI', fr: 'fr-FR', hi: 'hi-IN', id: 'id-ID',
  ja: 'ja-JP', ko: 'ko-KR', pl: 'pl-PL', pt: 'pt-BR', ru: 'ru-RU', tr: 'tr-TR', vi: 'vi-VN', zh: 'zh-CN',
};

let current: Lang = 'en';
let social = false;
const listeners: Array<() => void> = [];

export function resolveLang(raw: string | null | undefined, fallback: Lang = 'en'): Lang {
  const code = (raw ?? '').toLowerCase().split(/[-_]/)[0] as Lang;
  return (LANGS as readonly string[]).includes(code) ? code : fallback;
}

export function setLang(lang: Lang, isSocial = social): void {
  social = isSocial;
  current = social ? 'en' : lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = current;
    document.documentElement.dir = current === 'ar' ? 'rtl' : 'ltr';
  }
  for (const l of listeners) l();
}

export function getLang(): Lang {
  return current;
}

export function isSocial(): boolean {
  return social;
}

export function intlLocale(): string {
  return INTL_LOCALE[current];
}

export function onLangChange(fn: () => void): void {
  listeners.push(fn);
}

export function hasKey(key: string): boolean {
  return key in (dicts.en ?? {});
}

/** Traduction avec interpolation {name}. Clé manquante : repli anglais, puis la clé (visible en dev). */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = dicts[current]?.[key] ?? dicts.en?.[key];
  if (s === undefined) {
    if (__DEV_TOOLS__) console.warn(`i18n: clé manquante ${key}`);
    s = key;
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
  return social ? socialize(s) : s;
}

export function allKeys(lang: Lang): string[] {
  return Object.keys(dicts[lang] ?? {});
}
