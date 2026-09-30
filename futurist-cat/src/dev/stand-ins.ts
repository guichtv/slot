// DEV/QA BUILDS ONLY (never in the public build: imported behind __DEV_TOOLS__).
// Flat stand-ins drawn in code for every illustration that ImageGen has not delivered yet, so the
// motion, the layout and the flows can be built and checked. The public build refuses to build
// while a required illustration is missing.
import { Graphics, Text, Container, FillGradient, type Renderer, type Texture } from 'pixi.js';
import { PLAN } from '../render/assets';
import { mulberry32 } from '../core/rng';

const C = { white: 0xeef3f9, shade: 0xc9d3e0, blue: 0x2f6fe0, deep: 0x1b3f8f, cyan: 0x3feaff, glow: 0x9af6ff, visor: 0x0a0d14, indigo: 0x0b1230, indigo2: 0x141d45, teal: 0x0f3b4a, magenta: 0xff3fa4, amber: 0xffb547 };
const LOW_COL: Record<string, number> = { 'sym.L1': 0x3fffb2, 'sym.L2': 0x3fe0ff, 'sym.L3': 0x9b7bff, 'sym.L4': 0xff5fd1 };
const FONT = 'Oxanium, Chakra Petch, sans-serif';

function label(txt: string, size: number, color = C.white, weight: '600' | '700' | '800' = '800'): Text {
  const t = new Text({ text: txt, style: { fontFamily: FONT, fontSize: size, fontWeight: weight, fill: color, stroke: { color: C.deep, width: Math.max(2, size * 0.12) }, align: 'center', letterSpacing: size * 0.04 } });
  t.anchor.set(0.5);
  return t;
}
function polygon(g: Graphics, n: number, r: number, rot = -Math.PI / 2, cx = 0, cy = 0): Graphics {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  return g.poly(pts);
}
function glowStroke(g: Graphics, draw: (g: Graphics) => void, color: number, width: number): void {
  for (const [w, a] of [[width * 3.2, 0.1], [width * 2, 0.18], [width, 1]] as const) { draw(g); g.stroke({ color, width: w, alpha: a, join: 'round' }); }
}

function symbol(id: string): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  if (LOW_COL[id] !== undefined) {
    const col = LOW_COL[id]!;
    g.ellipse(0, 170, 120, 34).fill({ color: C.shade }).ellipse(0, 162, 104, 26).fill({ color: C.white });
    g.moveTo(-90, 160).lineTo(0, 40).lineTo(90, 160).closePath().fill({ color: col, alpha: 0.08 });
    const shape = (gg: Graphics) => {
      if (id === 'sym.L1') polygon(gg, 3, 140, -Math.PI / 2, 0, -20);
      else if (id === 'sym.L2') gg.circle(0, -20, 118);
      else if (id === 'sym.L3') polygon(gg, 4, 150, -Math.PI / 2, 0, -20);
      else polygon(gg, 6, 135, 0, 0, -20);
    };
    shape(g); g.fill({ color: col, alpha: 0.18 });
    glowStroke(g, shape, col, 22);
  } else if (id === 'sym.H1') {
    g.roundRect(-120, -170, 240, 330, 40).fill({ color: C.white }).roundRect(-120, -170, 240, 330, 40).stroke({ color: C.shade, width: 6 });
    g.rect(-124, -150, 248, 34).fill({ color: C.blue }).rect(-124, 110, 248, 34).fill({ color: C.blue });
    glowStroke(g, (gg) => gg.moveTo(-70, 0).lineTo(70, 0).moveTo(-40, -30).lineTo(-40, 30).moveTo(0, -36).lineTo(0, 36).moveTo(40, -30).lineTo(40, 30), C.cyan, 10);
    g.ellipse(0, -176, 110, 22).fill({ color: C.shade }).roundRect(-20, -200, 60, 24, 12).fill({ color: C.blue });
  } else if (id === 'sym.H2') {
    g.circle(0, 0, 170).fill({ color: 0x1a2350 });
    const r = mulberry32(7);
    for (let i = 0; i < 22; i++) {
      const rr = 60 + r() * 110;
      g.ellipse(0, 0, rr, rr * (0.3 + r() * 0.6)).stroke({ color: i % 3 ? C.cyan : 0xb18cff, width: 5, alpha: 0.75 });
    }
    g.circle(0, 0, 170).stroke({ color: C.glow, width: 6, alpha: 0.6 });
    g.moveTo(150, 80).bezierCurveTo(230, 140, 200, 220, 250, 240).stroke({ color: C.cyan, width: 8 });
    g.circle(250, 240, 12).fill({ color: C.glow });
  } else if (id === 'sym.H3') {
    g.ellipse(20, 0, 170, 100).fill({ color: 0xc8d4e4 }).ellipse(20, -20, 150, 60).fill({ color: 0xf2f6fb, alpha: 0.8 });
    g.moveTo(170, 0).lineTo(250, -90).lineTo(240, 0).lineTo(250, 90).closePath().fill({ color: C.blue });
    g.moveTo(0, -95).lineTo(60, -150).lineTo(90, -90).closePath().fill({ color: C.blue });
    g.circle(-90, -20, 22).fill({ color: C.visor }).circle(-90, -20, 11).fill({ color: C.cyan });
    for (let i = 0; i < 4; i++) g.moveTo(30 + i * 30, -80).lineTo(30 + i * 30, 80).stroke({ color: 0x8fa0b8, width: 4 });
  } else if (id === 'sym.H4') {
    g.moveTo(140, 60).bezierCurveTo(260, 120, 250, 230, 180, 250).stroke({ color: C.deep, width: 12 });
    g.ellipse(0, 40, 170, 130).fill({ color: C.white }).ellipse(0, 40, 170, 130).stroke({ color: C.shade, width: 6 });
    g.circle(-110, -90, 70).fill({ color: C.white }).circle(-110, -90, 44).fill({ color: C.blue });
    g.circle(110, -90, 70).fill({ color: C.white }).circle(110, -90, 44).fill({ color: C.blue });
    g.roundRect(-120, -10, 240, 80, 40).fill({ color: C.visor });
    g.circle(-55, 30, 18).fill({ color: C.cyan }).circle(55, 30, 18).fill({ color: C.cyan });
    g.rect(-150, 140, 300, 14).fill({ color: C.deep });
  } else if (id === 'sym.W') {
    g.circle(0, -30, 190).fill({ color: C.deep }).circle(0, -30, 190).stroke({ color: C.white, width: 18 });
    glowStroke(g, (gg) => gg.arc(0, -30, 110, 0.7, Math.PI * 2 - 0.7), C.cyan, 44);
    c.addChild(label('WILD', 110, C.white)).position.set(0, 185);
  } else if (id === 'sym.S') {
    g.circle(0, -30, 190).fill({ color: C.visor }).circle(0, -30, 190).stroke({ color: C.white, width: 20 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.circle(Math.cos(a) * 190, -30 + Math.sin(a) * 190, 14).fill({ color: C.blue }); }
    g.ellipse(0, -30, 60, 150).fill({ color: C.cyan, alpha: 0.3 }).ellipse(0, -30, 26, 130).fill({ color: C.glow });
    c.addChild(label('SCATTER', 84, C.white)).position.set(0, 190);
  }
  return c;
}

function decor(id: string, w: number, h: number): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  const r = mulberry32(id.length * 97 + 13);
  if (id === 'decor.sky' || id === 'decor.p.bg' || id === 'media.bg') {
    const grad = new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: [{ offset: 0, color: 0x060a1c }, { offset: 0.55, color: 0x101a44 }, { offset: 1, color: 0x14395a }], textureSpace: 'local' });
    g.rect(0, 0, w, h).fill(grad);
    for (let i = 0; i < 70; i++) g.circle(r() * w, r() * h * 0.5, r() * 1.6 + 0.4).fill({ color: 0xbfd8ff, alpha: 0.25 + r() * 0.3 });
    if (id === 'decor.p.bg') for (let i = 0; i < 40; i++) { const bw = 30 + r() * 90, bh = h * (0.2 + r() * 0.35); g.rect(r() * w, h - bh, bw, bh).fill({ color: 0x0e1638, alpha: 0.95 }); }
  } else if (id === 'decor.far' || id === 'decor.mid') {
    const mid = id === 'decor.mid';
    const n = mid ? 16 : 34;
    for (let i = 0; i < n; i++) {
      const bw = (mid ? 70 : 34) + r() * (mid ? 110 : 60), bh = h * ((mid ? 0.35 : 0.25) + r() * (mid ? 0.35 : 0.25));
      const x = (i / n) * w + r() * 30, y = h - bh;
      g.rect(x, y, bw, bh).fill({ color: mid ? 0x121c46 : 0x0c1435 });
      for (let k = 0; k < (mid ? 26 : 10); k++) g.rect(x + 6 + r() * (bw - 12), y + 10 + r() * (bh - 20), 4, 6).fill({ color: r() < 0.7 ? 0x9fd8ff : C.amber, alpha: 0.35 + r() * 0.4 });
      if (mid && r() < 0.35) g.rect(x + bw * 0.2, y + 30, bw * 0.6, 14).fill({ color: r() < 0.5 ? C.magenta : C.cyan, alpha: 0.7 });
    }
    if (mid) g.rect(0, h * 0.38, w, 12).fill({ color: 0x2a3a6a }).rect(0, h * 0.38 + 12, w, 4).fill({ color: C.cyan, alpha: 0.35 });
  } else if (id === 'decor.near' || id === 'decor.p.near') {
    const floorY = h * (id === 'decor.near' ? 0.78 : 0.8);
    const fg = new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: [{ offset: 0, color: 0x1b2552 }, { offset: 1, color: 0x070b18 }], textureSpace: 'local' });
    g.rect(0, floorY, w, h - floorY).fill(fg);
    g.rect(0, floorY, w, 3).fill({ color: C.cyan, alpha: 0.4 });
    for (let i = 0; i < 12; i++) g.rect(r() * w, floorY + 10 + r() * (h - floorY - 20), 60 + r() * 160, 2).fill({ color: r() < 0.5 ? C.magenta : C.cyan, alpha: 0.12 });
    for (const x of [0, w - 46]) g.roundRect(x, 0, 46, floorY, 10).fill({ color: C.white, alpha: 0.92 }).rect(x + 18, 0, 10, floorY).fill({ color: C.blue, alpha: 0.6 });
    g.rect(46, 0, w - 92, 30).fill({ color: C.white, alpha: 0.85 });
    const px = w * (id === 'decor.near' ? 0.8 : 0.74);
    g.ellipse(px, floorY + (h - floorY) * 0.18, 230, 40).fill({ color: 0x24305c }).ellipse(px, floorY + (h - floorY) * 0.18, 230, 40).stroke({ color: C.cyan, width: 3, alpha: 0.5 });
  } else if (id === 'decor.scan' || id === 'decor.scan2') {
    for (let y = 0; y < h; y += 14) g.rect(0, y, w, 1.5).fill({ color: C.cyan, alpha: 0.08 });
    for (let i = 0; i < 16; i++) { const bw = 70 + r() * 110, bh = h * (0.35 + r() * 0.35), x = (i / 16) * w + r() * 30; g.rect(x, h - bh, bw, bh).stroke({ color: C.cyan, width: 2, alpha: 0.5 }); }
    if (id === 'decor.scan2') g.ellipse(w * 0.5, h * 0.2, 260, 90).stroke({ color: C.white, width: 3, alpha: 0.3 }).ellipse(w * 0.5, h * 0.2, 30, 85).fill({ color: C.cyan, alpha: 0.12 });
  } else if (id === 'decor.train') {
    for (let k = 0; k < 4; k++) {
      const x = k * (w / 4) + 8;
      g.roundRect(x, h * 0.25, w / 4 - 16, h * 0.5, 40).fill({ color: C.white }).rect(x + 20, h * 0.36, w / 4 - 56, h * 0.14).fill({ color: 0x9fd8ff, alpha: 0.9 });
      g.rect(x, h * 0.62, w / 4 - 16, 8).fill({ color: C.blue });
    }
    g.rect(0, h * 0.78, w, 6).fill({ color: C.cyan, alpha: 0.6 });
  } else if (id === 'decor.drone') {
    g.ellipse(w / 2, h / 2, 90, 44).fill({ color: C.white });
    for (const [dx, dy] of [[-120, -40], [120, -40], [-120, 40], [120, 40]] as const) g.ellipse(w / 2 + dx, h / 2 + dy, 60, 12).fill({ color: C.shade, alpha: 0.7 });
    g.circle(w / 2, h / 2 + 10, 12).fill({ color: C.cyan });
  } else if (id.startsWith('decor.sign')) {
    const on = !id.endsWith('_off');
    const col = id === 'decor.sign2' ? C.amber : C.magenta;
    g.roundRect(20, 20, w - 40, h - 40, 30).fill({ color: 0x0a0f22 }).stroke({ color: 0x3a4466, width: 8 });
    const shape = (gg: Graphics) => gg.circle(w / 2, h / 2, Math.min(w, h) * 0.28).moveTo(w / 2 - 80, h / 2 - 120).lineTo(w / 2 - 110, h / 2 - 200).lineTo(w / 2 - 20, h / 2 - 150).moveTo(w / 2 + 80, h / 2 - 120).lineTo(w / 2 + 110, h / 2 - 200).lineTo(w / 2 + 20, h / 2 - 150);
    if (on) glowStroke(g, shape, col, 12); else { shape(g); g.stroke({ color: 0x3a3f55, width: 12 }); }
  }
  return c;
}

function ui(id: string, w: number, h: number): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  if (id === 'logo') {
    c.addChild(label('CYBER CAT', 220, C.white)).position.set(w / 2, h / 2);
    g.roundRect(w * 0.08, h * 0.74, w * 0.84, 16, 8).fill({ color: C.cyan });
  } else if (id === 'loading.crownforge' || id === 'media.crownforge') {
    g.moveTo(w * 0.28, h * 0.55).lineTo(w * 0.34, h * 0.3).lineTo(w * 0.42, h * 0.45).lineTo(w * 0.5, h * 0.25).lineTo(w * 0.58, h * 0.45).lineTo(w * 0.66, h * 0.3).lineTo(w * 0.72, h * 0.55).closePath().fill({ color: 0xffc766 }).stroke({ color: C.white, width: 10 });
    g.roundRect(w * 0.26, h * 0.57, w * 0.48, h * 0.08, 20).fill({ color: 0x3a4466 });
    c.addChild(label('CROWNFORGE', 110, C.white)).position.set(w / 2, h * 0.8);
  } else if (id === 'grid.frame') {
    g.roundRect(20, 20, w - 40, h - 40, 120).stroke({ color: C.white, width: 90 }).roundRect(80, 80, w - 160, h - 160, 80).stroke({ color: C.blue, width: 18 }).roundRect(96, 96, w - 192, h - 192, 70).stroke({ color: C.cyan, width: 5, alpha: 0.8 });
  } else if (id === 'grid.cell') {
    g.roundRect(8, 8, w - 16, h - 16, 56).fill({ color: 0x0b1432, alpha: 0.9 }).roundRect(8, 8, w - 16, h - 16, 56).stroke({ color: 0x2a3a74, width: 6 });
    g.roundRect(30, 22, w - 60, 20, 10).fill({ color: 0xffffff, alpha: 0.05 });
  } else if (id === 'mech.dot') {
    for (const [r2, a] of [[240, 0.08], [160, 0.16], [90, 0.4], [46, 1]] as const) g.circle(w / 2, h / 2, r2).fill({ color: r2 < 50 ? 0xffffff : C.cyan, alpha: a });
    g.rect(w / 2 - 230, h / 2 - 4, 460, 8).fill({ color: C.glow, alpha: 0.5 });
  } else if (id.startsWith('mech.chip')) {
    const n = Number(id.slice(-1));
    g.roundRect(96, 96, w - 192, h - 192, 40).fill({ color: C.white }).stroke({ color: C.shade, width: 8 });
    for (let i = 0; i < 5; i++) for (const s of [70, w - 70]) g.rect(s - 16, 130 + i * 55, 32, 18).fill({ color: C.blue });
    for (let i = 0; i < n; i++) { const y = 170 + i * 50; glowStroke(g, (gg) => gg.moveTo(w / 2 - 70, y + 34).lineTo(w / 2, y).lineTo(w / 2 + 70, y + 34), C.cyan, 16); }
  } else if (id === 'mech.mult') {
    g.circle(w / 2, h / 2, 230).fill({ color: C.white }).circle(w / 2, h / 2, 200).fill({ color: C.blue }).circle(w / 2, h / 2, 150).fill({ color: 0x0d2b66 }).circle(w / 2, h / 2, 150).stroke({ color: C.cyan, width: 10 });
  } else if (id === 'ui.spin' || id === 'ui.spin_stop') {
    g.circle(w / 2, h / 2, 490).fill({ color: C.white }).circle(w / 2, h / 2, 420).fill({ color: C.blue }).circle(w / 2, h / 2, 360).fill({ color: 0x0d2b66 });
    if (id === 'ui.spin') glowStroke(g, (gg) => gg.arc(w / 2, h / 2, 280, -0.3, Math.PI * 1.55), C.cyan, 34);
    else g.roundRect(w / 2 - 110, h / 2 - 110, 220, 220, 40).fill({ color: C.cyan });
  } else if (id === 'ui.buy') {
    g.roundRect(20, 60, w - 40, h - 120, (h - 120) / 2).fill({ color: C.blue }).stroke({ color: C.white, width: 24 });
    g.circle(150, h / 2, 80).fill({ color: C.visor }).ellipse(150, h / 2, 22, 64).fill({ color: C.cyan });
  } else if (id === 'ui.round') {
    g.circle(w / 2, h / 2, 240).fill({ color: C.white }).circle(w / 2, h / 2, 206).fill({ color: 0x0b1432 }).circle(w / 2, h / 2, 206).stroke({ color: C.cyan, width: 6, alpha: 0.7 });
  } else if (id === 'ui.panel') {
    g.roundRect(8, 8, w - 16, h - 16, 100).fill({ color: 0x0b1432, alpha: 0.92 }).roundRect(8, 8, w - 16, h - 16, 100).stroke({ color: C.white, width: 8, alpha: 0.9 });
  } else if (id === 'ui.icons') {
    const cw = w / 4, ch = h / 2;
    const at = (i: number) => ({ x: (i % 4) * cw + cw / 2, y: Math.floor(i / 4) * ch + ch / 2 });
    const s = 60;
    let p = at(0); g.moveTo(p.x - s, p.y).lineTo(p.x + s, p.y).stroke({ color: C.white, width: 22, cap: 'round' });
    p = at(1); g.moveTo(p.x - s, p.y).lineTo(p.x + s, p.y).moveTo(p.x, p.y - s).lineTo(p.x, p.y + s).stroke({ color: C.white, width: 22, cap: 'round' });
    p = at(2); g.moveTo(p.x + 20, p.y - 90).lineTo(p.x - 40, p.y + 10).lineTo(p.x + 10, p.y + 10).lineTo(p.x - 20, p.y + 90).lineTo(p.x + 50, p.y - 20).lineTo(p.x, p.y - 20).closePath().fill({ color: C.cyan });
    p = at(3); g.arc(p.x, p.y, 70, 0.4, Math.PI * 1.8).stroke({ color: C.white, width: 18 }); g.moveTo(p.x + 64, p.y + 40).lineTo(p.x + 90, p.y - 6).lineTo(p.x + 30, p.y + 10).closePath().fill({ color: C.white });
    p = at(4); g.circle(p.x, p.y, 80).stroke({ color: C.white, width: 16 }); g.rect(p.x - 9, p.y - 10, 18, 60).fill({ color: C.white }).circle(p.x, p.y - 38, 11).fill({ color: C.white });
    for (const k of [5, 6]) { p = at(k); g.moveTo(p.x - 70, p.y - 25).lineTo(p.x - 30, p.y - 25).lineTo(p.x + 20, p.y - 70).lineTo(p.x + 20, p.y + 70).lineTo(p.x - 30, p.y + 25).lineTo(p.x - 70, p.y + 25).closePath().fill({ color: C.white }); if (k === 5) g.arc(p.x + 30, p.y, 50, -0.8, 0.8).stroke({ color: C.cyan, width: 12 }); else g.moveTo(p.x + 40, p.y - 30).lineTo(p.x + 90, p.y + 30).moveTo(p.x + 90, p.y - 30).lineTo(p.x + 40, p.y + 30).stroke({ color: C.magenta, width: 14, cap: 'round' }); }
    p = at(7); g.circle(p.x, p.y, 60).stroke({ color: C.white, width: 22 }); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.moveTo(p.x + Math.cos(a) * 70, p.y + Math.sin(a) * 70).lineTo(p.x + Math.cos(a) * 95, p.y + Math.sin(a) * 95).stroke({ color: C.white, width: 20 }); }
  } else if (id === 'ui.popup' || id === 'ui.total' || id === 'ui.tier' || id === 'ui.tier.max' || id === 'ui.banner.fs') {
    const gold = id === 'ui.tier.max';
    g.roundRect(30, 30, w - 60, h - 60, Math.min(140, h / 4)).fill({ color: 0x0a1230, alpha: 0.88 }).roundRect(30, 30, w - 60, h - 60, Math.min(140, h / 4)).stroke({ color: gold ? 0xffd27a : C.white, width: 18 });
    g.roundRect(60, 60, w - 120, h - 120, Math.min(110, h / 5)).stroke({ color: C.cyan, width: 5, alpha: 0.8 });
    if (id === 'ui.tier' || gold) { polygon(g, 3, 70, -Math.PI / 2, w * 0.3, 40).fill({ color: gold ? 0xffd27a : C.white }); polygon(g, 3, 70, -Math.PI / 2, w * 0.7, 40).fill({ color: gold ? 0xffd27a : C.white }); }
  } else if (id.startsWith('ui.intro') || id.startsWith('welcome.') || id.startsWith('shop.')) {
    const grad = new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: [{ offset: 0, color: 0x101a44 }, { offset: 1, color: 0x071022 }], textureSpace: 'local' });
    g.roundRect(20, 20, w - 40, h - 40, 60).fill(grad).roundRect(20, 20, w - 40, h - 40, 60).stroke({ color: id.includes('double') ? 0xffd27a : C.cyan, width: 10 });
    const two = id.includes('double') || id.includes('doublegaze');
    const eyes = id.includes('nine') ? 9 : two ? 2 : 1;
    for (let i = 0; i < eyes; i++) {
      const x = w / 2 + (i - (eyes - 1) / 2) * (eyes > 2 ? w / 11 : w / 4), y = h * (eyes > 2 ? 0.3 + Math.abs(i - 4) * 0.02 : 0.32);
      g.ellipse(x, y, eyes > 2 ? 26 : 60, eyes > 2 ? 12 : 26).fill({ color: C.cyan }).ellipse(x, y, 6, eyes > 2 ? 10 : 22).fill({ color: C.visor });
    }
    for (let cc = 0; cc < 5; cc++) for (let rr = 0; rr < 3; rr++) g.roundRect(w * 0.18 + cc * w * 0.13, h * 0.46 + rr * h * 0.1, w * 0.11, h * 0.085, 10).fill({ color: 0x13205a }).stroke({ color: 0x2c3f86, width: 3 });
  } else if (id === 'fx.sheet') {
    const cw = w / 4, ch = h / 4;
    for (let i = 0; i < 16; i++) {
      const x = (i % 4) * cw + cw / 2, y = Math.floor(i / 4) * ch + ch / 2;
      const col = [C.white, C.cyan, C.cyan, C.glow, 0x7fe9ff, 0x7fe9ff, 0xbfe6ff, C.magenta, C.cyan, C.cyan, C.glow, 0xa8b8d8, C.cyan, C.cyan, C.cyan, C.white][i]!;
      if (i === 0) polygon(g, 8, 90, 0, x, y).fill({ color: col }).circle(x, y, 40).fill({ color: 0xffffff });
      else if (i === 1) for (const [rr, a] of [[100, 0.12], [70, 0.25], [40, 0.6]] as const) g.circle(x, y, rr).fill({ color: col, alpha: a });
      else if (i === 2) g.circle(x, y, 90).stroke({ color: col, width: 14, alpha: 0.9 });
      else if (i === 3) g.ellipse(x, y, 110, 8).fill({ color: col });
      else if (i === 4) g.circle(x, y, 70).fill({ color: 0x1c5fd6 }).circle(x, y, 70).stroke({ color: C.white, width: 10 }).circle(x, y, 40).stroke({ color: col, width: 8 });
      else if (i === 5) g.ellipse(x, y, 20, 70).fill({ color: 0x1c5fd6 }).stroke({ color: C.white, width: 6 });
      else if (i === 6) g.rect(x - 3, y - 90, 6, 180).fill({ color: col, alpha: 0.6 });
      else if (i === 7) g.circle(x, y, 60).fill({ color: col, alpha: 0.35 });
      else if (i === 8) g.moveTo(x - 90, y).lineTo(x - 40, y - 30).lineTo(x, y + 20).lineTo(x + 40, y - 20).lineTo(x + 90, y).stroke({ color: col, width: 8 });
      else if (i === 9) g.rect(x - 30, y - 30, 60, 60).fill({ color: col });
      else if (i === 10) g.ellipse(x, y, 90, 16).fill({ color: col }).ellipse(x, y, 16, 60).fill({ color: col });
      else if (i === 11) g.circle(x, y, 70).fill({ color: col, alpha: 0.4 });
      else if (i === 12) g.circle(x, y, 26).fill({ color: col }).circle(x, y, 50).stroke({ color: col, width: 6 });
      else if (i === 13) g.rect(x - 110, y - 5, 220, 10).fill({ color: col });
      else g.rect(x - 16, y - 60, 32, 120).fill({ color: col });
    }
  } else {
    g.roundRect(0, 0, w, h, 40).fill({ color: 0x1b2552 }).stroke({ color: C.cyan, width: 8 });
    c.addChild(label(id, Math.max(28, Math.min(w, h) / 10), C.glow, '600')).position.set(w / 2, h / 2);
  }
  return c;
}

export function standInTexture(id: string, renderer: Renderer): Texture {
  const def = PLAN.images[id];
  const [w, h] = def ? [Math.min(def.size[0], 1536), Math.min(def.size[1], 1536)] : [512, 512];
  const scale = 0.5;
  const root = new Container();
  let content: Container;
  if (id.startsWith('sym.')) { content = symbol(id); content.position.set(w / 2, h / 2); }
  else if (id.startsWith('decor.') || id === 'media.bg') content = decor(id, w, h);
  else content = ui(id, w, h);
  root.addChild(content);
  // sprites (symbols, mechanic objects) are generated tight around their drawing, like trimmed art;
  // full-frame images (decor, frames, plates, sheets) keep their plan size
  const tight = id.startsWith('sym.') || id === 'mech.dot' || id.startsWith('mech.chip') || id === 'mech.mult';
  if (!tight) root.addChildAt(new Graphics().rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0 }), 0);
  const tex = renderer.generateTexture({ target: root, resolution: scale, frame: undefined, antialias: true });
  root.destroy({ children: true });
  return tex;
}
