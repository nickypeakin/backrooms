// Models built from primitives: store furniture, the people, the entity,
// almond water and the exit door. Furniture and people face +z with their
// origin on the floor.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';

// shared physically based materials, cached by their settings
const mats = new Map();
function mat(color, o = {}) {
  const key = JSON.stringify([color, o.map && o.map.uuid, o.rough, o.metal, o.emissive, o.ei, o.opacity, o.side]);
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({
      color, map: o.map || null, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0,
      emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1,
      transparent: o.opacity != null, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide,
    }));
  }
  return mats.get(key);
}

const geos = new Map();
function cachedGeo(key, make) {
  if (!geos.has(key)) geos.set(key, make());
  return geos.get(key);
}
const rbox = (w, h, d, r = 0.03) => cachedGeo(`rb${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)));
const capsule = (r, len) => cachedGeo(`cap${r}:${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 14));
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
const ballGeo = new THREE.SphereGeometry(1, 24, 16);

function place(parent, geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const block = (g, m, x, y, z, w, h, d, r) => place(g, rbox(w, h, d, r), m, x, y, z);
function cyl(g, m, x, y, z, r, h) {
  const c = place(g, cylGeo, m, x, y, z);
  c.scale.set(r, h, r);
  return c;
}
function ball(g, m, x, y, z, sx, sy = sx, sz = sx) {
  const b = place(g, ballGeo, m, x, y, z);
  b.scale.set(sx, sy, sz);
  return b;
}
function legs(g, m, w, d, h, inset = 0.06, r = 0.025) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, m, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset), r, h);
}

const wood = (tone, key, rough = 0.55) => mat(0xffffff, { map: TX.wood(tone, key), rough });
const cloth = (color) => mat(color, { map: TX.fabric(), rough: 0.95 });
const DARK = 0x2a211b;
const METAL = () => mat(0x8a8a88, { rough: 0.35, metal: 0.85 });
const glow = (color = 0xffe2b0, ei = 1.4) => mat(0xfff1d8, { emissive: color, ei, rough: 0.6, side: THREE.DoubleSide });

// ------------------------------------------------------------- furniture --
const build = {
  sofa(g, f) {
    const c = cloth(f.color);
    block(g, c, 0, 0.27, 0, 2.3, 0.3, 0.95, 0.06);
    for (const x of [-0.55, 0.55]) block(g, c, x, 0.5, 0.07, 1.08, 0.17, 0.78, 0.07);
    block(g, c, 0, 0.56, -0.4, 2.3, 0.58, 0.16, 0.05);
    for (const x of [-0.53, 0.53]) {
      const b = block(g, c, x, 0.76, -0.3, 1.04, 0.46, 0.2, 0.08);
      b.rotation.x = -0.14;
    }
    for (const x of [-1.04, 1.04]) block(g, c, x, 0.4, 0, 0.22, 0.62, 0.95, 0.08);
    const pil = cloth(0xe9e2d0);
    for (const x of [-0.72, 0.72]) {
      const p = block(g, pil, x, 0.72, -0.17, 0.4, 0.36, 0.12, 0.06);
      p.rotation.set(-0.2, x > 0 ? -0.25 : 0.25, x > 0 ? 0.12 : -0.12);
    }
    legs(g, mat(DARK, { rough: 0.5 }), 2.2, 0.85, 0.12, 0.05, 0.025);
  },
  armchair(g, f) {
    const c = cloth(f.color);
    block(g, c, 0, 0.27, 0, 1.0, 0.3, 0.95, 0.06);
    block(g, c, 0, 0.5, 0.07, 0.62, 0.17, 0.78, 0.07);
    const back = block(g, c, 0, 0.74, -0.34, 0.98, 0.72, 0.2, 0.08);
    back.rotation.x = -0.1;
    for (const x of [-0.4, 0.4]) block(g, c, x, 0.42, 0, 0.2, 0.5, 0.95, 0.08);
    legs(g, mat(DARK, { rough: 0.5 }), 0.9, 0.85, 0.12, 0.05, 0.025);
  },
  coffeeTable(g) {
    const w = wood('#7a5032', 'woodMid');
    block(g, w, 0, 0.42, 0, 1.2, 0.05, 0.65, 0.015);
    block(g, w, 0, 0.14, 0, 1.1, 0.03, 0.55, 0.01);
    legs(g, w, 1.2, 0.65, 0.4, 0.06, 0.028);
    block(g, mat(0x7b2e2a, { rough: 0.7 }), -0.3, 0.465, 0.05, 0.26, 0.04, 0.2, 0.008);
    block(g, mat(0x2e4a6b, { rough: 0.7 }), -0.29, 0.5, 0.04, 0.24, 0.03, 0.18, 0.008);
    const v = place(g, cachedGeo('vase', () => new THREE.LatheGeometry([0, 0.05, 0.07, 0.06, 0.03, 0.035].map((r, i) => new THREE.Vector2(r, i * 0.05)), 18)), mat(0x3f6f73, { rough: 0.25 }), 0.32, 0.445, -0.05);
    v.scale.setScalar(1.1);
  },
  floorLamp(g) {
    const metal = METAL();
    cyl(g, metal, 0, 0.015, 0, 0.17, 0.03);
    cyl(g, metal, 0, 0.8, 0, 0.013, 1.6);
    place(g, cachedGeo('shade', () => new THREE.CylinderGeometry(0.16, 0.24, 0.3, 24, 1, true)), glow(), 0, 1.62, 0);
  },
  tvStand(g) {
    block(g, wood('#3b2a20', 'woodDark'), 0, 0.25, 0, 1.8, 0.5, 0.45, 0.02);
    block(g, mat(0x111111, { rough: 0.4 }), 0, 0.55, 0, 0.3, 0.05, 0.2, 0.01);
    cyl(g, mat(0x111111, { rough: 0.4 }), 0, 0.6, 0, 0.03, 0.12);
    block(g, mat(0x0c0c0c, { rough: 0.4 }), 0, 0.98, 0, 1.3, 0.76, 0.05, 0.015);
    block(g, mat(0x050608, { rough: 0.08, metal: 0.2 }), 0, 0.98, 0.026, 1.24, 0.7, 0.005, 0.002);
  },
  plant(g) {
    place(g, cachedGeo('pot', () => new THREE.CylinderGeometry(0.2, 0.15, 0.36, 20)), mat(0xa65d3a, { rough: 0.85 }), 0, 0.18, 0);
    cyl(g, mat(0x3b2a1d, { rough: 1 }), 0, 0.355, 0, 0.18, 0.02);
    const leaf = [mat(0x3f6e33, { rough: 0.6 }), mat(0x58893f, { rough: 0.6 })];
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39996, tilt = 0.35 + (i % 4) * 0.18, len = 0.32 + (i % 3) * 0.08;
      const stem = new THREE.Group();
      stem.position.set(0, 0.37, 0);
      stem.rotation.set(0, a, 0);
      g.add(stem);
      const bend = new THREE.Group();
      bend.rotation.x = tilt;
      stem.add(bend);
      ball(bend, leaf[i % 2], 0, len, 0, 0.055, len * 0.55, 0.012);
    }
  },
  bed(g, f) {
    const w = wood('#6e4a2e', 'woodBed');
    block(g, w, 0, 0.2, 0, 1.75, 0.3, 2.15, 0.03);
    block(g, cloth(0xf4f1ea), 0, 0.46, 0, 1.66, 0.24, 2.06, 0.08);
    block(g, cloth(f.color), 0, 0.6, 0.28, 1.74, 0.07, 1.5, 0.035);
    for (const x of [-0.42, 0.42]) {
      const p = block(g, cloth(0xffffff), x, 0.66, -0.78, 0.62, 0.15, 0.38, 0.07);
      p.rotation.x = -0.15;
    }
    block(g, cloth(0x8c6d4f), 0, 0.72, -1.07, 1.8, 1.1, 0.1, 0.04);
  },
  nightstand(g) {
    const w = wood('#6e4a2e', 'woodBed');
    block(g, w, 0, 0.27, 0, 0.5, 0.54, 0.45, 0.02);
    block(g, w, 0, 0.38, 0.228, 0.44, 0.16, 0.02, 0.008);
    ball(g, METAL(), 0, 0.38, 0.245, 0.015);
    place(g, cachedGeo('lampBase', () => new THREE.LatheGeometry([0.001, 0.05, 0.07, 0.06, 0.02, 0.015].map((r, i) => new THREE.Vector2(r, i * 0.035)), 18)), mat(0xd8d0c0, { rough: 0.3 }), 0, 0.54, 0);
    place(g, cachedGeo('smallShade', () => new THREE.CylinderGeometry(0.09, 0.13, 0.16, 18, 1, true)), glow(0xffd9a0, 1.1), 0, 0.8, 0);
  },
  dresser(g) {
    const w = wood('#a77b52', 'woodLight');
    block(g, w, 0, 0.45, 0, 1.4, 0.85, 0.5, 0.02);
    for (let i = 0; i < 3; i++) {
      block(g, w, 0, 0.2 + i * 0.26, 0.255, 1.3, 0.22, 0.03, 0.01);
      block(g, METAL(), 0, 0.2 + i * 0.26, 0.28, 0.22, 0.02, 0.02, 0.008);
    }
  },
  diningTable(g) {
    const w = wood('#8a5a35', 'wood');
    block(g, w, 0, 0.74, 0, 1.8, 0.05, 0.95, 0.02);
    block(g, w, 0, 0.68, 0, 1.6, 0.08, 0.8, 0.01);
    legs(g, w, 1.8, 0.95, 0.72, 0.1, 0.035);
    cyl(g, mat(0xf2efe8, { rough: 0.3 }), -0.4, 0.775, 0, 0.12, 0.012);
    cyl(g, mat(0xf2efe8, { rough: 0.3 }), 0.4, 0.775, 0, 0.12, 0.012);
  },
  chair(g) {
    const w = wood('#8a5a35', 'wood');
    block(g, w, 0, 0.46, 0, 0.45, 0.05, 0.45, 0.015);
    legs(g, w, 0.45, 0.45, 0.44, 0.04, 0.018);
    for (const x of [-0.2, 0.2]) block(g, w, x, 0.73, -0.2, 0.04, 0.55, 0.04, 0.012);
    block(g, w, 0, 0.96, -0.2, 0.45, 0.1, 0.035, 0.012);
    block(g, w, 0, 0.74, -0.2, 0.36, 0.05, 0.025, 0.01);
  },
  sideboard(g) {
    const w = wood('#3b2a20', 'woodDark');
    block(g, w, 0, 0.42, 0, 2.0, 0.78, 0.48, 0.02);
    for (const x of [-0.5, 0.5]) block(g, METAL(), x * 0.98, 0.5, 0.25, 0.02, 0.18, 0.02, 0.008);
    place(g, cachedGeo('tallVase', () => new THREE.LatheGeometry([0.001, 0.06, 0.09, 0.07, 0.04, 0.05].map((r, i) => new THREE.Vector2(r, i * 0.06)), 18)), mat(0xc9c2b5, { rough: 0.2 }), -0.6, 0.81, 0);
  },
  counter(g) {
    block(g, mat(0xe8e4dc, { rough: 0.6 }), 0, 0.52, 0, 3.6, 1.04, 0.9, 0.02);
    block(g, mat(0x4a4038, { rough: 0.3 }), 0, 1.06, 0, 3.7, 0.04, 1.0, 0.01);
    block(g, mat(0x222222, { rough: 0.4 }), 0.8, 1.16, 0, 0.4, 0.16, 0.35, 0.02);
    const scr = block(g, mat(0x1c2a22, { emissive: 0x1d5c3a, ei: 0.8, rough: 0.2 }), 0.8, 1.38, -0.05, 0.36, 0.26, 0.04, 0.01);
    scr.rotation.x = -0.25;
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: TX.sign('CHECKOUT', { w: 512, h: 128, bg: '#7b1e1e' }) }));
    tag.position.set(0, 0.75, 0.452);
    g.add(tag);
  },
  desk(g) {
    const w = wood('#a77b52', 'woodLight');
    block(g, w, 0, 0.75, 0, 1.4, 0.04, 0.7, 0.012);
    for (const x of [-0.67, 0.67]) block(g, w, x, 0.37, 0, 0.04, 0.74, 0.68, 0.01);
    block(g, mat(0x1a1a1a, { rough: 0.4 }), 0.2, 0.98, -0.15, 0.55, 0.34, 0.03, 0.01);
    block(g, mat(0x0a0d12, { rough: 0.1 }), 0.2, 0.98, -0.134, 0.51, 0.3, 0.003, 0.001);
    cyl(g, mat(0x1a1a1a, { rough: 0.4 }), 0.2, 0.8, -0.15, 0.025, 0.1);
    block(g, mat(0x2a2a2a, { rough: 0.6 }), 0.2, 0.78, 0.08, 0.42, 0.02, 0.14, 0.008);
  },
  officeChair(g) {
    const blk = mat(0x1e1e1e, { rough: 0.7 });
    block(g, blk, 0, 0.48, 0, 0.5, 0.08, 0.5, 0.04);
    const back = block(g, blk, 0, 0.86, -0.23, 0.46, 0.6, 0.06, 0.04);
    back.rotation.x = -0.08;
    cyl(g, METAL(), 0, 0.26, 0, 0.025, 0.42);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      const l = block(g, blk, Math.sin(a) * 0.15, 0.05, Math.cos(a) * 0.15, 0.04, 0.03, 0.3, 0.012);
      l.rotation.y = a;
      ball(g, blk, Math.sin(a) * 0.29, 0.025, Math.cos(a) * 0.29, 0.025);
    }
  },
  bookshelf(g) {
    const w = wood('#c9a77a', 'woodPale');
    block(g, w, -0.48, 1.0, 0, 0.04, 2.0, 0.36, 0.01);
    block(g, w, 0.48, 1.0, 0, 0.04, 2.0, 0.36, 0.01);
    block(g, w, 0, 1.0, -0.17, 1.0, 2.0, 0.02, 0.005);
    const bk = new THREE.MeshStandardMaterial({ map: TX.books(), roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
      block(g, w, 0, 0.02 + i * 0.47, 0, 0.96, 0.03, 0.36, 0.008);
      if (i < 4) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.36), bk);
        p.position.set(0, 0.22 + i * 0.47, 0.1);
        g.add(p);
      }
    }
  },
  wardrobe(g) {
    const w = mat(0xe9e6df, { rough: 0.5 });
    block(g, w, 0, 1.05, 0, 1.6, 2.1, 0.6, 0.02);
    block(g, mat(0xb9b5ac), 0, 1.05, 0.302, 0.01, 2.0, 0.01, 0.003);
    for (const x of [-0.08, 0.08]) block(g, METAL(), x, 1.1, 0.315, 0.02, 0.3, 0.02, 0.008);
  },
  wetSign(g) {
    const sgn = new THREE.MeshStandardMaterial({ map: TX.sign('CAUTION\nWET FLOOR', { w: 256, h: 320, bg: '#f2c40c', fg: '#141414', font: 'bold 44px Arial, sans-serif' }), side: THREE.DoubleSide, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.62), sgn);
      p.position.set(0, 0.32, s * 0.09);
      p.rotation.x = s * 0.28;
      if (s < 0) p.rotation.y = Math.PI;
      p.castShadow = true;
      g.add(p);
    }
    block(g, mat(0xf2c40c, { rough: 0.4 }), 0, 0.63, 0, 0.42, 0.03, 0.06, 0.012);
  },
  boxes(g) {
    const card = mat(0xa8875a, { rough: 0.9 });
    block(g, card, 0, 0.25, 0, 0.7, 0.5, 0.6, 0.01);
    block(g, card, 0.05, 0.69, 0.02, 0.55, 0.38, 0.5, 0.01).rotation.y = 0.2;
    block(g, mat(0xd8c9a0, { rough: 0.3 }), 0, 0.502, 0, 0.08, 0.004, 0.6, 0.001);
  },
  price(g, f) {
    cyl(g, METAL(), 0, 0.01, 0, 0.12, 0.02);
    cyl(g, METAL(), 0, 0.45, 0, 0.01, 0.9);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.22),
      new THREE.MeshBasicMaterial({ map: TX.sign(f.text, { w: 256, h: 176, bg: '#fbfbf5', fg: '#b3141b', font: 'bold 62px Arial, sans-serif', border: '#d8d2c0' }), side: THREE.DoubleSide }));
    card.position.y = 0.98;
    g.add(card);
  },
  rug(g, f) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.d), new THREE.MeshStandardMaterial({ map: TX.rugPattern(f.color), roughness: 1 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.006;
    m.receiveShadow = true;
    g.add(m);
  },
  // a framed print on the wall (x, z is the wall face it hangs on)
  art(g, f) {
    block(g, mat(0x2a2420, { rough: 0.5 }), 0, f.y, 0.02, f.w + 0.08, f.h + 0.08, 0.04, 0.01);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h), new THREE.MeshStandardMaterial({ map: TX.painting(f.seed), roughness: 0.6 }));
    p.position.set(0, f.y, 0.041);
    g.add(p);
  },
  pendant(g, f) {
    cyl(g, mat(0x111111), 0, f.h - 0.5, 0, 0.004, 1.0);
    place(g, cachedGeo('pendant', () => new THREE.SphereGeometry(0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), mat(0x1f3b33, { rough: 0.35, metal: 0.3, side: THREE.DoubleSide }), 0, f.h - 1.15, 0);
    ball(g, glow(0xfff0c8, 2.5), 0, f.h - 1.13, 0, 0.06);
  },
  deptSign(g, f) {
    cyl(g, mat(0x111111), -0.6, f.h - 0.25, 0, 0.004, 0.5);
    cyl(g, mat(0x111111), 0.6, f.h - 0.25, 0, 0.004, 0.5);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), new THREE.MeshBasicMaterial({ map: TX.sign(f.text, { w: 512, h: 134, bg: '#1f3b33', fg: '#f4ead2', font: 'bold 58px Georgia, serif' }), side: THREE.DoubleSide }));
    s.position.y = f.h - 0.7;
    g.add(s);
  },
};

export function furniture(f) {
  const g = new THREE.Group();
  build[f.type](g, f);
  g.position.set(f.x, 0, f.z);
  g.rotation.y = f.rot || 0;
  return g;
}

// ---------------------------------------------------------------- people --
export const SHIRTS = [0xb8322a, 0x2f6fb0, 0x2f8a4c, 0xd08a1c];
const SKIN = [0xe0b48f, 0x8d5a3b, 0xc68a62, 0xf1c9a5];
const HAIR = [0x2b1b10, 0x0d0d0d, 0x5a3a1c, 0x8a6a3a];

const torsoGeo = () => cachedGeo('torso', () => {
  const pts = [[0, 0.9], [0.15, 0.91], [0.16, 0.98], [0.165, 1.1], [0.175, 1.22], [0.186, 1.32], [0.19, 1.39], [0.17, 1.45], [0.11, 1.49], [0.06, 1.51], [0, 1.51]];
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 24);
});

// A joint: a group you rotate, holding whatever hangs below it.
function joint(parent, x, y, z = 0) {
  const j = new THREE.Group();
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

// A store employee: polo shirt in the player's colour, khakis, a name tag.
export function person(colorIndex) {
  const i = colorIndex % 4;
  const root = new THREE.Group();
  const body = new THREE.Group(); // pivots at the feet: tilts when they fall
  root.add(body);
  const shirt = mat(SHIRTS[i], { rough: 0.85 });
  const collar = mat(new THREE.Color(SHIRTS[i]).multiplyScalar(0.8).getHex(), { rough: 0.85 });
  const pants = mat(0xb39b72, { rough: 0.9 });
  const skin = mat(SKIN[i], { rough: 0.55 });
  const hair = mat(HAIR[i], { rough: 0.7 });
  const shoe = mat(0x1c1c1c, { rough: 0.45 });

  // legs: hip, knee, foot
  const leg = (side) => {
    const hip = joint(body, side * 0.09, 0.89);
    place(hip, capsule(0.075, 0.27), pants, 0, -0.21, 0);
    const knee = joint(hip, 0, -0.42);
    place(knee, capsule(0.058, 0.3), pants, 0, -0.2, 0);
    block(knee, shoe, 0, -0.43, 0.05, 0.11, 0.07, 0.26, 0.032);
    return { hip, knee };
  };
  const legL = leg(-1), legR = leg(1);

  // hips and torso
  ball(body, pants, 0, 0.93, 0, 0.17, 0.11, 0.12);
  const belt = cyl(body, mat(0x2a1f17, { rough: 0.5 }), 0, 0.955, 0, 0.162, 0.035);
  belt.scale.z = 0.1;
  const torso = place(body, torsoGeo(), shirt, 0, 0, 0);
  torso.scale.z = 0.62;
  const ring = place(body, cachedGeo('collar', () => new THREE.TorusGeometry(0.07, 0.018, 8, 20)), collar, 0, 1.5, 0.005);
  ring.rotation.x = Math.PI / 2;
  ring.scale.y = 0.8;
  block(body, collar, 0, 1.43, 0.112, 0.03, 0.11, 0.006, 0.002);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.03), mat(0xf4f4f0, { rough: 0.4 }));
  tag.position.set(0.085, 1.33, 0.117);
  body.add(tag);
  cyl(body, skin, 0, 1.54, 0, 0.047, 0.1);

  // arms: shoulder, elbow, hand
  const arm = (side) => {
    ball(body, shirt, side * 0.19, 1.42, 0, 0.068);
    const shoulder = joint(body, side * 0.215, 1.41);
    shoulder.rotation.z = side * 0.06;
    place(shoulder, capsule(0.043, 0.2), skin, 0, -0.14, 0);
    place(shoulder, cachedGeo('sleeve', () => new THREE.CylinderGeometry(0.062, 0.057, 0.15, 16)), shirt, 0, -0.06, 0);
    const elbow = joint(shoulder, 0, -0.28);
    elbow.rotation.x = -0.15;
    place(elbow, capsule(0.037, 0.19), skin, 0, -0.13, 0);
    ball(elbow, skin, 0, -0.29, 0.005, 0.038, 0.055, 0.024);
    return { shoulder, elbow };
  };
  const armL = arm(-1), armR = arm(1);

  // head and face
  const head = joint(body, 0, 1.585);
  ball(head, skin, 0, 0.11, 0, 0.104, 0.125, 0.112);
  for (const s of [-1, 1]) {
    ball(head, skin, s * 0.102, 0.105, -0.005, 0.016, 0.03, 0.012);
    ball(head, mat(0xf6f6f2, { rough: 0.2 }), s * 0.037, 0.12, 0.093, 0.017, 0.013, 0.01);
    ball(head, mat(0x1d140e, { rough: 0.2 }), s * 0.037, 0.12, 0.103, 0.008);
    const brow = block(head, hair, s * 0.038, 0.148, 0.1, 0.038, 0.008, 0.01, 0.003);
    brow.rotation.z = s * -0.12;
  }
  ball(head, mat(new THREE.Color(SKIN[i]).multiplyScalar(0.92).getHex(), { rough: 0.55 }), 0, 0.095, 0.112, 0.016, 0.026, 0.02);
  block(head, mat(0x6e2f2a, { rough: 0.5 }), 0, 0.055, 0.103, 0.042, 0.008, 0.01, 0.003);
  const capArc = [0.52, 0.52, 0.45, 0.6][i];
  const cap = place(head, cachedGeo(`hair${i}`, () => new THREE.SphereGeometry(i === 3 ? 0.125 : 0.116, 28, 14, 0, Math.PI * 2, 0, Math.PI * capArc)), hair, 0, 0.12, -0.006);
  cap.scale.set(1.0, 1.06, 1.06);
  cap.rotation.x = -0.32;
  if (i === 1) {
    const tail = place(head, capsule(0.034, 0.13), hair, 0, 0.06, -0.135);
    tail.rotation.x = 0.35;
  }
  if (i === 3) for (const [x, z] of [[-0.07, -0.06], [0.07, -0.06], [0, -0.1]]) ball(head, hair, x, 0.17, z, 0.06);

  root.userData = { body, head, legL, legR, armL, armR, phase: 0 };
  return root;
}

const ease = (cur, target, k) => cur + (target - cur) * k;

// walk cycle with bending knees and elbows; `speed` in m/s
export function animatePerson(p, speed, dt, pitch = 0) {
  const u = p.userData;
  const moving = speed > 0.15;
  if (moving) u.phase += dt * (2.0 + speed * 1.9);
  const amp = moving ? Math.min(0.62, 0.15 + speed * 0.16) : 0;
  const s = Math.sin(u.phase), c = Math.cos(u.phase);
  const k = moving ? 1 : 1 - Math.exp(-dt * 8);
  u.legL.hip.rotation.x = ease(u.legL.hip.rotation.x, -s * amp, k);
  u.legR.hip.rotation.x = ease(u.legR.hip.rotation.x, s * amp, k);
  u.legL.knee.rotation.x = ease(u.legL.knee.rotation.x, Math.max(0, c) * amp * 1.5, k);
  u.legR.knee.rotation.x = ease(u.legR.knee.rotation.x, Math.max(0, -c) * amp * 1.5, k);
  u.armL.shoulder.rotation.x = ease(u.armL.shoulder.rotation.x, s * amp * 0.75, k);
  u.armR.shoulder.rotation.x = ease(u.armR.shoulder.rotation.x, -s * amp * 0.75, k);
  u.armL.elbow.rotation.x = ease(u.armL.elbow.rotation.x, -0.15 - Math.max(0, s) * amp * 0.6, k);
  u.armR.elbow.rotation.x = ease(u.armR.elbow.rotation.x, -0.15 - Math.max(0, -s) * amp * 0.6, k);
  u.head.rotation.x = -pitch * 0.6;
  u.body.position.y = moving ? Math.abs(c) * amp * 0.05 : 0;
}

// ---------------------------------------------------------------- entity --
// Tall, thin and too dark to make out, except for its eyes.
const entityTorso = () => cachedGeo('entityTorso', () => {
  const pts = [[0, 0], [0.11, 0.02], [0.1, 0.3], [0.14, 0.6], [0.16, 0.72], [0.1, 0.82], [0.035, 0.86], [0, 0.86]];
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 18);
});

export function entity() {
  const root = new THREE.Group();
  const black = new THREE.MeshBasicMaterial({ color: 0x030303, fog: false });
  const body = new THREE.Group();
  root.add(body);
  const bone = (parent, r, len, y) => {
    const m = new THREE.Mesh(capsule(r, len), black);
    m.position.y = y;
    parent.add(m);
  };
  const leg = (side) => {
    const hip = joint(body, side * 0.1, 1.24);
    bone(hip, 0.045, 0.52, -0.31);
    const knee = joint(hip, 0, -0.62);
    bone(knee, 0.034, 0.52, -0.3);
    const foot = new THREE.Mesh(capsule(0.03, 0.16), black);
    foot.rotation.x = Math.PI / 2;
    foot.position.set(0, -0.6, 0.06);
    knee.add(foot);
    return { hip, knee };
  };
  const legL = leg(-1), legR = leg(1);
  const torso = joint(body, 0, 1.2);
  const t = new THREE.Mesh(entityTorso(), black);
  t.scale.z = 0.5;
  torso.add(t);
  bone(torso, 0.028, 0.12, 0.93);
  const arm = (side) => {
    const shoulder = joint(torso, side * 0.17, 0.76);
    bone(shoulder, 0.03, 0.54, -0.3);
    const elbow = joint(shoulder, 0, -0.6);
    bone(elbow, 0.026, 0.54, -0.3);
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(capsule(0.009, 0.17), black);
      finger.position.set((f - 1.5) * 0.018, -0.7, 0);
      finger.rotation.z = (f - 1.5) * 0.05;
      elbow.add(finger);
    }
    return { shoulder, elbow };
  };
  const armL = arm(-1), armR = arm(1);
  const head = joint(torso, 0, 1.0);
  const skull = new THREE.Mesh(ballGeo, black);
  skull.scale.set(0.085, 0.15, 0.1);
  skull.position.y = 0.13;
  head.add(skull);
  const eye = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  for (const x of [-0.035, 0.035]) {
    const e = new THREE.Mesh(ballGeo, eye);
    e.scale.set(0.014, 0.008, 0.006);
    e.position.set(x, 0.16, 0.093);
    head.add(e);
  }
  root.userData = { body, legL, legR, armL, armR, head, torso, phase: 0, twitch: 0 };
  return root;
}

export function animateEntity(e, speed, dt, t) {
  const u = e.userData;
  u.phase += dt * (1.3 + speed * 1.1);
  const amp = Math.min(0.55, 0.12 + speed * 0.11);
  const s = Math.sin(u.phase), c = Math.cos(u.phase);
  u.legL.hip.rotation.x = -s * amp;
  u.legR.hip.rotation.x = s * amp;
  u.legL.knee.rotation.x = Math.max(0, c) * amp * 1.6;
  u.legR.knee.rotation.x = Math.max(0, -c) * amp * 1.6;
  u.armL.shoulder.rotation.x = s * amp * 0.5 + Math.sin(t * 1.3) * 0.05;
  u.armR.shoulder.rotation.x = -s * amp * 0.5 + Math.sin(t * 1.1 + 1) * 0.05;
  u.armL.shoulder.rotation.z = -0.07;
  u.armR.shoulder.rotation.z = 0.07;
  u.armL.elbow.rotation.x = -0.25 + Math.sin(t * 0.9) * 0.08;
  u.armR.elbow.rotation.x = -0.3 + Math.sin(t * 0.7 + 2) * 0.08;
  u.torso.rotation.x = 0.16 + speed * 0.03;
  // sudden head jerks
  u.twitch -= dt;
  if (u.twitch <= 0) {
    u.twitch = 0.2 + Math.random() * 1.8;
    u.head.rotation.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.8);
  }
}

// ------------------------------------------------------------ level props --
export function almondWater() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0xe8f2f4, transparent: true, opacity: 0.7, roughness: 0.1, emissive: 0x303838 });
  place(g, cachedGeo('bottle', () => new THREE.LatheGeometry([0.05, 0.055, 0.055, 0.055, 0.045, 0.024, 0.022].map((r, i) => new THREE.Vector2(r, [0, 0.01, 0.15, 0.22, 0.26, 0.3, 0.33][i])), 20)), glass, 0, 0, 0);
  cyl(g, mat(0x6b8fb3, { rough: 0.4 }), 0, 0.34, 0, 0.025, 0.03);
  const label = new THREE.Mesh(cachedGeo('label', () => new THREE.CylinderGeometry(0.057, 0.057, 0.1, 20, 1, true)), new THREE.MeshStandardMaterial({ map: TX.almondLabel(), emissive: 0x222222, roughness: 0.6 }));
  label.position.y = 0.11;
  g.add(label);
  g.scale.setScalar(1.25);
  return g;
}

export function exitDoor() {
  const g = new THREE.Group();
  block(g, mat(0x5d5d58, { rough: 0.5, metal: 0.3 }), 0, 1.08, 0.02, 1.2, 2.16, 0.06, 0.01);
  block(g, mat(0x8d8e88, { rough: 0.45, metal: 0.4 }), 0, 1.03, 0.06, 1.02, 2.04, 0.04, 0.01);
  block(g, mat(0xb9b9b2, { rough: 0.3, metal: 0.8 }), 0, 1.0, 0.1, 0.8, 0.07, 0.06, 0.02);
  const sgn = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.22),
    new THREE.MeshBasicMaterial({ map: TX.sign('EXIT', { w: 256, h: 96, bg: '#1a0303', fg: '#ff2a1a', font: 'bold 70px Arial, sans-serif' }), fog: false }));
  sgn.position.set(0, 2.38, 0.08);
  g.add(sgn);
  block(g, mat(0x2a2a2a), 0, 2.38, 0.04, 0.68, 0.28, 0.06, 0.01);
  return g;
}

export function arrowDecal() {
  return new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshLambertMaterial({ map: TX.arrowDecal(), transparent: true, depthWrite: false }));
}
