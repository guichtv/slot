import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANGS } from '../src/i18n';

type Dict = Record<string, string>;
const load = (l: string): Dict => JSON.parse(readFileSync(`src/i18n/locales/${l}.json`, 'utf8')) as Dict;
const en = load('en');
const others = LANGS.filter((l) => l !== 'en');
const dicts = Object.fromEntries(others.map((l) => [l, load(l)])) as Record<string, Dict>;

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const count = (s: string, ch: string) => s.split(ch).length - 1;
const word = (w: string) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${w})(?![\\p{L}\\p{N}_])`, 'iu');

/** « démo », argent fictif (« fun »), « crédits » pour l'argent : interdits partout, équivalents locaux compris. */
const BANNED_ALL = word('démo|demo|fun|crédits?|credits?');
const BANNED: Partial<Record<string, RegExp>> = {
  de: word('spielgeld|kredite?'),
  es: word('créditos?|dinero ficticio|diversión'),
  pt: word('créditos?|dinheiro fictício|diversão'),
  ru: /демо|кредит|виртуальн/iu,
  pl: word('kredyty?|kredytów|wirtualn\\p{L}*'),
  tr: word('kredi|krediler|eğlence'),
  fi: /krediit/iu,
  da: word('kreditter|kredit'),
  id: word('kredit'),
  vi: /tín dụng|chơi thử|dùng thử/iu,
  ja: /デモ|クレジット|ファン(?:モード|プレイ)|お試し(?:プレイ|版|モード)|体験版/u,
  ko: /데모|크레딧|체험/u,
  zh: /演示|试玩|积分|信用|娱乐/u,
  ar: /تجريبي|ديمو|كريدت|كريديت|ائتمان|للمتعة/u,
  hi: /डेमो|क्रेडिट/u,
};
/** « Continuer / Continue » et équivalents : jamais comme libellé de bouton. */
const CONTINUE: Record<string, RegExp> = {
  en: word('continue'),
  fr: word('continuer'),
  de: word('weiter|fortfahren'),
  es: word('continuar'),
  pt: word('continuar'),
  ru: /продолж/iu,
  pl: word('kontynuuj|dalej'),
  tr: /devam/iu,
  fi: /jatka/iu,
  da: word('fortsæt'),
  id: /lanjut/iu,
  vi: /tiếp tục/iu,
  ja: /続け|続行/u,
  ko: /계속/u,
  zh: /继续/u,
  ar: /متابعة|استمرار|تابع/u,
  hi: /जारी/u,
};
const BUTTON_KEY = /(^|[._-])(go|btn|button|cta|ok|next|resume|continue|confirm|action)$/i;
const BUTTONS = ['loader.retry', 'common.close', 'common.cancel', 'dlg.retry', 'dlg.reload', 'history.replay'];
const isButton = (k: string) => BUTTON_KEY.test(k) || BUTTONS.includes(k);

/** noms propres et termes de jeu gardés tels quels (casse libre, flexion finale tolérée) */
const TERMS = ['BOOMTOOTH', 'BLAST & CARVE', 'SUNDOWN SHIFT', 'FLOODLIGHT SHIFT', 'Cornerstone', 'Buck', 'TNT', 'BUY BONUS', 'WILD', 'Scatter'];
/** écriture attendue dans les textes traduits */
const SCRIPT: Partial<Record<string, RegExp>> = {
  ar: /\p{Script=Arabic}/u,
  ru: /\p{Script=Cyrillic}/u,
  hi: /\p{Script=Devanagari}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  ko: /\p{Script=Hangul}/u,
  zh: /\p{Script=Han}/u,
};

describe('locales: same keys, params and rules as en.json', () => {
  it('has one file per Engine language', () => {
    expect(LANGS).toHaveLength(17);
    for (const l of LANGS) expect(existsSync(`src/i18n/locales/${l}.json`), l).toBe(true);
  });

  it.each(others)('%s: exactly the keys of en.json', (l) => {
    expect(Object.keys(dicts[l]!).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(others)('%s: same {params} and × signs, clean strings', (l) => {
    const d = dicts[l]!;
    for (const k of Object.keys(en)) {
      const s = d[k] ?? '';
      expect(params(s), `${l} ${k}`).toEqual(params(en[k]!));
      expect(count(s, '×'), `${l} ${k}: ×`).toBe(count(en[k]!, '×'));
      expect(s.trim(), `${l} ${k}: vide / espaces`).toBe(s);
      expect(s.length, `${l} ${k}: vide`).toBeGreaterThan(0);
      expect(/\p{Extended_Pictographic}/u.test(s), `${l} ${k}: emoji`).toBe(false);
      expect(/[​-‏‪-‮⁦-⁩﻿]/u.test(s), `${l} ${k}: caractère invisible`).toBe(false);
    }
  });

  it.each(LANGS)('%s: no banned words (demo, fun money, credits)', (l) => {
    const d = l === 'en' ? en : dicts[l]!;
    for (const [k, s] of Object.entries(d)) {
      expect(BANNED_ALL.test(s), `${l} ${k}: ${s}`).toBe(false);
      const local = BANNED[l];
      if (local) expect(local.test(s), `${l} ${k}: ${s}`).toBe(false);
    }
  });

  it.each(LANGS)('%s: no "Continue" button', (l) => {
    const d = l === 'en' ? en : dicts[l]!;
    for (const [k, s] of Object.entries(d)) {
      if (isButton(k)) expect(CONTINUE[l]!.test(s), `${l} ${k}: ${s}`).toBe(false);
    }
  });

  it('labels the resume button RESUME ROUND / REPRENDRE LA PARTIE', () => {
    expect(en['dlg.resume.go']).toBe('RESUME ROUND');
    expect(dicts.fr!['dlg.resume.go']).toBe('REPRENDRE LA PARTIE');
  });

  it.each(others)('%s: keeps brand and feature names', (l) => {
    const d = dicts[l]!;
    for (const [k, v] of Object.entries(en)) {
      for (const term of TERMS) {
        if (v.toLowerCase().includes(term.toLowerCase())) expect(d[k]!.toLowerCase(), `${l} ${k}: ${term}`).toContain(term.toLowerCase());
      }
      // paliers et noms de bonus : exactement l'anglais, dans toutes les langues (français compris)
      if (k.startsWith('tier.') || (k.startsWith('bonus.') && k.endsWith('.name'))) expect(d[k], `${l} ${k}`).toBe(v);
    }
  });

  it.each(others)('%s: is actually translated', (l) => {
    const d = dicts[l]!;
    const keys = Object.keys(en);
    const same = keys.filter((k) => d[k] === en[k]).length;
    expect(same / keys.length, `${l}: ${same} textes identiques à l'anglais`).toBeLessThan(0.3);
    const script = SCRIPT[l];
    if (script) {
      const inScript = keys.filter((k) => script.test(d[k]!)).length;
      expect(inScript / keys.length, `${l}: écriture`).toBeGreaterThan(0.75);
    }
  });
});

describe('local fonts cover every locale', () => {
  const theme = readFileSync('src/ui/theme.css', 'utf8');
  const intl = readFileSync('src/ui/fonts-intl.css', 'utf8');
  const faces = [...`${theme}\n${intl}`.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => {
    const body = m[1]!;
    return {
      family: body.match(/font-family:\s*'([^']+)'/)?.[1] ?? '',
      url: body.match(/url\('([^']+)'\)/)?.[1] ?? '',
      ranges: (body.match(/unicode-range:\s*([^;]+)/)?.[1] ?? 'U+0-10FFFF').split(',').map((r) => {
        const [a, b = a] = r.trim().replace(/^U\+/i, '').split('-');
        return [parseInt(a!, 16), parseInt(b!, 16)] as const;
      }),
    };
  });
  const covered = (cp: number, fam?: (f: string) => boolean) => faces.some((f) => (!fam || fam(f.family)) && f.ranges.some(([a, b]) => cp >= a && cp <= b));
  const chars = (d: Dict) => [...new Set([...Object.values(d).join('')])].filter((c) => /\S/u.test(c) && !/\p{Cf}/u.test(c));

  it('is imported by theme.css and only points to shipped files', () => {
    expect(theme).toMatch(/^@import '\.\/fonts-intl\.css';$/m);
    for (const f of faces) {
      expect(f.url, f.family).toMatch(/^\/fonts\/[\w.-]+\.woff2$/);
      expect(existsSync(`public${f.url}`), f.url).toBe(true);
    }
    for (const v of ['--font-display', '--font-ui', '--font-num']) {
      const decl = intl.match(new RegExp(`html:root\\s*{[^}]*${v}:\\s*([^;]+);`))?.[1] ?? '';
      expect(decl, v).toContain("'Baloo 2");
      expect(decl, v).toMatch(/'Baloo Bhaijaan 2'.*var\(--font-cjk\)/);
      expect(decl, v).not.toMatch(/system-ui|Arial|Helvetica|Roboto|Segoe/);
    }
  });

  it.each(LANGS)('%s: every character has a declared local font', (l) => {
    const d = l === 'en' ? en : dicts[l]!;
    const missing = chars(d).filter((c) => !covered(c.codePointAt(0)!));
    expect(missing, l).toEqual([]);
  });

  it.each([
    ['ja', 'Noto Sans JP'],
    ['ko', 'Noto Sans KR'],
    ['zh', 'Noto Sans SC'],
  ])('%s: CJK characters come from %s (Han unification)', (l, family) => {
    const latin = (f: string) => f === 'Lilita One' || f.startsWith('Baloo 2');
    const missing = chars(dicts[l]!).filter((c) => {
      const cp = c.codePointAt(0)!;
      return !covered(cp, latin) && !covered(cp, (f) => f === family);
    });
    expect(missing, `${l} : relancer node tools/fonts-intl.mjs`).toEqual([]);
  });
});
