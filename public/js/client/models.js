// Low-poly models built from primitives: store furniture, the people, the
// entity, almond water and the exit door. Furniture faces +z with its origin
// on the floor at its centre.

import * as THREE from 'three';
import * as TX from './textures.js';

const mats = new Map();
function lambert(color, opts = {}) {
  const key = `${color}:${opts.map ? opts.map.uuid : ''}:${opts.emissive || ''}:${opts.transparent ? opts.opacity : ''}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return mats.get(key);
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14);

function add(group, geo, mat, x, y, z, sx, sy, sz, ry = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.y = ry;
  group.add(m);
  return m;
}
const cube = (g, mat, x, y, z, w, h, d) => add(g, boxGeo, mat, x, y, z, w, h, d);
const cyl = (g, mat, x, y, z, r, h) => add(g, cylGeo, mat, x, y, z, r, h, r);

function legs(g, mat, w, d, h, inset = 0.06, r = 0.025) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, mat, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset), r, h);
}

const DARK = 0x2a211b;

// ------------------------------------------------------------- furniture --
const build = {
  sofa(g, f) {
    const cloth = lambert(f.color, { map: TX.fabric() });
    cube(g, cloth, 0, 0.27, 0, 2.3, 0.3, 0.95);
    for (const x of [-0.56, 0.56]) cube(g, cloth, x, 0.5, 0.08, 1.08, 0.16, 0.76);
    cube(g, cloth, 0, 0.66, -0.36, 2.3, 0.62, 0.24);
    for (const x of [-1.04, 1.04]) cube(g, cloth, x, 0.42, 0, 0.22, 0.42, 0.95);
    legs(g, lambert(DARK), 2.2, 0.85, 0.12, 0.05, 0.03);
  },
  armchair(g, f) {
    const cloth = lambert(f.color, { map: TX.fabric() });
    cube(g, cloth, 0, 0.27, 0, 1.0, 0.3, 0.95);
    cube(g, cloth, 0, 0.5, 0.08, 0.6, 0.16, 0.76);
    cube(g, cloth, 0, 0.7, -0.36, 1.0, 0.7, 0.24);
    for (const x of [-0.4, 0.4]) cube(g, cloth, x, 0.45, 0, 0.2, 0.45, 0.95);
    legs(g, lambert(DARK), 0.9, 0.85, 0.12, 0.05, 0.03);
  },
  coffeeTable(g) {
    const w = lambert(0xffffff, { map: TX.wood('#7a5032', 'woodMid') });
    cube(g, w, 0, 0.42, 0, 1.2, 0.05, 0.65);
    cube(g, w, 0, 0.14, 0, 1.1, 0.03, 0.55);
    legs(g, w, 1.2, 0.65, 0.4, 0.06, 0.03);
  },
  floorLamp(g) {
    const metal = lambert(0x3a3a3a);
    cyl(g, metal, 0, 0.02, 0, 0.17, 0.04);
    cyl(g, metal, 0, 0.8, 0, 0.015, 1.6);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 16, 1, true),
      lambert(0xf3e3c0, { emissive: 0xffd9a0, emissiveIntensity: 0.8, side: THREE.DoubleSide }));
    shade.position.y = 1.62;
    g.add(shade);
  },
  tvStand(g) {
    cube(g, lambert(0xffffff, { map: TX.wood('#3b2a20', 'woodDark') }), 0, 0.25, 0, 1.8, 0.5, 0.45);
    cube(g, lambert(0x111111), 0, 0.55, 0, 0.3, 0.06, 0.2);
    cube(g, lambert(0x0c0c0c), 0, 0.98, 0, 1.3, 0.76, 0.05);
    cube(g, new THREE.MeshPhongMaterial({ color: 0x050608, specular: 0x333333, shininess: 60 }), 0, 0.98, 0.027, 1.24, 0.7, 0.01);
  },
  plant(g) {
    cyl(g, lambert(0xa65d3a), 0, 0.18, 0, 0.2, 0.36);
    const leaf = lambert(0x3f6e33);
    const leaf2 = lambert(0x58893f);
    const geo = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      const m = new THREE.Mesh(geo, i % 2 ? leaf : leaf2);
      m.position.set(Math.cos(a) * 0.14, 0.55 + (i % 3) * 0.17, Math.sin(a) * 0.14);
      m.scale.set(0.2, 0.28, 0.2);
      m.rotation.set(a, a * 0.5, 0);
      g.add(m);
    }
  },
  bed(g, f) {
    const wd = lambert(0xffffff, { map: TX.wood('#6e4a2e', 'woodBed') });
    cube(g, wd, 0, 0.2, 0, 1.75, 0.3, 2.15);
    cube(g, lambert(0xf4f1ea, { map: TX.fabric() }), 0, 0.46, 0, 1.65, 0.24, 2.05);
    cube(g, lambert(f.color, { map: TX.fabric() }), 0, 0.6, 0.3, 1.72, 0.06, 1.45);
    for (const x of [-0.42, 0.42]) cube(g, lambert(0xffffff, { map: TX.fabric() }), x, 0.64, -0.78, 0.62, 0.14, 0.38);
    cube(g, wd, 0, 0.6, -1.07, 1.8, 1.2, 0.08);
  },
  nightstand(g) {
    const wd = lambert(0xffffff, { map: TX.wood('#6e4a2e', 'woodBed') });
    cube(g, wd, 0, 0.27, 0, 0.5, 0.54, 0.45);
    cube(g, lambert(0x2b1d12), 0, 0.38, 0.226, 0.4, 0.015, 0.01);
    cyl(g, lambert(0xd0c8b8), 0, 0.62, 0, 0.06, 0.16);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.16, 12, 1, true),
      lambert(0xf3e3c0, { emissive: 0xffd9a0, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
    shade.position.y = 0.78;
    g.add(shade);
  },
  dresser(g) {
    const wd = lambert(0xffffff, { map: TX.wood('#a77b52', 'woodLight') });
    cube(g, wd, 0, 0.45, 0, 1.4, 0.85, 0.5);
    for (let i = 0; i < 3; i++) {
      cube(g, wd, 0, 0.2 + i * 0.26, 0.26, 1.3, 0.22, 0.03);
      cube(g, lambert(0x2b2b2b), 0, 0.2 + i * 0.26, 0.285, 0.2, 0.025, 0.02);
    }
  },
  diningTable(g) {
    const wd = lambert(0xffffff, { map: TX.wood('#8a5a35', 'wood') });
    cube(g, wd, 0, 0.74, 0, 1.8, 0.05, 0.95);
    legs(g, wd, 1.8, 0.95, 0.72, 0.08, 0.035);
  },
  chair(g) {
    const wd = lambert(0xffffff, { map: TX.wood('#8a5a35', 'wood') });
    cube(g, wd, 0, 0.46, 0, 0.45, 0.05, 0.45);
    legs(g, wd, 0.45, 0.45, 0.44, 0.04, 0.02);
    cube(g, wd, 0, 0.78, -0.2, 0.45, 0.5, 0.04);
  },
  sideboard(g) {
    const wd = lambert(0xffffff, { map: TX.wood('#3b2a20', 'woodDark') });
    cube(g, wd, 0, 0.42, 0, 2.0, 0.78, 0.48);
    for (const x of [-0.5, 0.5]) cube(g, lambert(0x6b6b6b), x, 0.5, 0.25, 0.02, 0.18, 0.02);
    cyl(g, lambert(0xc9c2b5), -0.6, 0.93, 0, 0.08, 0.24);
  },
  counter(g) {
    cube(g, lambert(0xe8e4dc), 0, 0.52, 0, 3.6, 1.04, 0.9);
    cube(g, lambert(0x4a4038), 0, 1.06, 0, 3.7, 0.04, 1.0);
    cube(g, lambert(0x222222), 0.8, 1.16, 0, 0.4, 0.16, 0.35);
    const scr = cube(g, lambert(0x1c2a22, { emissive: 0x1d5c3a, emissiveIntensity: 0.6 }), 0.8, 1.38, -0.05, 0.36, 0.26, 0.04);
    scr.rotation.x = -0.25;
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: TX.sign('CHECKOUT', { w: 512, h: 128, bg: '#7b1e1e' }) }));
    tag.position.set(0, 0.75, 0.452);
    g.add(tag);
  },
  desk(g) {
    const wd = lambert(0xffffff, { map: TX.wood('#a77b52', 'woodLight') });
    cube(g, wd, 0, 0.75, 0, 1.4, 0.04, 0.7);
    for (const x of [-0.67, 0.67]) cube(g, wd, x, 0.37, 0, 0.04, 0.74, 0.68);
    cube(g, lambert(0x1a1a1a), 0.2, 0.96, -0.15, 0.55, 0.36, 0.04);
    cube(g, lambert(0x1a1a1a), 0.2, 0.8, -0.15, 0.06, 0.1, 0.06);
  },
  officeChair(g) {
    const blk = lambert(0x1e1e1e);
    cube(g, blk, 0, 0.48, 0, 0.5, 0.08, 0.5);
    cube(g, blk, 0, 0.85, -0.23, 0.46, 0.62, 0.06);
    cyl(g, lambert(0x777777), 0, 0.26, 0, 0.03, 0.42);
    for (let i = 0; i < 5; i++) add(g, boxGeo, blk, 0, 0.04, 0, 0.05, 0.04, 0.6, (i * Math.PI * 2) / 5);
  },
  bookshelf(g) {
    const wd = lambert(0xffffff, { map: TX.wood('#c9a77a', 'woodPale') });
    cube(g, wd, -0.48, 1.0, 0, 0.04, 2.0, 0.36);
    cube(g, wd, 0.48, 1.0, 0, 0.04, 2.0, 0.36);
    cube(g, wd, 0, 1.0, -0.17, 1.0, 2.0, 0.02);
    const bk = new THREE.MeshLambertMaterial({ map: TX.books() });
    for (let i = 0; i < 5; i++) {
      cube(g, wd, 0, 0.02 + i * 0.47, 0, 0.96, 0.03, 0.36);
      if (i < 4) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.36), bk);
        p.position.set(0, 0.22 + i * 0.47, 0.1);
        g.add(p);
      }
    }
  },
  wardrobe(g) {
    const w = lambert(0xe9e6df);
    cube(g, w, 0, 1.05, 0, 1.6, 2.1, 0.6);
    cube(g, lambert(0xb9b5ac), 0, 1.05, 0.302, 0.01, 2.0, 0.01);
    for (const x of [-0.08, 0.08]) cube(g, lambert(0x6b6b6b), x, 1.1, 0.31, 0.02, 0.3, 0.02);
  },
  wetSign(g) {
    const sgn = new THREE.MeshLambertMaterial({ map: TX.sign('CAUTION\nWET FLOOR', { w: 256, h: 320, bg: '#f2c40c', fg: '#141414', font: 'bold 44px Arial, sans-serif' }), side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.62), sgn);
      p.position.set(0, 0.32, s * 0.09);
      p.rotation.x = s * 0.28;
      if (s < 0) p.rotation.y = Math.PI;
      g.add(p);
    }
  },
  boxes(g) {
    const card = lambert(0xa8875a);
    cube(g, card, 0, 0.25, 0, 0.7, 0.5, 0.6);
    cube(g, card, 0.05, 0.69, 0.02, 0.55, 0.38, 0.5).rotation.y = 0.2;
    cube(g, lambert(0xd8c9a0), 0, 0.501, 0, 0.08, 0.002, 0.6);
  },
  price(g, f) {
    cyl(g, lambert(0x888888), 0, 0.01, 0, 0.12, 0.02);
    cyl(g, lambert(0x888888), 0, 0.45, 0, 0.012, 0.9);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.22),
      new THREE.MeshBasicMaterial({ map: TX.sign(f.text, { w: 256, h: 176, bg: '#fbfbf5', fg: '#b3141b', font: 'bold 62px Arial, sans-serif', border: '#d8d2c0' }), side: THREE.DoubleSide }));
    card.position.y = 0.98;
    g.add(card);
  },
  rug(g, f) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.d), new THREE.MeshLambertMaterial({ map: TX.rugPattern(f.color) }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.006;
    g.add(m);
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

// A store employee: polo shirt in the player's colour, khakis, a name tag.
export function person(colorIndex) {
  const root = new THREE.Group();
  const body = new THREE.Group();     // tilts as a whole when they slip
  root.add(body);
  const shirt = lambert(SHIRTS[colorIndex % SHIRTS.length]);
  const pants = lambert(0xb7a07a);
  const skinTones = [0xe0b48f, 0x8d5a3b, 0xc68a62, 0xf1c9a5];
  const skin = lambert(skinTones[colorIndex % skinTones.length]);
  const hair = lambert([0x2b1b10, 0x0d0d0d, 0x5a3a1c, 0x8a6a3a][colorIndex % 4]);
  const shoe = lambert(0x1a1a1a);

  const limb = (mat, w, h, d, px, py) => {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, 0);
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.y = -h / 2;
    pivot.add(m);
    body.add(pivot);
    return pivot;
  };
  const legL = limb(pants, 0.17, 0.86, 0.19, -0.11, 0.88);
  const legR = limb(pants, 0.17, 0.86, 0.19, 0.11, 0.88);
  for (const leg of [legL, legR]) {
    const s = new THREE.Mesh(boxGeo, shoe);
    s.scale.set(0.18, 0.08, 0.28);
    s.position.set(0, -0.84, 0.04);
    leg.add(s);
  }
  cube(body, shirt, 0, 1.2, 0, 0.46, 0.62, 0.25);
  cube(body, lambert(0xf2f2f2), 0.12, 1.37, 0.127, 0.1, 0.05, 0.005);
  const armL = limb(shirt, 0.13, 0.62, 0.15, -0.3, 1.48);
  const armR = limb(shirt, 0.13, 0.62, 0.15, 0.3, 1.48);
  for (const arm of [armL, armR]) {
    const h = new THREE.Mesh(boxGeo, skin);
    h.scale.set(0.11, 0.14, 0.12);
    h.position.y = -0.66;
    arm.add(h);
  }
  const head = new THREE.Group();
  head.position.y = 1.6;
  body.add(head);
  cube(head, skin, 0, 0.12, 0, 0.24, 0.27, 0.25);
  cube(head, hair, 0, 0.27, -0.02, 0.26, 0.07, 0.27);
  cube(head, hair, 0, 0.17, -0.12, 0.26, 0.2, 0.05);
  for (const x of [-0.055, 0.055]) cube(head, lambert(0x111111), x, 0.14, 0.126, 0.03, 0.03, 0.01);

  root.userData = { body, legL, legR, armL, armR, head, phase: 0 };
  return root;
}

// walk cycle; `speed` in m/s
export function animatePerson(p, speed, dt, pitch = 0) {
  const u = p.userData;
  u.phase += dt * (2.2 + speed * 1.9) * (speed > 0.15 ? 1 : 0);
  const amp = Math.min(0.75, speed * 0.17);
  const s = Math.sin(u.phase) * amp;
  u.legL.rotation.x = s;
  u.legR.rotation.x = -s;
  u.armL.rotation.x = -s * 0.8;
  u.armR.rotation.x = s * 0.8;
  if (speed < 0.15) {
    for (const k of ['legL', 'legR', 'armL', 'armR']) u[k].rotation.x *= Math.max(0, 1 - dt * 8);
  }
  u.head.rotation.x = -pitch * 0.6;
  u.body.position.y = Math.abs(Math.cos(u.phase)) * amp * 0.06;
}

// ---------------------------------------------------------------- entity --
// Tall, thin and too dark to make out, except for its eyes.
export function entity() {
  const root = new THREE.Group();
  const black = new THREE.MeshBasicMaterial({ color: 0x030303, fog: false });
  const body = new THREE.Group();
  root.add(body);
  const part = (parent, w, h, d, x, y, z) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(boxGeo, black);
    m.scale.set(w, h, d);
    m.position.y = -h / 2;
    pivot.add(m);
    parent.add(pivot);
    return pivot;
  };
  const legL = part(body, 0.11, 1.2, 0.12, -0.12, 1.2, 0);
  const legR = part(body, 0.11, 1.2, 0.12, 0.12, 1.2, 0);
  const torso = new THREE.Group();
  torso.position.y = 1.2;
  body.add(torso);
  cube(torso, black, 0, 0.45, 0, 0.36, 0.9, 0.18);
  const armL = part(torso, 0.08, 1.4, 0.08, -0.25, 0.85, 0);
  const armR = part(torso, 0.08, 1.4, 0.08, 0.25, 0.85, 0);
  for (const arm of [armL, armR]) {
    for (let f = 0; f < 3; f++) cube(arm, black, (f - 1) * 0.03, -1.52, 0, 0.018, 0.22, 0.018);
  }
  const head = new THREE.Group();
  head.position.y = 0.92;
  torso.add(head);
  cube(head, black, 0, 0.18, 0, 0.22, 0.36, 0.24);
  const eye = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  for (const x of [-0.055, 0.055]) cube(head, eye, x, 0.22, 0.121, 0.035, 0.022, 0.01);
  root.userData = { body, legL, legR, armL, armR, head, torso, phase: 0, twitch: 0 };
  return root;
}

export function animateEntity(e, speed, dt, t) {
  const u = e.userData;
  u.phase += dt * (1.4 + speed * 1.2);
  const s = Math.sin(u.phase) * Math.min(0.6, 0.1 + speed * 0.12);
  u.legL.rotation.x = s;
  u.legR.rotation.x = -s;
  u.armL.rotation.x = -s * 0.5 + Math.sin(t * 1.3) * 0.05;
  u.armR.rotation.x = s * 0.5 + Math.sin(t * 1.1 + 1) * 0.05;
  u.armL.rotation.z = -0.06;
  u.armR.rotation.z = 0.06;
  u.torso.rotation.x = 0.12 + speed * 0.03;
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
  const glass = new THREE.MeshLambertMaterial({ color: 0xe8f2f4, transparent: true, opacity: 0.75, emissive: 0x404848 });
  cyl(g, glass, 0, 0.13, 0, 0.055, 0.26);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.055, 0.06, 12), glass);
  neck.position.y = 0.29;
  g.add(neck);
  cyl(g, lambert(0x6b8fb3), 0, 0.335, 0, 0.024, 0.03);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.057, 0.11, 16, 1, true), new THREE.MeshLambertMaterial({ map: TX.almondLabel(), emissive: 0x222222 }));
  label.position.y = 0.13;
  g.add(label);
  g.scale.setScalar(1.25);
  return g;
}

export function exitDoor() {
  const g = new THREE.Group();
  const frame = lambert(0x5d5d58);
  cube(g, frame, 0, 1.08, 0.02, 1.2, 2.16, 0.06);
  cube(g, lambert(0x8d8e88), 0, 1.03, 0.06, 1.02, 2.04, 0.04);
  cube(g, lambert(0xb9b9b2), 0, 1.0, 0.1, 0.8, 0.07, 0.06);
  const sgn = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.22),
    new THREE.MeshBasicMaterial({ map: TX.sign('EXIT', { w: 256, h: 96, bg: '#1a0303', fg: '#ff2a1a', font: 'bold 70px Arial, sans-serif' }), fog: false }));
  sgn.position.set(0, 2.38, 0.08);
  g.add(sgn);
  cube(g, lambert(0x2a2a2a), 0, 2.38, 0.04, 0.68, 0.28, 0.06);
  return g;
}

export function arrowDecal() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshLambertMaterial({ map: TX.arrowDecal(), transparent: true, depthWrite: false }));
  return m;
}
