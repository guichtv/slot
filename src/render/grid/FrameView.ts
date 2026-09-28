import { Container, Rectangle, Sprite, Texture } from 'pixi.js';

/**
 * Cadre de grille recomposé en pièces : coins et platines centrales à l'échelle uniforme,
 * planches étirées dans leur longueur. L'épaisseur du bord devient un réglage de mise en page
 * (le cadre ImageGen fait 0,8 case d'épaisseur à l'échelle naturelle, trop pour laisser la place au HUD).
 */
export const FRAME_BORDER = 0.6; // épaisseur du bord, en cases

// découpe mesurée sur ui.frame (px de texture) : fin du coin, platine centrale, début du coin opposé
const CUT_X = [169, 497, 622, 957] as const;
const CUT_Y = [177, 492, 626, 926] as const;

type Piece = { s: Sprite; kind: 'corner' | 'bracketH' | 'bracketV' | 'plankH' | 'plankV'; ix: number; iy: number };

export class FrameView {
  readonly view = new Container();
  private pieces: Piece[] = [];
  private tw: number;
  private th: number;

  constructor(
    private texture: Texture,
    private insets: [number, number, number, number],
  ) {
    this.view.label = 'frame';
    this.tw = texture.width;
    this.th = texture.height;
    const xs = [0, CUT_X[0], CUT_X[1], CUT_X[2], CUT_X[3], this.tw];
    const ys = [0, CUT_Y[0], CUT_Y[1], CUT_Y[2], CUT_Y[3], this.th];
    const f = texture.frame;
    const add = (ix: number, iy: number, kind: Piece['kind']) => {
      const x0 = xs[ix] as number;
      const x1 = xs[ix + 1] as number;
      const y0 = ys[iy] as number;
      const y1 = ys[iy + 1] as number;
      const sub = new Texture({ source: texture.source, frame: new Rectangle(f.x + x0, f.y + y0, x1 - x0, y1 - y0) });
      const s = new Sprite(sub);
      this.view.addChild(s);
      this.pieces.push({ s, kind, ix, iy });
    };
    // bandes horizontales (haut iy=0, bas iy=4) et verticales (gauche ix=0, droite ix=4)
    for (const iy of [0, 4]) {
      add(0, iy, 'corner');
      add(1, iy, 'plankH');
      add(2, iy, 'bracketH');
      add(3, iy, 'plankH');
      add(4, iy, 'corner');
    }
    for (const ix of [0, 4]) {
      add(ix, 1, 'plankV');
      add(ix, 2, 'bracketV');
      add(ix, 3, 'plankV');
    }
  }

  /**
   * Cale l'ouverture intérieure sur (x, y, w, h) avec un bord de `border` px à l'écran.
   * Les pièces se recouvrent d'un pixel pour ne laisser aucune couture.
   */
  layout(w: number, h: number, border: number, x: number, y: number): void {
    const [il, it, ir, ib] = this.insets;
    const k = border / ((il + it + ir + ib) / 4);
    const ox = x - il * k;
    const oy = y - it * k;
    const W = w + (il + ir) * k;
    const H = h + (it + ib) * k;
    const cL = CUT_X[0] * k;
    const cR = (this.tw - CUT_X[3]) * k;
    const cT = CUT_Y[0] * k;
    const cB = (this.th - CUT_Y[3]) * k;
    const bw = (CUT_X[2] - CUT_X[1]) * k;
    const bh = (CUT_Y[2] - CUT_Y[1]) * k;
    const midX = ox + W / 2;
    const midY = oy + H / 2;
    // bornes écran des 5 tranches, par axe
    const X = [ox, ox + cL, midX - bw / 2, midX + bw / 2, ox + W - cR, ox + W];
    const Y = [oy, oy + cT, midY - bh / 2, midY + bh / 2, oy + H - cB, oy + H];
    const seam = 1;
    for (const p of this.pieces) {
      const x0 = X[p.ix] as number;
      const x1 = X[p.ix + 1] as number;
      const y0 = Y[p.iy] as number;
      const y1 = Y[p.iy + 1] as number;
      const stretchX = p.kind === 'plankH';
      const stretchY = p.kind === 'plankV';
      p.s.position.set(x0 - (stretchX ? seam : 0), y0 - (stretchY ? seam : 0));
      p.s.width = x1 - x0 + (stretchX ? 2 * seam : 0);
      p.s.height = y1 - y0 + (stretchY ? 2 * seam : 0);
    }
  }
}
