import type { Pose, RigDef } from '../rig/Rig';

/**
 * Rig de Buck Boomtooth (pièces issues des planches ImageGen buck-*.png).
 * Pivots et attaches en px des textures RÉELLES (réglés sur le banc mascot-bench.html, captures dans docs/).
 * z : ordre relatif au sprite parent (négatif = derrière le parent, positif = devant).
 * Recouvrements larges aux articulations ; col de chemise, fourrure des poignets et bottes masquent les joints.
 */
export const BUCK_RIG: RigDef = {
  parts: [
    { id: 'torso', texture: 'buck.body.torso', pivot: [0, 0], z: 0 },
    { id: 'tail', texture: 'buck.body.tail', pivot: [0, 0], parent: 'torso', attach: [0, 0], z: -5 },
    { id: 'thighB', texture: 'buck.body.thighR', pivot: [0, 0], parent: 'torso', attach: [0, 0], z: -3 },
    { id: 'shinB', texture: 'buck.body.shinR', pivot: [0, 0], parent: 'thighB', attach: [0, 0], z: -1 },
    { id: 'thighF', texture: 'buck.body.thighL', pivot: [0, 0], parent: 'torso', attach: [0, 0], z: -2 },
    { id: 'shinF', texture: 'buck.body.shinL', pivot: [0, 0], parent: 'thighF', attach: [0, 0], z: -1 },
    { id: 'armB', texture: 'buck.arms.upperR', pivot: [0, 0], parent: 'torso', attach: [0, 0], z: -4 },
    { id: 'foreB', texture: 'buck.arms.foreR', pivot: [0, 0], parent: 'armB', attach: [0, 0], z: 1 },
    { id: 'handB', texture: 'buck.arms.handOpen', pivot: [0, 0], parent: 'foreB', attach: [0, 0], z: 1 },
    { id: 'head', texture: 'buck.heads.rest', pivot: [0, 0], parent: 'torso', attach: [0, 0], z: 3 },
    { id: 'armF', texture: 'buck.arms.upperL', pivot: [0, 0], parent: 'torso', attach: [0, 0], z: 4 },
    { id: 'foreF', texture: 'buck.arms.foreL', pivot: [0, 0], parent: 'armF', attach: [0, 0], z: 1 },
    { id: 'handF', texture: 'buck.arms.handOpen', pivot: [0, 0], parent: 'foreF', attach: [0, 0], z: 1 },
  ],
  alternates: {
    head: {
      rest: 'buck.heads.rest',
      grin: 'buck.heads.grin',
      shout: 'buck.heads.shout',
      surprise: 'buck.heads.surprise',
      wink: 'buck.heads.wink',
      focus: 'buck.heads.focus',
      blink: 'buck.heads.blink',
    },
    handF: {
      open: 'buck.arms.handOpen',
      fist: 'buck.arms.handFist',
      grip: 'buck.arms.handGrip',
      thumb: 'buck.arms.handThumb',
      point: 'buck.arms.handPoint',
      match: 'buck.arms.handMatch',
    },
    handB: {
      open: 'buck.arms.handOpen',
      fist: 'buck.arms.handFist',
      grip: 'buck.arms.handGrip',
      thumb: 'buck.arms.handThumb',
      point: 'buck.arms.handPoint',
      match: 'buck.arms.handMatch',
    },
  },
};

/** poses clés (degrés, décalages en px de texture) — réglées au banc */
export const POSES: Record<string, Pose> = {
  rest: {
    torso: { r: 0, sx: 1, sy: 1 },
    head: { r: 0, alt: 'rest' },
    armF: { r: 8 },
    foreF: { r: -6 },
    handF: { r: 0, alt: 'open' },
    armB: { r: -8 },
    foreB: { r: 6 },
    handB: { r: 0, alt: 'open' },
    thighF: { r: 0 },
    shinF: { r: 0 },
    thighB: { r: 0 },
    shinB: { r: 0 },
    tail: { r: 0 },
  },
};
