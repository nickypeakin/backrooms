// Level 0: mono-yellow wallpaper, damp carpet and a fluorescent panel over
// every square. The room surfaces use one custom shader that lights each
// point from the nine nearest ceiling panels (read from a small texture, so
// single panels can die or flicker), plus the player's flashlight and fog.

import * as THREE from 'three';
import * as TX from './textures.js';
import { almondWater, exitDoor, arrowDecal } from './models.js';
import { CELL, L0_H, WALL_T, PILLAR } from '../shared/config.js';
import { DX, DZ } from '../shared/maze.js';

const roomVertex = /* glsl */`
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 w = modelMatrix * p;
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const roomFragment = /* glsl */`
  uniform sampler2D map;
  uniform vec2 texScale;
  uniform vec3 tint;
  uniform float surface;      // 0 floor, 1 wall, 2 ceiling
  uniform sampler2D lightTex;
  uniform float gridN, cell, ceilH, dim;
  uniform vec3 camPos, camDir;
  uniform float flash;
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform vec3 exitPos;
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec3 n = normalize(vNormal);
    vec2 uv = surface > 0.5 && surface < 1.5
      ? (abs(n.x) > 0.5 ? vWorld.zy : vWorld.xy) * texScale
      : vWorld.xz * texScale;
    vec3 albedo = texture2D(map, uv).rgb * tint;
    if (surface > 0.5 && surface < 1.5 && vWorld.y < 0.1) albedo = vec3(0.11, 0.075, 0.03);

    vec2 ci = floor(vWorld.xz / cell);
    float L = 0.0;
    for (int dz = -1; dz <= 1; dz++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec2 c = ci + vec2(float(dx), float(dz));
        if (c.x < 0.0 || c.y < 0.0 || c.x >= gridN || c.y >= gridN) continue;
        float k = texture2D(lightTex, (c + 0.5) / gridN).r;
        vec3 d = vec3((c.x + 0.5) * cell, ceilH - 0.04, (c.y + 0.5) * cell) - vWorld;
        float dd = dot(d, d);
        float ndl = surface > 1.5 ? 0.3 : max(dot(n, d * inversesqrt(dd)), 0.0);
        L += k * ndl * 6.0 / (1.0 + dd * 1.25);
      }
    }
    L = min(L, 3.0) * dim;

    vec3 tp = vWorld - camPos;
    float tl = length(tp);
    float cone = smoothstep(0.86, 0.97, dot(tp / tl, camDir));
    float spot = flash * cone * 10.0 / (1.0 + tl * tl * 0.22) * max(dot(n, -tp / tl), 0.0);

    vec3 e = exitPos - vWorld;
    vec3 red = vec3(1.0, 0.08, 0.04) * 1.6 / (1.0 + dot(e, e) * 0.9);

    vec3 col = albedo * (0.06 + L * vec3(1.0, 0.95, 0.78) + spot * vec3(1.0, 0.97, 0.9) + red);
    float f = 1.0 - exp(-fogDensity * fogDensity * tl * tl);
    col = mix(col, fogColor * (0.25 + 0.75 * dim), f);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const FOG = new THREE.Color(0x5e512b);

export class Level0View {
  constructor(level) {
    this.level = level;
    const n = level.n;
    const s = (this.scene = new THREE.Scene());
    s.background = FOG.clone();
    s.fog = new THREE.FogExp2(FOG, 0.045);

    // per-square light levels, sampled by the room shader
    this.lightData = new Uint8Array(n * n * 4);
    this.lightTex = new THREE.DataTexture(this.lightData, n, n, THREE.RGBAFormat);
    this.lightTex.magFilter = this.lightTex.minFilter = THREE.NearestFilter;
    this.base = new Float32Array(n * n);
    this.flickering = [];
    for (let i = 0; i < n * n; i++) {
      this.base[i] = level.light[i] === 0 ? 0 : 1;
      if (level.light[i] === 2) this.flickering.push(i);
      this.setLight(i, this.base[i]);
    }
    this.lightTex.needsUpdate = true;
    this.touched = [];

    const common = {
      lightTex: { value: this.lightTex },
      gridN: { value: n },
      cell: { value: CELL },
      ceilH: { value: L0_H },
      dim: { value: 1 },
      camPos: { value: new THREE.Vector3() },
      camDir: { value: new THREE.Vector3(0, 0, -1) },
      flash: { value: 0 },
      fogColor: { value: FOG.clone() },
      fogDensity: { value: 0.045 },
      exitPos: { value: new THREE.Vector3() },
    };
    this.u = common;
    const roomMat = (map, scale, surface, tint = 0xffffff) => new THREE.ShaderMaterial({
      uniforms: {
        ...common,
        map: { value: map },
        texScale: { value: new THREE.Vector2(scale, scale) },
        surface: { value: surface },
        tint: { value: new THREE.Color(tint) },
      },
      vertexShader: roomVertex,
      fragmentShader: roomFragment,
    });

    const size = level.size;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), roomMat(TX.carpet(), 0.5, 0));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(size / 2, 0, size / 2);
    s.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(size, size), roomMat(TX.ceilingTile(), 1 / 1.2, 2));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(size / 2, L0_H, size / 2);
    s.add(ceil);

    // walls and pillars, instanced
    const wallMat = roomMat(TX.wallpaper(), 0.62, 1);
    const segs = [];
    for (let z = 0; z < n; z++) for (let x = 0; x <= n; x++) if (level.vw[z * (n + 1) + x]) segs.push([x * CELL, (z + 0.5) * CELL, true]);
    for (let z = 0; z <= n; z++) for (let x = 0; x < n; x++) if (level.hw[z * n + x]) segs.push([(x + 0.5) * CELL, z * CELL, false]);
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL + WALL_T, L0_H, WALL_T), wallMat, segs.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    segs.forEach(([x, z, vert], i) => {
      q.setFromAxisAngle(up, vert ? Math.PI / 2 : 0);
      m.compose(new THREE.Vector3(x, L0_H / 2, z), q, one);
      walls.setMatrixAt(i, m);
    });
    walls.frustumCulled = false;
    s.add(walls);
    const pillars = [];
    for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) if (level.pillar[z * (n + 1) + x]) pillars.push([x * CELL, z * CELL]);
    if (pillars.length) {
      const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(PILLAR, L0_H, PILLAR), wallMat, pillars.length);
      pillars.forEach(([x, z], i) => { m.makeTranslation(x, L0_H / 2, z); pm.setMatrixAt(i, m); });
      pm.frustumCulled = false;
      s.add(pm);
    }

    // a fluorescent panel over every square
    const panels = (this.panels = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.25, 0.62), new THREE.MeshBasicMaterial({ color: 0xffffff }), n * n));
    const rot = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    for (let i = 0; i < n * n; i++) {
      m.makeTranslation(level.centerX(i), L0_H - 0.01, level.centerZ(i)).multiply(rot);
      panels.setMatrixAt(i, m);
      panels.setColorAt(i, this.panelColor(this.base[i]));
    }
    panels.frustumCulled = false;
    s.add(panels);

    // things someone left here
    this.items = level.items.map((it) => {
      const b = almondWater();
      b.position.set(it.x, 0, it.z);
      b.rotation.y = it.x * 7.1;
      s.add(b);
      return b;
    });
    for (const a of level.arrows) {
      const wp = level.wallPoint(a.cell, a.side);
      const d = arrowDecal();
      const ang = Math.atan2(wp.nx, wp.nz);
      d.position.set(wp.x + wp.nx * (WALL_T / 2 + 0.01), 1.25 + ((a.cell * 37) % 7) * 0.06, wp.z + wp.nz * (WALL_T / 2 + 0.01));
      d.rotation.y = ang;
      if (Math.cos(ang) * DX[a.dir] - Math.sin(ang) * DZ[a.dir] < 0) d.scale.x = -1;
      s.add(d);
    }
    const ex = level.exit;
    const door = exitDoor();
    door.position.set(ex.x + ex.nx * (WALL_T / 2), 0, ex.z + ex.nz * (WALL_T / 2));
    door.rotation.y = Math.atan2(ex.nx, ex.nz);
    s.add(door);
    common.exitPos.value.set(ex.x + ex.nx * 0.4, 2.3, ex.z + ex.nz * 0.4);

    // standard-material objects (people, bottles, the door) get plain lights
    s.add(new THREE.AmbientLight(0xffeebb, 1.1));
    s.add(new THREE.HemisphereLight(0xfff2c4, 0x6b5a2a, 2.2));
    this.flashlight = new THREE.SpotLight(0xfff4e0, 0, 22, 0.5, 0.5, 1.4);
    s.add(this.flashlight);
    s.add(this.flashlight.target);
  }

  panelColor(k) {
    const c = new THREE.Color();
    return k > 0.5 ? c.setRGB(1.6 * k, 1.55 * k, 1.3 * k) : c.setRGB(0.18 + k, 0.17 + k, 0.14 + k);
  }

  setLight(i, k) {
    this.lightData[i * 4] = Math.round(Math.max(0, Math.min(1, k)) * 255);
  }

  // Dead panels stay dead, flickering ones flicker, and every panel near the
  // entity misbehaves while it is out.
  update(dt, t, camera, opts) {
    const L = this.level;
    for (const i of this.touched) {
      this.setLight(i, this.base[i]);
      this.panels.setColorAt(i, this.panelColor(this.base[i]));
    }
    this.touched.length = 0;
    const set = (i, k) => {
      this.setLight(i, k);
      this.panels.setColorAt(i, this.panelColor(k));
      this.touched.push(i);
    };
    const tick = Math.floor(t * 12);
    const hash = (a) => { const s = Math.sin(a * 127.1 + tick * 311.7) * 43758.5453; return s - Math.floor(s); };
    for (const i of this.flickering) set(i, hash(i) > 0.35 ? 1 : 0.1);
    const e = opts.entity;
    if (e && e.visible) {
      const ex = Math.floor(e.x / CELL), ez = Math.floor(e.z / CELL);
      const r = e.chase ? 2 : 1;
      for (let z = ez - r; z <= ez + r; z++) {
        for (let x = ex - r; x <= ex + r; x++) {
          if (!L.inside(x, z)) continue;
          const i = L.idx(x, z);
          if (this.base[i] > 0) set(i, hash(i + 0.5) > (e.chase ? 0.55 : 0.75) ? 0.05 : this.base[i] * 0.8);
        }
      }
    }
    this.lightTex.needsUpdate = true;
    this.panels.instanceColor.needsUpdate = true;

    this.u.camPos.value.copy(camera.position);
    camera.getWorldDirection(this.u.camDir.value);
    this.u.flash.value = opts.flash ? 1 : 0;
    this.u.dim.value = opts.dim ?? 1;
    this.flashlight.intensity = opts.flash ? 30 : 0;
    this.flashlight.position.copy(camera.position);
    this.flashlight.target.position.copy(camera.position).add(this.u.camDir.value);

    if (opts.taken) for (let i = 0; i < this.items.length; i++) this.items[i].visible = !opts.taken.has(i);
  }

  // the closest bottle still lying around within reach, or -1
  itemNear(x, z, reach, taken) {
    let best = -1, bestD = reach;
    this.level.items.forEach((it, i) => {
      if (taken.has(i)) return;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }
}
