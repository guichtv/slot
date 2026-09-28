import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RgsError } from '../src/stake/rgs';
import { errorActions, errorCode, KNOWN_ERROR_CODES, mapRgsError } from '../src/ui/dialogs';

const en = JSON.parse(readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
const fr = JSON.parse(readFileSync('src/i18n/locales/fr.json', 'utf8')) as Record<string, string>;

describe('RGS error mapping', () => {
  it('maps every required code to a translated message and a behavior', () => {
    const required = ['ERR_IS', 'ERR_IB', 'ERR_IPB', 'ERR_BR', 'ERR_OR', 'ERR_NR', 'ERR_TF', 'ERR_VAL', 'ERR_ATE', 'ERR_GLE', 'ERR_LOC', 'ERR_GEN', 'ERR_MAINTENANCE', 'TIMEOUT', 'NETWORK'];
    for (const code of required) {
      expect(KNOWN_ERROR_CODES).toContain(code);
      const s = mapRgsError({ code });
      expect(['retry', 'dismiss', 'reload']).toContain(s.action);
      expect(en[s.messageKey], s.messageKey).toBeTruthy();
      expect(fr[s.messageKey], s.messageKey).toBeTruthy();
      expect(en[s.titleKey], s.titleKey).toBeTruthy();
      expect(fr[s.titleKey], s.titleKey).toBeTruthy();
    }
  });

  it('chooses the right behavior per family', () => {
    expect(mapRgsError({ code: 'ERR_IS' })).toMatchObject({ kind: 'session', action: 'reload', dismissible: false });
    expect(mapRgsError({ code: 'ERR_ATE' })).toMatchObject({ kind: 'session', action: 'reload' });
    expect(mapRgsError({ code: 'ERR_IPB' })).toMatchObject({ kind: 'insufficient', action: 'dismiss', highlightBalance: true });
    expect(mapRgsError({ code: 'ERR_IB' })).toMatchObject({ kind: 'insufficient', messageKey: 'err.ERR_IPB', highlightBalance: true });
    expect(mapRgsError({ code: 'ERR_GEN' })).toMatchObject({ kind: 'error', action: 'retry', dismissible: true });
    expect(mapRgsError({ code: 'ERR_TF' }).action).toBe('retry');
    expect(mapRgsError({ code: 'ERR_BR' }).action).toBe('dismiss');
    expect(mapRgsError({ code: 'ERR_OR' }).action).toBe('dismiss');
    expect(mapRgsError({ code: 'ERR_GLE' }).action).toBe('dismiss');
    expect(mapRgsError({ code: 'ERR_MAINTENANCE' })).toMatchObject({ kind: 'maintenance', action: 'reload' });
    expect(mapRgsError({ code: 'NETWORK' })).toMatchObject({ kind: 'connection', action: 'retry' });
    expect(mapRgsError({ code: 'TIMEOUT' })).toMatchObject({ kind: 'connection', action: 'retry' });
  });

  it('reads RgsError instances, fetch failures and unknown values', () => {
    const e = new RgsError('ERR_TF', 500, true);
    expect(mapRgsError(e)).toMatchObject({ code: 'ERR_TF', uncertain: true });
    expect(mapRgsError(new RgsError('ERR_BR', 400, false)).uncertain).toBe(false);
    expect(errorCode(new TypeError('Failed to fetch'))).toBe('NETWORK');
    expect(errorCode(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe('TIMEOUT');
    expect(mapRgsError({ code: 'ERR_SOMETHING_NEW' }).code).toBe('ERR_GEN');
    expect(mapRgsError('boom').code).toBe('ERR_GEN');
    expect(mapRgsError(undefined).action).toBe('retry');
  });

  it('offers buttons in order: main action first, close when allowed', () => {
    expect(errorActions(mapRgsError({ code: 'ERR_GEN' }))).toEqual(['retry', 'dismiss']);
    expect(errorActions(mapRgsError({ code: 'ERR_IS' }))).toEqual(['reload']);
    expect(errorActions(mapRgsError({ code: 'ERR_BR' }))).toEqual(['dismiss']);
  });
});
