import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(__dirname, '../src/i18n/locales');
const en = JSON.parse(readFileSync(resolve(dir, 'en.json'), 'utf8')) as Record<string, string>;
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
// forbidden everywhere and in every language (visible words)
const FORBIDDEN: Record<string, RegExp> = {
  demo: /\b(d[ée]mo|demostraci[óo]n|demonstra[çc][ãa]o|демо|デモ|데모|演示|डेमो|تجريبي)\b/iu,
  test: /\b(test|prueba|teste|тест|テスト|테스트|测试|परीक्षण|اختبار)\b/iu,
  fun: /\bfun\b/i,
  credit: /\b(cr[ée]dits?|kredit|кредит|クレジット|크레딧|积分|क्रेडिट|رصيد مجاني)\b/iu,
  provisional: /\b(provisoire|provisional|vorläufig)\b/iu,
  placeholder: /placeholder|lorem/i,
};

describe('locales', () => {
  it('has every Engine language (16 codes) - checked when the translations land', () => {
    expect(files).toContain('en.json');
    expect(files).toContain('fr.json');
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
