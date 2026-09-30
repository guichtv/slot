// Translations. `key@social` overrides `key` in social mode (Stake social casino: no betting
// vocabulary). Missing key -> English -> the key itself (never a raw placeholder word).
// Numbers always use Latin digits (-u-nu-latn) so the bitmap fonts can draw them.
import en from './locales/en.json';

type Dict = Record<string, string>;
const loaders = import.meta.glob<{ default: Dict }>('./locales/*.json');

export const ENGINE_LANGS = ['en', 'fr', 'de', 'es', 'pt', 'fi', 'pl', 'ru', 'tr', 'id', 'vi', 'ja', 'ko', 'zh', 'hi', 'ar'] as const;
export type Lang = (typeof ENGINE_LANGS)[number];
const RTL = new Set(['ar']);
const LOCALE: Record<string, string> = { en: 'en-US', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', pt: 'pt-BR', fi: 'fi-FI', pl: 'pl-PL', ru: 'ru-RU', tr: 'tr-TR', id: 'id-ID', vi: 'vi-VN', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', hi: 'hi-IN', ar: 'ar' };

export class I18n {
  lang: Lang = 'en';
  social = false;
  private dict: Dict = en as Dict;
  private fallback: Dict = en as Dict;
  private listeners = new Set<() => void>();

  static normalise(raw: string | null | undefined): Lang {
    const l = (raw ?? '').toLowerCase().replace('_', '-');
    const base = l.split('-')[0] ?? 'en';
    return (ENGINE_LANGS as readonly string[]).includes(base) ? (base as Lang) : 'en';
  }

  async load(lang: Lang): Promise<void> {
    this.lang = lang;
    if (lang === 'en') this.dict = en as Dict;
    else {
      const loader = loaders[`./locales/${lang}.json`];
      this.dict = loader ? (await loader()).default : (en as Dict);
    }
    document.documentElement.lang = lang;
    document.documentElement.dir = this.dir;
    for (const l of this.listeners) l();
  }

  get dir(): 'ltr' | 'rtl' { return RTL.has(this.lang) ? 'rtl' : 'ltr'; }
  /** Intl locale with Latin digits */
  get locale(): string { return `${LOCALE[this.lang] ?? 'en-US'}-u-nu-latn`; }

  has(key: string): boolean { return key in this.dict || key in this.fallback; }

  t(key: string, params?: Record<string, string | number>): string {
    let s = (this.social ? this.dict[`${key}@social`] ?? this.fallback[`${key}@social`] : undefined) ?? this.dict[key] ?? this.fallback[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
    return s;
  }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

export const i18n = new I18n();
export const t = (key: string, params?: Record<string, string | number>): string => i18n.t(key, params);
