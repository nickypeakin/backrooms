// The furniture store, after closing: bright showroom, dim back hallway, and
// the spot on the hallway wall that stops being solid.

import * as THREE from 'three';
import * as TX from './textures.js';
import { furniture } from './models.js';
import { FURNITURE, SHOWROOM, HALL, BACK_DOOR, SPILL, HOLE } from '../shared/store.js';
import { STORE_H, HALL_H } from '../shared/config.js';

function tiled(tex, rx, ry) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

const holeShader = {
  uniforms: { map: { value: null }, time: { value: 0 }, open: { value: 0 } },
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
  constructor() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x0b0b0d);
    this.flickers = [];

    // ------------------------------------------------------------- shell
    const W = SHOWROOM.x1 - SHOWROOM.x0, D = SHOWROOM.z1 - SHOWROOM.z0;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshPhongMaterial({ map: tiled(TX.storeFloor(), W / 2, D / 2), shininess: 40, specular: 0x222222 }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const hallLen = HALL.z1 - HALL.z0, hallW = HALL.x1 - HALL.x0;
    const hallFloor = new THREE.Mesh(new THREE.PlaneGeometry(hallW, hallLen), new THREE.MeshLambertMaterial({ map: tiled(TX.concrete(), hallW / 2, hallLen / 2) }));
    hallFloor.rotation.x = -Math.PI / 2;
    hallFloor.position.set(0, 0.001, (HALL.z0 + HALL.z1) / 2);
    s.add(hallFloor);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: tiled(TX.plainWall('#efece4', 'storeCeil'), W / 2, D / 2) }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = STORE_H;
    s.add(ceil);
    const hallCeil = new THREE.Mesh(new THREE.PlaneGeometry(hallW, hallLen), new THREE.MeshLambertMaterial({ color: 0x9c978c }));
    hallCeil.rotation.x = Math.PI / 2;
    hallCeil.position.set(0, HALL_H, (HALL.z0 + HALL.z1) / 2);
    s.add(hallCeil);

    const wallMat = new THREE.MeshLambertMaterial({ map: TX.plainWall() });
    const accent = new THREE.MeshLambertMaterial({ color: 0x5b4a3a });
    const wall = (x0, x1, z0, z1, y0, y1, mat = wallMat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      s.add(m);
      return m;
    };
    const T = 0.3;
    wall(SHOWROOM.x0 - T, SHOWROOM.x0, SHOWROOM.z0, SHOWROOM.z1, 0, STORE_H);
    wall(SHOWROOM.x1, SHOWROOM.x1 + T, SHOWROOM.z0, SHOWROOM.z1, 0, STORE_H);
    wall(SHOWROOM.x0, BACK_DOOR.x0, SHOWROOM.z0 - T, SHOWROOM.z0, 0, STORE_H);
    wall(BACK_DOOR.x1, SHOWROOM.x1, SHOWROOM.z0 - T, SHOWROOM.z0, 0, STORE_H);
    wall(BACK_DOOR.x0, BACK_DOOR.x1, SHOWROOM.z0 - T, SHOWROOM.z0, 2.2, STORE_H);
    // wood-tone band along the showroom walls
    wall(SHOWROOM.x0, SHOWROOM.x0 + 0.02, SHOWROOM.z0, SHOWROOM.z1, 0, 0.14, accent);
    wall(SHOWROOM.x1 - 0.02, SHOWROOM.x1, SHOWROOM.z0, SHOWROOM.z1, 0, 0.14, accent);
    wall(SHOWROOM.x0, BACK_DOOR.x0, SHOWROOM.z0, SHOWROOM.z0 + 0.02, 0, 0.14, accent);
    wall(BACK_DOOR.x1, SHOWROOM.x1, SHOWROOM.z0, SHOWROOM.z0 + 0.02, 0, 0.14, accent);

    // the hallway: painted block walls
    const block = new THREE.MeshLambertMaterial({ map: tiled(TX.blockWall(), hallLen / 1.6, HALL_H / 0.8) });
    wall(HALL.x0 - T, HALL.x0, HALL.z0, SHOWROOM.z0 - T, 0, HALL_H, block);
    wall(HALL.x1, HALL.x1 + T, HALL.z0, SHOWROOM.z0 - T, 0, HALL_H, block);
    wall(HALL.x0 - T, HALL.x1 + T, HALL.z0 - T, HALL.z0, 0, HALL_H, block);

    // storefront: glass between a low wall and the header, night outside
    const zf = SHOWROOM.z1;
    wall(SHOWROOM.x0, SHOWROOM.x1, zf, zf + T, 0, 0.5);
    wall(SHOWROOM.x0, SHOWROOM.x1, zf, zf + T, 2.7, STORE_H);
    const glass = new THREE.MeshPhongMaterial({ color: 0x0a1018, specular: 0x667788, shininess: 90, transparent: true, opacity: 0.88 });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(W, 2.2), glass);
    pane.position.set(0, 1.6, zf + 0.15);
    pane.rotation.y = Math.PI;
    s.add(pane);
    const mull = new THREE.MeshLambertMaterial({ color: 0x2c2c2c });
    for (let x = SHOWROOM.x0; x <= SHOWROOM.x1 + 0.01; x += 2.8) wall(x - 0.05, x + 0.05, zf + 0.05, zf + 0.25, 0.5, 2.7, mull);
    const closed = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.3), new THREE.MeshBasicMaterial({ map: TX.sign('CLOSED', { w: 256, h: 110, bg: '#a01010', fg: '#fff2f2', font: 'bold 72px Arial, sans-serif' }) }));
    closed.position.set(1.4, 1.7, zf + 0.1);
    closed.rotation.y = Math.PI;
    s.add(closed);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(80, 20), new THREE.MeshBasicMaterial({ color: 0x05070a }));
    outside.position.set(0, 4, zf + 18);
    outside.rotation.y = Math.PI;
    s.add(outside);
    // parking lot lamps across the street
    for (const [x, y] of [[-16, 5], [3, 6], [20, 5.5]]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb060 }));
      lamp.position.set(x, y, zf + 17);
      s.add(lamp);
    }

    // ------------------------------------------------------------- signs
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.9), new THREE.MeshBasicMaterial({ map: TX.sign('GOLD OAK FURNITURE', { w: 1024, h: 180, bg: '#3a2a18', fg: '#e9c46a', font: 'bold 92px Georgia, serif' }) }));
    logo.position.set(SHOWROOM.x1 - 0.02, 2.75, 5);
    logo.rotation.y = -Math.PI / 2;
    s.add(logo);
    const emp = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.32), new THREE.MeshBasicMaterial({ map: TX.sign('EMPLOYEES ONLY', { w: 512, h: 110, bg: '#22252a', fg: '#f1f1f1', font: 'bold 54px Arial, sans-serif' }) }));
    emp.position.set(0, 2.55, SHOWROOM.z0 + 0.02);
    s.add(emp);
    const sale = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.8), new THREE.MeshBasicMaterial({ map: TX.sign('CLEARANCE\n30% OFF', { w: 512, h: 140, bg: '#b3141b', fg: '#fff', font: 'bold 52px Arial, sans-serif' }), side: THREE.DoubleSide }));
    sale.position.set(-8, 3.0, 1.5);
    s.add(sale);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.06), new THREE.MeshLambertMaterial({ color: 0x6e6f6a }));
    door.position.set(0, 1.05, HALL.z0 + 0.03);
    s.add(door);
    const stock = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.22), new THREE.MeshBasicMaterial({ map: TX.sign('STOCKROOM', { w: 512, h: 140, bg: '#e8e3d6', fg: '#202020', font: 'bold 70px Arial, sans-serif' }) }));
    stock.position.set(0, 1.65, HALL.z0 + 0.07);
    s.add(stock);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshLambertMaterial({ color: 0xb0a070 }));
    knob.position.set(0.38, 1.0, HALL.z0 + 0.08);
    s.add(knob);

    // ---------------------------------------------------------- furniture
    for (const f of FURNITURE) s.add(furniture(f));

    const puddle = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.5), new THREE.MeshPhongMaterial({
      color: 0x8fa3b0, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.55, alphaMap: TX.puddle(), depthWrite: false,
    }));
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(SPILL.cx, 0.004, SPILL.cz);
    s.add(puddle);

    // ------------------------------------------------------------- lights
    s.add(new THREE.AmbientLight(0xfff8ee, 1.0));
    s.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 0.8));
    const panel = new THREE.MeshBasicMaterial({ color: 0xfffdf4 });
    const panelGeo = new THREE.PlaneGeometry(1.2, 0.6);
    for (let x = -11; x <= 11; x += 3.6) {
      for (let z = -7.5; z <= 7.5; z += 3.75) {
        const p = new THREE.Mesh(panelGeo, panel);
        p.rotation.x = Math.PI / 2;
        p.position.set(x, STORE_H - 0.01, z);
        s.add(p);
      }
    }
    for (const [x, z] of [[-7, 5], [7, 5], [-7, -5], [7, -5], [0, 0]]) {
      const l = new THREE.PointLight(0xfff4e0, 11, 0, 2);
      l.position.set(x, STORE_H - 0.3, z);
      s.add(l);
    }
    // two tired fluorescent tubes in the hallway; the far one flickers
    for (const [z, flick] of [[-12.6, false], [-18.6, true]]) {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 1.2), new THREE.MeshBasicMaterial({ color: 0xf4f6ff }));
      tube.position.set(0, HALL_H - 0.03, z);
      s.add(tube);
      const l = new THREE.PointLight(0xe8eeff, 4.5, 0, 2);
      l.position.set(0, HALL_H - 0.25, z);
      s.add(l);
      if (flick) this.flickers.push({ tube, light: l, base: 4.5 });
    }

    // ------------------------------------------------------------ the hole
    this.holeMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(holeShader.uniforms),
      vertexShader: holeShader.vertexShader,
      fragmentShader: holeShader.fragmentShader,
      transparent: true,
      depthWrite: false,
    });
    this.holeMat.uniforms.map.value = TX.wallpaper();
    const hole = (this.hole = new THREE.Mesh(new THREE.PlaneGeometry(HOLE.z1 - HOLE.z0, HOLE.h), this.holeMat));
    hole.position.set(HOLE.x + 0.012, HOLE.h / 2, HOLE.z);
    hole.rotation.y = Math.PI / 2;
    hole.visible = false;
    s.add(hole);
    this.holeOpen = 0;
  }

  openHole() {
    this.hole.visible = true;
    this.holeTarget = 1;
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
}
