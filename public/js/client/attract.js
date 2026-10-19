// The title screen backdrop: someone with a camcorder, wandering Level 0.

import * as THREE from 'three';
import { Level0 } from '../shared/maze.js';
import { Level0View } from './level0Scene.js';
import { makeRng } from '../shared/rng.js';

export class Attract {
  constructor() {
    this.level = new Level0('title-screen');
    this.view = new Level0View(this.level);
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 90);
    this.camera.rotation.order = 'YXZ';
    this.rng = makeRng('attract');
    const L = this.level;
    this.pos = { x: L.centerX(L.spawn), z: L.centerZ(L.spawn) };
    this.ry = 0;
    this.route = [];
    this.t = 0;
  }

  nextRoute() {
    const L = this.level, here = L.cellAt(this.pos.x, this.pos.z);
    L.bfs(here);
    const far = [];
    for (let i = 0; i < L.n * L.n; i++) if (L.dist[i] >= 8 && L.dist[i] <= 14) far.push(i);
    this.route = L.path(here, this.rng.pick(far)).slice(1).map((i) => ({ x: L.centerX(i), z: L.centerZ(i) }));
  }

  update(dt) {
    this.t += dt;
    if (!this.route.length) this.nextRoute();
    const tgt = this.route[0];
    const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.6) this.route.shift();
    else {
      this.pos.x += (dx / d) * 1.1 * dt;
      this.pos.z += (dz / d) * 1.1 * dt;
      let want = Math.atan2(-dx, -dz) - this.ry;
      while (want > Math.PI) want -= Math.PI * 2;
      while (want < -Math.PI) want += Math.PI * 2;
      this.ry += want * Math.min(1, dt * 1.2);
    }
    const c = this.camera, t = this.t;
    c.position.set(this.pos.x, 1.55 + Math.sin(t * 3.4) * 0.025, this.pos.z);
    c.rotation.set(-0.05 + Math.sin(t * 0.5) * 0.03, this.ry + Math.sin(t * 0.31) * 0.08, Math.sin(t * 0.7) * 0.012);
    c.updateMatrixWorld();
    this.view.update(dt, t, c, { flash: false, entity: null });
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
