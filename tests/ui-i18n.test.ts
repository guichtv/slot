import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { setLang, t } from '../src/i18n';
import { socialViolations } from '../src/i18n/social';

const en = JSON.parse(readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
const fr = JSON.parse(readFileSync('src/i18n/locales/fr.json', 'utf8')) as Record<string, string>;

/** clés des menus, de l'achat, de l'Ante et des dialogues */
const PREFIXES = ['common.', 'menu.', 'rules.', 'sym.', 'feature.', 'mode.', 'settings.', 'history.', 'buy.', 'ante.', 'dlg.', 'err.'];
const mine = Object.keys(en).filter((k) => PREFIXES.some((p) => k.startsWith(p)));

describe('menu / buy / ante / dialog strings', () => {
  afterAll(() => setLang('en', false));

  it('exist in English and French', () => {
    expect(mine.length).toBeGreaterThan(80);
    for (const k of mine) expect(fr[k], k).toBeTruthy();
  });

  it('never use banned words, emojis or placeholders', () => {
    const banned = /\b(demo|démo|test|tests|fun|credits?|crédits?|lorem|todo|tbd)\b/i;
    const emoji = /\p{Extended_Pictographic}/u;
    for (const k of mine) {
      for (const s of [en[k] as string, fr[k] as string]) {
        expect(banned.test(s), `${k}: ${s}`).toBe(false);
        expect(emoji.test(s), `${k}: ${s}`).toBe(false);
      }
    }
  });

  it('keep the same {params} in both languages', () => {
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of mine) expect(params(fr[k] as string), k).toEqual(params(en[k] as string));
  });

  it('read naturally in social mode (no bet / buy / cash words left)', () => {
    setLang('en', true);
    for (const k of mine) {
      const s = t(k, { n: 3, x: 100, name: 'SUNDOWN SHIFT', amount: '1.00', cost: 1.5, factor: 3, ways: '3,125', spins: 5, id: 'r1' });
      expect(socialViolations(s), `${k}: ${s}`).toEqual([]);
    }
    expect(t('rules.malfunction')).toBe('Malfunction voids all wins and plays.');
    expect(t('buy.confirm.title', { name: 'TNT SPIN' })).toBe('PLAY TNT SPIN?');
    expect(t('ante.label')).toBe('ANTE PLAY');
    setLang('en', false);
    expect(t('rules.malfunction')).toBe('Malfunction voids all pays and plays.');
  });

  it('carries the required malfunction sentence in French', () => {
    expect(fr['rules.malfunction']).toBe('Un dysfonctionnement annule tous les paiements et toutes les parties.');
  });
});
