// Dynamic texts rendered from bitmap fonts generated once at load (after the local fonts are
// ready): no texture is created at an impact. FixedAmount lays glyphs with a fixed digit advance
// so a rolling counter never wobbles and its width stays fixed.
import { BitmapFont, BitmapText, Cache, Container, Sprite, type Texture } from 'pixi.js';

export const NUM_FONT = 'CC-Num';
export const TITLE_FONT = 'CC-Title';
const CHARS: (string | string[])[] = [[' ', '~'], '€£¥₹₩₺₽₫₱₴₦×→−   …·ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸÆŒàâäçéèêëîïôöùûüÿæœÑñÁÍÓÚáíóúÅåØøŁłŚśŹźŻżĆćĘęĄąŃńŞşĞğİıÕõÃãŐőŰű'];

let installed = false;
export function installFonts(): void {
  if (installed) return;
  installed = true;
  BitmapFont.install({
    name: NUM_FONT,
    style: { fontFamily: 'Oxanium', fontWeight: '800', fontSize: 96, fill: 0xffffff, stroke: { color: 0x0a1a44, width: 10, join: 'round' }, dropShadow: { color: 0x3feaff, blur: 8, distance: 0, alpha: 0.55, angle: 0 } },
    chars: CHARS, resolution: 1, padding: 12,
  });
  BitmapFont.install({
    name: TITLE_FONT,
    style: { fontFamily: 'Oxanium', fontWeight: '800', fontSize: 120, fill: 0xffffff, stroke: { color: 0x0b2a78, width: 14, join: 'round' }, dropShadow: { color: 0x3feaff, blur: 14, distance: 0, alpha: 0.7, angle: 0 }, letterSpacing: 4 },
    chars: CHARS, resolution: 1, padding: 16,
  });
}

export function numText(text: string, size: number): BitmapText {
  const t = new BitmapText({ text, style: { fontFamily: NUM_FONT, fontSize: size, align: 'center' } });
  t.anchor.set(0.5);
  return t;
}
export function titleText(text: string, size: number): BitmapText {
  const t = new BitmapText({ text, style: { fontFamily: TITLE_FONT, fontSize: size, align: 'center' } });
  t.anchor.set(0.5);
  return t;
}

interface CharInfo { texture?: Texture; xAdvance: number; xOffset: number; yOffset: number }
interface FontInfo { chars: Record<string, CharInfo>; baseMeasurementFontSize: number; lineHeight: number }
const fontOf = (name: string): FontInfo | null => (Cache.has(`${name}-bitmap`) ? (Cache.get(`${name}-bitmap`) as FontInfo) : null);

/** amount with a fixed digit advance, centred on its origin */
export class FixedAmount {
  readonly root = new Container({ label: 'amount' });
  private glyphs: Sprite[] = [];
  private digitAdv = 0;
  text = '';
  width = 0;

  constructor(private readonly size: number, private readonly fontName = NUM_FONT) {}

  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    const f = fontOf(this.fontName);
    if (!f) return;
    const k = this.size / f.baseMeasurementFontSize;
    if (!this.digitAdv) for (const d of '0123456789') { const ch = f.chars[d]; if (ch) this.digitAdv = Math.max(this.digitAdv, ch.xAdvance); }
    let i = 0, x = 0;
    for (const c of text) {
      const ch = f.chars[c];
      if (!ch || !ch.texture) { x += (f.chars[' ']?.xAdvance ?? this.digitAdv * 0.4); continue; }
      let s = this.glyphs[i];
      if (!s) { s = new Sprite(); this.glyphs.push(s); this.root.addChild(s); }
      s.texture = ch.texture;
      s.visible = true;
      const digit = c >= '0' && c <= '9';
      const off = digit ? (this.digitAdv - ch.xAdvance) / 2 : 0;
      s.position.set((x + off + ch.xOffset) * k, (ch.yOffset - f.lineHeight / 2) * k);
      s.scale.set(k);
      x += digit ? this.digitAdv : ch.xAdvance;
      i++;
    }
    for (let j = i; j < this.glyphs.length; j++) this.glyphs[j]!.visible = false;
    this.width = x * k;
    for (let j = 0; j < i; j++) this.glyphs[j]!.x -= this.width / 2;
  }
}
