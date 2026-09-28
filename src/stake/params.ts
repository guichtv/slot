/**
 * Paramètres d'URL Stake Engine.
 * - Session : sessionID, lang, device, rgs_url (jamais en dur), social.
 * - Replay : replay=true, game, version, mode, event, rgs_url (+ currency, amount, lang).
 * - Sans paramètres : mode local (fixtures).
 * - Session incomplète : erreur explicite, jamais de bascule silencieuse vers le local.
 */
export type LaunchMode =
  | { kind: 'local' }
  | { kind: 'stake'; sessionID: string; rgsUrl: string }
  | { kind: 'replay'; rgsUrl: string; game: string; version: string; mode: string; event: string; currency?: string; amount?: number }
  | { kind: 'invalid'; reason: string };

export interface LaunchParams {
  mode: LaunchMode;
  lang: string;
  device: 'desktop' | 'mobile' | 'unknown';
  social: boolean;
  dev: {
    skipIntro: boolean;
    seed: string | null;
    scenario: string | null;
    variant: string | null;
    qa: boolean;
    mockRgs: boolean;
  };
}

/** Hôte de boucle locale (faux RGS de développement) : servi en http. */
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:[/?#]|$)/i;

/**
 * rgs_url : `https://` ajouté si le schéma manque (Stake passe « rgs.example.com »), sauf pour une
 * adresse de boucle locale (« 127.0.0.1:5310 » = faux RGS, en http). Seuls http et https sont acceptés.
 */
export function normalizeRgsUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const hasProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(v);
  if (hasProto && !/^https?:\/\//i.test(v)) return null;
  const withProto = hasProto ? v : `${LOOPBACK.test(v) ? 'http' : 'https'}://${v}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname) return null;
    return u.origin + u.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function parseLaunchParams(search: string = typeof location !== 'undefined' ? location.search : ''): LaunchParams {
  const q = new URLSearchParams(search);
  const lang = (q.get('lang') ?? '').toLowerCase().split(/[-_]/)[0] || '';
  const deviceRaw = (q.get('device') ?? '').toLowerCase();
  const device = deviceRaw === 'mobile' ? 'mobile' : deviceRaw === 'desktop' ? 'desktop' : 'unknown';
  const social = q.get('social') === 'true';
  const rgsRaw = q.get('rgs_url');
  const dev = {
    skipIntro: q.has('skipIntro'),
    seed: q.get('seed'),
    scenario: q.get('scenario'),
    variant: q.get('variant'),
    qa: q.has('qa'),
    mockRgs: q.has('mockRgs'),
  };

  let mode: LaunchMode = { kind: 'local' };
  if (q.get('replay') === 'true') {
    const rgsUrl = rgsRaw ? normalizeRgsUrl(rgsRaw) : null;
    const game = q.get('game');
    const version = q.get('version');
    const m = q.get('mode');
    const event = q.get('event');
    if (!rgsUrl || !game || !version || !m || !event) {
      mode = { kind: 'invalid', reason: 'replay-params' };
    } else {
      const amount = q.get('amount');
      mode = {
        kind: 'replay', rgsUrl, game, version, mode: m, event,
        ...(q.get('currency') ? { currency: q.get('currency') as string } : {}),
        ...(amount && /^\d+$/.test(amount) ? { amount: Number(amount) } : {}),
      };
    }
  } else if (q.has('sessionID') || rgsRaw) {
    const sessionID = q.get('sessionID') ?? '';
    const rgsUrl = rgsRaw ? normalizeRgsUrl(rgsRaw) : null;
    mode = sessionID && rgsUrl ? { kind: 'stake', sessionID, rgsUrl } : { kind: 'invalid', reason: 'session-params' };
  }
  return { mode, lang, device, social, dev };
}
