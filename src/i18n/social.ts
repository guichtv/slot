/**
 * Mode social Stake (social=true) : remplacement du vocabulaire d'argent/pari dans tous les textes
 * visibles et accessibles. Expressions longues d'abord, pluriels et casse gérés.
 * Base de tests (Annexe C) — à revérifier dans la documentation Engine en vigueur.
 * Ne touche ni aux identifiants techniques, ni aux montants (appliqué aux chaînes traduites uniquement).
 */
const PAIRS: Array<[string, string]> = [
  ['place your bets', 'come and play'],
  ["be awarded to player's accounts", "appear in player's accounts"],
  ['bonus buy', 'feature'],
  ['buy bonus', 'get bonus'],
  ['win feature', 'play feature'],
  ['at the cost of', 'for'],
  ['cost of', 'can be played for'],
  ['total bet', 'total play'],
  ['paid out', 'won'],
  ['pays out', 'won'],
  ['pay out', 'win'],
  ['betting', 'playing'],
  ['bets', 'plays'],
  ['bet', 'play'],
  ['stake', 'play amount'],
  ['wagers', 'plays'],
  ['wager', 'play'],
  ['gamble', 'play'],
  ['purchases', 'plays'],
  ['purchase', 'play'],
  ['bought', 'instantly triggered'],
  ['buys', 'plays'],
  ['buy', 'play'],
  ['rebet', 'respin'],
  ['cash', 'coins'],
  ['money', 'coins'],
  ['credits', 'coins'],
  ['credit', 'coins'],
  ['funds', 'balance'],
  ['fund', 'balance'],
  ['deposit', 'get coins'],
  ['withdraw', 'redeem'],
  ['currency', 'token'],
  ['payer', 'winner'],
  ['paid', 'won'],
  ['pays', 'wins'],
  ['pay', 'win'],
];

const RULES = PAIRS.map(([from, to]) => ({
  re: new RegExp(`(?<![\\p{L}\\p{N}_])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]")}(?![\\p{L}\\p{N}_])`, 'giu'),
  to,
}));

function matchCase(src: string, repl: string): string {
  if (src === src.toUpperCase() && /\p{L}/u.test(src)) return repl.toUpperCase();
  if (src[0] && src[0] === src[0].toUpperCase()) return repl.charAt(0).toUpperCase() + repl.slice(1);
  return repl;
}

export function socialize(text: string): string {
  let out = text;
  for (const { re, to } of RULES) out = out.replace(re, (m) => matchCase(m, to));
  return out;
}

/** Vérifie qu'une chaîne ne contient plus aucun terme interdit en mode social. */
export function socialViolations(text: string): string[] {
  const found: string[] = [];
  for (const [from] of PAIRS) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'iu');
    if (re.test(text)) found.push(from);
  }
  return found;
}
