// Local fonts for scripts that Oxanium / Chakra Petch do not cover. Only the active language's
// family is requested (unicode-range subsets: the browser downloads the glyph blocks it needs).
const LOADERS: Record<string, () => Promise<unknown>> = {
  ru: () => Promise.all([import('@fontsource/exo-2/700.css'), import('@fontsource/exo-2/800.css'), import('@fontsource/exo-2/500.css')]),
  vi: () => Promise.all([import('@fontsource/exo-2/700.css'), import('@fontsource/exo-2/800.css'), import('@fontsource/exo-2/500.css')]),
  ja: () => Promise.all([import('@fontsource/noto-sans-jp/500.css'), import('@fontsource/noto-sans-jp/800.css')]),
  ko: () => Promise.all([import('@fontsource/noto-sans-kr/500.css'), import('@fontsource/noto-sans-kr/800.css')]),
  zh: () => Promise.all([import('@fontsource/noto-sans-sc/500.css'), import('@fontsource/noto-sans-sc/800.css')]),
  ar: () => Promise.all([import('@fontsource/noto-sans-arabic/400.css'), import('@fontsource/noto-sans-arabic/800.css')]),
  hi: () => Promise.all([import('@fontsource/noto-sans-devanagari/400.css'), import('@fontsource/noto-sans-devanagari/800.css')]),
};
const FAMILY: Record<string, string> = { ru: 'Exo 2', vi: 'Exo 2', ja: 'Noto Sans JP', ko: 'Noto Sans KR', zh: 'Noto Sans SC', ar: 'Noto Sans Arabic', hi: 'Noto Sans Devanagari' };

export async function loadScriptFonts(lang: string, sample: string): Promise<void> {
  const l = LOADERS[lang];
  if (!l) return;
  await l();
  const fam = FAMILY[lang]!;
  await Promise.all([document.fonts.load(`800 32px "${fam}"`, sample), document.fonts.load(`500 16px "${fam}"`, sample)]).catch(() => {});
}
