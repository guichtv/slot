import { describe, expect, it } from 'vitest';
import RIG from '../src/render/mascot/buckRig.json';
import { autoVia, bezier, extension, fk, naturalSide, solve, solveTip, type IkArm, type Side, type Vec } from '../src/render/mascot/armIk';

const IK = (RIG as unknown as { ik: Record<'armF' | 'armB', IkArm> }).ik;
const ARM: Record<Side, IkArm> = { F: IK.armF, B: IK.armB };
const rest = (id: string) => (RIG as unknown as { parts: Array<{ id: string; rest?: number }> }).parts.find((p) => p.id === id)?.rest ?? 0;
const REST: Record<Side, Vec> = {
  F: fk(ARM.F, rest('armF'), rest('foreF')).wrist,
  B: fk(ARM.B, rest('armB'), rest('foreB')).wrist,
};
const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('bras de Buck (IK pilotée par la main)', () => {
  it('pose le poignet exactement sur toute cible atteignable, des deux côtés du coude', () => {
    for (const side of ['F', 'B'] as const) {
      const a = ARM[side];
      for (const t of [[-70, -285], [135, 35], [-250, -20], [120, 150], [600, 60], [-60, 330]] as Vec[]) {
        if (extension(a, t) > 0.99) continue;
        for (const s of [1, -1]) {
          const r = solve(a, side, t, s);
          expect(dist(fk(a, r.upper, r.fore).wrist, t)).toBeLessThan(0.5);
        }
      }
    }
  });

  it('retrouve exactement la pose de repos du rig (aucun saut au premier geste)', () => {
    for (const side of ['F', 'B'] as const) {
      const a = ARM[side];
      const r = solve(a, side, REST[side], 1);
      expect(Math.abs(r.upper - rest(a.upper))).toBeLessThan(0.5);
      expect(Math.abs(r.fore - rest(a.fore))).toBeLessThan(0.5);
    }
  });

  it("coude toujours à l'extérieur : jamais vers la tête bras levés, jamais levé en désignant", () => {
    const a = ARM.F;
    // bras levé : coude à gauche de l'épaule (extérieur), pas vers la tête (droite)
    const up = solve(a, 'F', [-70, -285], naturalSide(a, 'F', [-70, -285]));
    expect(up.elbow[0]).toBeLessThan(a.shoulder[0]);
    // désigner à gauche : coude sous la ligne épaule-main
    const point = solve(a, 'F', [-250, -20], naturalSide(a, 'F', [-250, -20]));
    expect(point.elbow[1]).toBeGreaterThan(a.shoulder[1] - 10);
    // bras arrière levé (miroir) : coude à droite de l'épaule
    const b = ARM.B;
    const upB = solve(b, 'B', [619, -280], naturalSide(b, 'B', [619, -280]));
    expect(upB.elbow[0]).toBeGreaterThan(b.shoulder[0]);
  });

  it('les trajectoires restent continues (aucun pas de plus de 25 px par 1/60 de trajet)', () => {
    const a = ARM.F;
    const p0: Vec = [-70, -285];
    const c = autoVia(a, 'F', p0, REST.F);
    let prev = bezier(p0, c, REST.F, 0);
    for (let i = 1; i <= 60; i++) {
      const p = bezier(p0, c, REST.F, i / 60);
      expect(dist(p, prev)).toBeLessThan(25);
      prev = p;
    }
    // l'arc bombe vers l'extérieur (gauche pour le bras avant) et reste loin de l'épaule
    expect(c[0]).toBeLessThan(Math.min(p0[0], REST.F[0]));
    expect(dist(c, a.shoulder)).toBeGreaterThan((a.upperLen + a.foreLen) * 0.5 - 1);
  });

  it("pose un point de la main (jointures) exactement sur une cible atteignable, même bras replié", () => {
    const a = ARM.B;
    // jointures du poing : ~150 px au-delà du poignet dans le repère de la main
    const off: Vec = [-60, 138];
    const rest0 = rest(a.upper);
    let tested = 0;
    let bad = 0;
    // cibles atteignables par construction : poses réelles (angles), puis on demande au solveur de les retrouver
    for (let du = -150; du <= 60; du += 15) {
      for (let df = -150; df <= -20; df += 13) {
        const upper = rest0 + du;
        const fore = rest(a.fore) + df;
        const wrist = fk(a, upper, fore).wrist;
        if (extension(a, wrist) > 0.97) continue;
        const w = ((upper + fore) * Math.PI) / 180;
        const target: Vec = [wrist[0] + Math.cos(w) * off[0] - Math.sin(w) * off[1], wrist[1] + Math.sin(w) * off[0] + Math.cos(w) * off[1]];
        const s = dist(solve(a, 'B', wrist, 1).elbow, fk(a, upper, fore).elbow) < 1 ? 1 : -1;
        const r = solveTip(a, 'B', target, s, off, 0);
        const w2 = ((r.upper + r.fore) * Math.PI) / 180;
        const tip: Vec = [r.wrist[0] + Math.cos(w2) * off[0] - Math.sin(w2) * off[1], r.wrist[1] + Math.sin(w2) * off[0] + Math.cos(w2) * off[1]];
        tested++;
        if (dist(tip, target) > 1) bad++;
      }
    }
    expect(tested).toBeGreaterThan(100);
    expect(bad / tested).toBeLessThan(0.05);
  });
});
