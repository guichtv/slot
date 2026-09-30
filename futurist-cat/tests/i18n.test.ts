import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(__dirname, '../src/i18n/locales');
const en = JSON.parse(readFileSync(resolve(dir, 'en.json'), 'utf8')) as Record<string, string>;
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
// forbidden everywhere and in every language (visible words). `\b` only knows ASCII letters in
// JavaScript: Latin-script words get Unicode-aware boundaries, other scripts are matched as is.
const W = (words: string) => new RegExp(`(?<![\\p{L}\\p{N}])(${words})(?![\\p{L}\\p{N}])`, 'iu');
const FORBIDDEN: Record<string, RegExp> = {
  demo: W('d[ée]mo|demostraci[óo]n|demonstra[çc][ãa]o|d[ée]monstration'),
  test: W('test|tests|prueba|teste|testi|testu|deneme|uji coba|thử nghiệm|dùng thử'),
  fun: W('fun|spa(ß|ss)|divers[ãa]o|diversi[óo]n'),
  credit: W('cr[ée]dits?|cr[ée]ditos?|kredit|kredits|kredyt\\p{L}*|krediitti\\p{L}*|kredi|tín dụng'),
  provisional: W('provisoire|provisional|vorläufig'),
  placeholder: /placeholder|lorem/i,
  nonLatin: /демо|тест|кредит|デモ|テスト|クレジット|데모|테스트|크레딧|演示|测试|试玩|积分|信用|डेमो|टेस्ट|परीक्षण|क्रेडिट|تجريبي|اختبار|ائتمان/u,
};
const ENGINE = ['ar', 'de', 'en', 'es', 'fi', 'fr', 'hi', 'id', 'ja', 'ko', 'pl', 'pt', 'ru', 'tr', 'vi', 'zh'];

describe('forbidden-word patterns', () => {
  it('catch non-Latin scripts and inflected Latin words, not innocent words', () => {
    const hit = (s: string) => Object.values(FORBIDDEN).some((re) => re.test(s));
    for (const bad of ['Mode démo', 'демо-режим', 'デモ版', '演示模式', 'кредиты', 'تجريبي', 'Kredyty', 'Test', 'TEST']) expect(hit(bad), bad).toBe(true);
    for (const ok of ['détester', 'Contest', 'function', 'Spaßig', 'ПРОВЕРКА']) expect(hit(ok), ok).toBe(false);
  });
});

describe('locales', () => {
  it('has every Engine language (16 codes)', () => {
    expect(files.map((f) => f.replace('.json', '')).sort()).toEqual(ENGINE);
  });
  for (const f of files) {
    const d = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as Record<string, string>;
    it(`${f}: every English key, same placeholders`, () => {
      for (const k of Object.keys(en)) {
        expect(d[k], `${f} ${k}`).toBeTypeOf('string');
        expect(placeholders(d[k]!), `${f} ${k}`).toBe(placeholders(en[k]!));
      }
    });
    it(`${f}: no forbidden word`, () => {
      for (const [k, v] of Object.entries(d)) for (const [w, re] of Object.entries(FORBIDDEN)) expect(re.test(v), `${f} ${k} contient "${w}" : ${v}`).toBe(false);
    });
    it(`${f}: malfunction sentence present`, () => { expect(d['rules.malfunction']?.length).toBeGreaterThan(10); });
  }
});
