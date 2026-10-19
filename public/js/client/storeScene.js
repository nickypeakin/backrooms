// The furniture store, after closing, where the opening cutscene plays out:
// a polished showroom, a dim back hallway, and the spot on the hallway wall
// that stops being solid.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { furniture } from './models.js';
import { FURNITURE, SHOWROOM, HALL, BACK_DOOR, SPILL, HOLE } from '../shared/store.js';
import { STORE_H, HALL_H } from '../shared/config.js';

// Bake a group of static meshes into one mesh per material: hundreds of
// cushions, legs and leaves become a handful of draw calls.
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  const out = new THREE.Group();
  for (const [material, list] of byMat) {
    const merged = new THREE.Mesh(mergeGeometries(list), material);
    merged.castShadow = merged.receiveShadow = true;
    out.add(merged);
    for (const g of list) g.dispose();
  }
  return out;
}

function tiled(tex, rx, ry) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

const holeShader = {
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D map;
    uniform float time, open;
    varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      float row = floor(uv.y * 48.0);
      float tick = floor(time * 14.0);
      float shift = (h(vec2(row, tick)) - 0.5) * 0.22;
      vec3 beyond = texture2D(map, vec2(uv.x * 1.4 + shift + time * 0.03, uv.y * 1.9)).rgb;
      float n = h(uv * vec2(90.0, 140.0) + tick);
      vec2 c = (uv - 0.5) * 2.0;
      float r = length(c * vec2(1.0, 0.82));
      float ragged = 0.5 + 0.3 * h(vec2(row, floor(time * 9.0)));
      float edge = smoothstep(1.0, ragged, r);
      vec3 col = mix(vec3(n * 0.9), beyond * 1.6, 0.75);
      col += vec3(0.25, 0.22, 0.06) * step(0.9, h(vec2(floor(time * 5.0), 3.0)));
      gl_FragColor = vec4(col, edge * open * (0.7 + 0.3 * n));
      #include <colorspace_fragment>
    }
  `,
};

export class StoreView {
  constructor(renderer) {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x07080a);
    this.flickers = [];

    // soft, even light bouncing around a big white room
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    s.environment = this.env;
    s.environmentIntensity = 0.55;

    const std = (o) => new THREE.MeshStandardMaterial(o);
    const W = SHOWROOM.x1 - SHOWROOM.x0, D = SHOWROOM.z1 - SHOWROOM.z0;
    const hallLen = HALL.z1 - HALL.z0, hallW = HALL.x1 - HALL.x0;
    const plane = (w, d, m, x, y, z, rx) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
      p.rotation.x = rx;
      p.position.set(x, y, z);
      p.receiveShadow = true;
      s.add(p);
      return p;
    };

    // ------------------------------------------------------------- shell
    plane(W, D, std({ map: tiled(TX.storeFloor(), W / 2.4, D / 2.4), roughness: 0.2 }), 0, 0, 0, -Math.PI / 2);
    plane(hallW, hallLen, std({ map: tiled(TX.concrete(), hallW / 2, hallLen / 2), roughness: 0.55 }), 0, 0.001, (HALL.z0 + HALL.z1) / 2, -Math.PI / 2);
    plane(W, D, std({ map: tiled(TX.ceilingTile('#f1efe8', 'storeCeilTile'), W / 1.2, D / 1.2), roughness: 0.95 }), 0, STORE_H, 0, Math.PI / 2);
    plane(hallW, hallLen, std({ color: 0x9c978c, roughness: 0.95 }), 0, HALL_H, (HALL.z0 + HALL.z1) / 2, Math.PI / 2);

    const wallMat = std({ map: TX.plainWall('#efeae0', 'storeWall'), roughness: 0.92 });
    const accentWall = std({ map: TX.plainWall('#2f4a3f', 'storeAccent'), roughness: 0.9 });
    const trim = std({ color: 0x4a3b2e, roughness: 0.5 });
    const wall = (x0, x1, z0, z1, y0, y1, m = wallMat) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
      b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      b.receiveShadow = true;
      s.add(b);
      return b;
    };
    const T = 0.3;
    wall(SHOWROOM.x0 - T, SHOWROOM.x0, SHOWROOM.z0, SHOWROOM.z1, 0, STORE_H);
    wall(SHOWROOM.x1, SHOWROOM.x1 + T, SHOWROOM.z0, SHOWROOM.z1, 0, STORE_H);
    wall(SHOWROOM.x0, BACK_DOOR.x0, SHOWROOM.z0 - T, SHOWROOM.z0, 0, STORE_H, accentWall);
    wall(BACK_DOOR.x1, SHOWROOM.x1, SHOWROOM.z0 - T, SHOWROOM.z0, 0, STORE_H, accentWall);
    wall(BACK_DOOR.x0, BACK_DOOR.x1, SHOWROOM.z0 - T, SHOWROOM.z0, 2.2, STORE_H, accentWall);
    // baseboards and a door frame
    wall(SHOWROOM.x0, SHOWROOM.x0 + 0.02, SHOWROOM.z0, SHOWROOM.z1, 0, 0.12, trim);
    wall(SHOWROOM.x1 - 0.02, SHOWROOM.x1, SHOWROOM.z0, SHOWROOM.z1, 0, 0.12, trim);
    wall(SHOWROOM.x0, BACK_DOOR.x0, SHOWROOM.z0, SHOWROOM.z0 + 0.02, 0, 0.12, trim);
    wall(BACK_DOOR.x1, SHOWROOM.x1, SHOWROOM.z0, SHOWROOM.z0 + 0.02, 0, 0.12, trim);
    for (const x of [BACK_DOOR.x0 - 0.04, BACK_DOOR.x1 + 0.04]) wall(x - 0.04, x + 0.04, SHOWROOM.z0 - 0.02, SHOWROOM.z0 + 0.04, 0, 2.24, trim);
    wall(BACK_DOOR.x0 - 0.08, BACK_DOOR.x1 + 0.08, SHOWROOM.z0 - 0.02, SHOWROOM.z0 + 0.04, 2.2, 2.28, trim);

    // the hallway: painted block walls
    const block = std({ map: tiled(TX.blockWall(), hallLen / 1.6, HALL_H / 0.8), roughness: 0.95 });
    wall(HALL.x0 - T, HALL.x0, HALL.z0, SHOWROOM.z0 - T, 0, HALL_H, block);
    wall(HALL.x1, HALL.x1 + T, HALL.z0, SHOWROOM.z0 - T, 0, HALL_H, block);
    wall(HALL.x0 - T, HALL.x1 + T, HALL.z0 - T, HALL.z0, 0, HALL_H, block);

    // storefront: glass between a low wall and the header, night outside
    const zf = SHOWROOM.z1;
    wall(SHOWROOM.x0, SHOWROOM.x1, zf, zf + T, 0, 0.5);
    wall(SHOWROOM.x0, SHOWROOM.x1, zf, zf + T, 2.7, STORE_H);
    const glass = std({ color: 0x0b1118, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.9 });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(W, 2.2), glass);
    pane.position.set(0, 1.6, zf + 0.15);
    pane.rotation.y = Math.PI;
    s.add(pane);
    const mull = std({ color: 0x2c2c2c, roughness: 0.4, metalness: 0.6 });
    for (let x = SHOWROOM.x0; x <= SHOWROOM.x1 + 0.01; x += 2.8) wall(x - 0.05, x + 0.05, zf + 0.05, zf + 0.25, 0.5, 2.7, mull);
    // night outside: an empty parking lot under sodium lamps
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(80, 20), new THREE.MeshBasicMaterial({ color: 0x0b1220 }));
    sky.position.set(0, 9, zf + 18);
    sky.rotation.y = Math.PI;
    s.add(sky);
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(80, 18), new THREE.MeshBasicMaterial({ color: 0x1b1a17 }));
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(0, -0.02, zf + 9);
    s.add(lot);
    for (let x = -12; x <= 12; x += 4) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 4.5), new THREE.MeshBasicMaterial({ color: 0x8c8467 }));
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, -0.01, zf + 6);
      s.add(stripe);
    }
    for (const x of [-10, 2, 14]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 8), new THREE.MeshBasicMaterial({ color: 0x23211d }));
      pole.position.set(x, 3, zf + 11);
      s.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.45), new THREE.MeshBasicMaterial({ color: 0xffb35c }));
      lamp.position.set(x, 6, zf + 11);
      s.add(lamp);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), new THREE.MeshBasicMaterial({ color: 0x4a3a22, transparent: true, opacity: 0.6 }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, -0.005, zf + 11);
      s.add(pool);
    }

    // ------------------------------------------------------------- signs
    const flat = (tex, w, h, x, y, z, ry = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      s.add(m);
      return m;
    };
    flat(TX.sign('CLOSED', { w: 256, h: 110, bg: '#a01010', fg: '#fff2f2', font: 'bold 72px Arial, sans-serif' }), 0.7, 0.3, 1.4, 1.7, zf + 0.1, Math.PI);
    flat(TX.sign('GOLD OAK FURNITURE', { w: 1024, h: 180, bg: '#3a2a18', fg: '#e9c46a', font: 'bold 92px Georgia, serif' }), 5.2, 0.9, SHOWROOM.x1 - 0.02, 2.75, 6.5, -Math.PI / 2);
    flat(TX.sign('EMPLOYEES ONLY', { w: 512, h: 110, bg: '#22252a', fg: '#f1f1f1', font: 'bold 54px Arial, sans-serif' }), 1.5, 0.32, 0, 2.55, SHOWROOM.z0 + 0.05);
    flat(TX.sign('STOCKROOM', { w: 512, h: 140, bg: '#e8e3d6', fg: '#202020', font: 'bold 70px Arial, sans-serif' }), 0.8, 0.22, 0, 1.65, HALL.z0 + 0.07);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.06), std({ color: 0x6e6f6a, roughness: 0.45, metalness: 0.4 }));
    door.position.set(0, 1.05, HALL.z0 + 0.03);
    s.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), std({ color: 0xb0a070, roughness: 0.25, metalness: 0.9 }));
    knob.position.set(0.38, 1.0, HALL.z0 + 0.08);
    s.add(knob);

    // ---------------------------------------------------------- furniture
    const props = new THREE.Group();
    for (const f of FURNITURE) props.add(furniture(f));
    s.add(mergeStatic(props));
    const puddle = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.5), std({
      color: 0x8fa3b0, roughness: 0.02, metalness: 0.2, transparent: true, opacity: 0.5, alphaMap: TX.puddle(), depthWrite: false,
    }));
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(SPILL.cx, 0.004, SPILL.cz);
    s.add(puddle);

    // ------------------------------------------------------------- lights
    s.add(new THREE.HemisphereLight(0xfffaf0, 0x8a7a66, 0.6));
    // nearly straight down from the ceiling grid: soft shadows under everything
    const sun = new THREE.DirectionalLight(0xfff6e6, 1.3);
    sun.position.set(1.5, 12, -2);
    sun.target.position.set(0, 0, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 25 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    s.add(sun, sun.target);
    const panel = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const panelGeo = new THREE.PlaneGeometry(1.2, 0.6);
    for (let x = -10.8; x <= 10.8; x += 3.6) {
      for (let z = -7.2; z <= 7.2; z += 3.6) {
        const p = new THREE.Mesh(panelGeo, panel);
        p.rotation.x = Math.PI / 2;
        p.position.set(x, STORE_H - 0.01, z);
        s.add(p);
      }
    }
    for (const [x, z] of [[-7, 5], [7, 5], [-7, -5], [7, -5]]) {
      const l = new THREE.PointLight(0xfff1dc, 9, 0, 2);
      l.position.set(x, STORE_H - 0.3, z);
      s.add(l);
    }
    // two tired fluorescent tubes in the hallway; the far one flickers
    for (const [z, flick] of [[-12.6, false], [-18.6, true]]) {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 1.2), new THREE.MeshBasicMaterial({ color: 0xf4f6ff }));
      tube.position.set(0, HALL_H - 0.03, z);
      s.add(tube);
      const l = new THREE.PointLight(0xe8eeff, 4, 0, 2);
      l.position.set(0, HALL_H - 0.25, z);
      s.add(l);
      if (flick) this.flickers.push({ tube, light: l, base: 4 });
    }

    // ------------------------------------------------------------ the hole
    this.holeMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: TX.wallpaper() }, time: { value: 0 }, open: { value: 0 } },
      vertexShader: holeShader.vertexShader,
      fragmentShader: holeShader.fragmentShader,
      transparent: true,
      depthWrite: false,
    });
    const hole = (this.hole = new THREE.Mesh(new THREE.PlaneGeometry(HOLE.z1 - HOLE.z0, HOLE.h), this.holeMat));
    hole.position.set(HOLE.x + 0.012, HOLE.h / 2, HOLE.z);
    hole.rotation.y = Math.PI / 2;
    hole.visible = false;
    s.add(hole);
    this.holeOpen = 0;
  }

  openHole() {
    this.hole.visible = true;
  }

  update(dt, t) {
    for (const f of this.flickers) {
      const k = Math.sin(t * 13) + Math.sin(t * 31.7) + Math.sin(t * 5.3);
      const on = k > -1.2 ? 1 : 0.08;
      f.light.intensity = f.base * on;
      f.tube.material.color.setScalar(on > 0.5 ? 0.95 : 0.25);
    }
    if (this.hole.visible) {
      this.holeOpen = Math.min(1, this.holeOpen + dt * 0.8);
      this.holeMat.uniforms.open.value = this.holeOpen;
      this.holeMat.uniforms.time.value = t;
    }
  }

  dispose() {
    this.env.dispose();
  }
}
