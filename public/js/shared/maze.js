// Level 0 layout: an N x N grid of CELL-sized squares. Each edge between two
// squares may carry a wall. Everything here is generated from the match seed,
// so the host and every client build an identical level without sending it.

import { CELL, L0_N, WALL_T, PILLAR, ALMOND_COUNT } from './config.js';
import { makeRng } from './rng.js';

// directions: 0 = north (-z), 1 = east (+x), 2 = south (+z), 3 = west (-x)
export const DX = [0, 1, 0, -1];
export const DZ = [-1, 0, 1, 0];

export class Level0 {
  constructor(seed) {
    const n = (this.n = L0_N);
    this.size = n * CELL;
    // vw[z*(n+1)+x]: wall along world x = x*CELL, covering row z
    // hw[z*n+x]: wall along world z = z*CELL, covering column x
    this.vw = new Uint8Array((n + 1) * n);
    this.hw = new Uint8Array(n * (n + 1));
    this.pillar = new Uint8Array((n + 1) * (n + 1));
    this.light = new Uint8Array(n * n); // 0 dead, 1 on, 2 flickering
    this.dist = new Int16Array(n * n);
    this.parent = new Int32Array(n * n);
    this.queue = new Int32Array(n * n);
    this.generate(makeRng(`${seed}:level0`));
  }

  // ------------------------------------------------------------ walls --
  wallRef(x, z, dir) {
    const n = this.n;
    switch (dir) {
      case 0: return [this.hw, z * n + x];
      case 2: return [this.hw, (z + 1) * n + x];
      case 3: return [this.vw, z * (n + 1) + x];
      default: return [this.vw, z * (n + 1) + x + 1];
    }
  }

  wall(x, z, dir) {
    const [a, i] = this.wallRef(x, z, dir);
    return a[i] === 1;
  }

  setWall(x, z, dir, v) {
    const [a, i] = this.wallRef(x, z, dir);
    a[i] = v ? 1 : 0;
  }

  inside(x, z) {
    return x >= 0 && z >= 0 && x < this.n && z < this.n;
  }

  // can you walk from cell (x, z) to its neighbour in `dir`?
  open(x, z, dir) {
    return this.inside(x + DX[dir], z + DZ[dir]) && !this.wall(x, z, dir);
  }

  idx(x, z) { return z * this.n + x; }
  cx(i) { return i % this.n; }
  cz(i) { return (i / this.n) | 0; }
  cellAt(wx, wz) {
    const n = this.n;
    const x = Math.max(0, Math.min(n - 1, Math.floor(wx / CELL)));
    const z = Math.max(0, Math.min(n - 1, Math.floor(wz / CELL)));
    return z * n + x;
  }
  centerX(i) { return (this.cx(i) + 0.5) * CELL; }
  centerZ(i) { return (this.cz(i) + 0.5) * CELL; }

  // ------------------------------------------------------- generation --
  generate(rng) {
    const n = this.n;
    this.vw.fill(1);
    this.hw.fill(1);
    const sx = n >> 1, sz = n >> 1;
    this.spawn = this.idx(sx, sz);

    // 1. a perfect maze, so everything is connected
    const seen = new Uint8Array(n * n);
    const stack = [this.spawn];
    seen[this.spawn] = 1;
    const dirs = [0, 1, 2, 3];
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const x = this.cx(cur), z = this.cz(cur);
      rng.shuffle(dirs);
      let moved = false;
      for (const d of dirs) {
        const nx = x + DX[d], nz = z + DZ[d];
        if (!this.inside(nx, nz) || seen[this.idx(nx, nz)]) continue;
        this.setWall(x, z, d, 0);
        seen[this.idx(nx, nz)] = 1;
        stack.push(this.idx(nx, nz));
        moved = true;
        break;
      }
      if (!moved) stack.pop();
    }

    // 2. knock out many walls: the backrooms are rooms, not a labyrinth
    for (let z = 0; z < n; z++) {
      for (let x = 1; x < n; x++) if (rng.chance(0.42)) this.vw[z * (n + 1) + x] = 0;
    }
    for (let z = 1; z < n; z++) {
      for (let x = 0; x < n; x++) if (rng.chance(0.42)) this.hw[z * n + x] = 0;
    }

    // 3. long, featureless hallways
    for (let k = 0; k < 22; k++) {
      const horiz = rng.chance(0.5);
      const len = rng.int(5, 13);
      const x0 = rng.int(1, n - 2 - (horiz ? len : 0));
      const z0 = rng.int(1, n - 2 - (horiz ? 0 : len));
      for (let s = 0; s < len; s++) {
        const x = horiz ? x0 + s : x0, z = horiz ? z0 : z0 + s;
        if (horiz) {
          this.setWall(x, z, 0, 1); this.setWall(x, z, 2, 1);
          if (s < len - 1) this.setWall(x, z, 1, 0);
        } else {
          this.setWall(x, z, 1, 1); this.setWall(x, z, 3, 1);
          if (s < len - 1) this.setWall(x, z, 2, 0);
        }
      }
    }

    // 4. wide open rooms, some held up by square pillars
    const rooms = [{ x0: sx - 1, z0: sz - 1, w: 3, h: 3, spawn: true }];
    for (let k = 0; k < 16; k++) {
      const w = rng.int(2, 6), h = rng.int(2, 6);
      rooms.push({ x0: rng.int(0, n - w), z0: rng.int(0, n - h), w, h });
    }
    for (const r of rooms) {
      for (let z = r.z0; z < r.z0 + r.h; z++) {
        for (let x = r.x0; x < r.x0 + r.w; x++) {
          if (x < r.x0 + r.w - 1) this.setWall(x, z, 1, 0);
          if (z < r.z0 + r.h - 1) this.setWall(x, z, 2, 0);
        }
      }
      if (r.spawn || r.w < 3 || r.h < 3) continue;
      const pillars = rng.chance(0.6);
      for (let vz = r.z0 + 1; vz < r.z0 + r.h; vz++) {
        for (let vx = r.x0 + 1; vx < r.x0 + r.w; vx++) {
          if (pillars && rng.chance(0.75)) this.pillar[vz * (n + 1) + vx] = 1;
        }
      }
    }
    // the spawn room stays clear even if another room overlapped it
    for (let vz = sz - 1; vz <= sz + 2; vz++) {
      for (let vx = sx - 1; vx <= sx + 2; vx++) this.pillar[vz * (n + 1) + vx] = 0;
    }

    // 5. hallways may have sealed something off: reconnect it
    for (;;) {
      this.bfs(this.spawn);
      let fixed = 0;
      for (let i = 0; i < n * n; i++) {
        if (this.dist[i] >= 0) continue;
        const x = this.cx(i), z = this.cz(i);
        for (const d of rng.shuffle([0, 1, 2, 3])) {
          const nx = x + DX[d], nz = z + DZ[d];
          if (this.inside(nx, nz) && this.dist[this.idx(nx, nz)] >= 0) {
            this.setWall(x, z, d, 0);
            fixed++;
            break;
          }
        }
      }
      if (!fixed) break;
    }

    // 6. the way out: a door far from where you land
    this.bfs(this.spawn);
    const walled = (i) => [0, 1, 2, 3].filter((d) => this.wall(this.cx(i), this.cz(i), d));
    let cands = [];
    for (let i = 0; i < n * n; i++) {
      if (this.dist[i] >= 34 && this.dist[i] <= 46 && walled(i).length) cands.push(i);
    }
    if (!cands.length) {
      let best = this.spawn;
      for (let i = 0; i < n * n; i++) if (walled(i).length && this.dist[i] > this.dist[best]) best = i;
      cands = [best];
    }
    const ex = rng.pick(cands);
    const side = rng.pick(walled(ex));
    this.exit = { cell: ex, side, ...this.wallPoint(ex, side) };

    // 7. someone has drawn arrows towards the door. Most of them are right.
    const route = this.path(this.spawn, ex);
    this.arrows = [];
    let gap = 3;
    for (let k = 1; k < route.length - 1; k++) {
      if (--gap > 0) continue;
      const cur = route[k], next = route[k + 1];
      const dir = this.dirBetween(cur, next);
      const sides = [(dir + 1) % 4, (dir + 3) % 4].filter((d) => this.wall(this.cx(cur), this.cz(cur), d));
      if (!sides.length) continue;
      gap = rng.int(4, 6);
      if (rng.chance(0.2)) continue;
      this.arrows.push({ cell: cur, side: rng.pick(sides), dir });
    }

    // 8. almond water, scattered
    this.items = [];
    const near = (i, r) => Math.abs(this.cx(i) - sx) <= r && Math.abs(this.cz(i) - sz) <= r;
    while (this.items.length < ALMOND_COUNT) {
      const i = rng.int(0, n * n - 1);
      if (near(i, 2) || i === ex || this.items.some((it) => it.cell === i)) continue;
      this.items.push({
        cell: i,
        x: this.centerX(i) + rng.range(-0.8, 0.8),
        z: this.centerZ(i) + rng.range(-0.8, 0.8),
      });
    }

    // 9. not every light works
    for (let i = 0; i < n * n; i++) {
      const r = rng();
      this.light[i] = r < 0.06 ? 0 : r < 0.1 ? 2 : 1;
    }
    for (let z = sz - 1; z <= sz + 1; z++) for (let x = sx - 1; x <= sx + 1; x++) this.light[this.idx(x, z)] = 1;
    this.light[ex] = 1;
  }

  // middle of the wall on side `dir` of cell i, and the way it faces (into the cell)
  wallPoint(i, dir) {
    const x = this.centerX(i) + (DX[dir] * CELL) / 2;
    const z = this.centerZ(i) + (DZ[dir] * CELL) / 2;
    return { x, z, nx: -DX[dir], nz: -DZ[dir] };
  }

  dirBetween(a, b) {
    const dx = this.cx(b) - this.cx(a), dz = this.cz(b) - this.cz(a);
    return dz < 0 ? 0 : dx > 0 ? 1 : dz > 0 ? 2 : 3;
  }

  // ------------------------------------------------------ path finding --
  // Breadth-first distances (in cells) from `start`; stops early at `goal`.
  bfs(start, goal = -1) {
    const { dist, parent, queue } = this;
    dist.fill(-1);
    let head = 0, tail = 0;
    queue[tail++] = start;
    dist[start] = 0;
    parent[start] = -1;
    while (head < tail) {
      const cur = queue[head++];
      if (cur === goal) break;
      const x = this.cx(cur), z = this.cz(cur);
      for (let d = 0; d < 4; d++) {
        if (!this.open(x, z, d)) continue;
        const nb = cur + DX[d] + DZ[d] * this.n;
        if (dist[nb] >= 0) continue;
        dist[nb] = dist[cur] + 1;
        parent[nb] = cur;
        queue[tail++] = nb;
      }
    }
  }

  // list of cells from `from` to `to` (both included), or [] if unreachable
  path(from, to) {
    this.bfs(from, to);
    if (this.dist[to] < 0) return [];
    const out = [];
    for (let c = to; c !== -1; c = this.parent[c]) out.push(c);
    return out.reverse();
  }

  // ---------------------------------------------------- line of sight --
  // Walks the grid squares the segment passes through; any closed wall
  // crossed blocks the view. Pillars are thin enough to ignore.
  los(ax, az, bx, bz) {
    const gx0 = ax / CELL, gz0 = az / CELL, gx1 = bx / CELL, gz1 = bz / CELL;
    let x = Math.floor(gx0), z = Math.floor(gz0);
    const tx = Math.floor(gx1), tz = Math.floor(gz1);
    const dx = gx1 - gx0, dz = gz1 - gz0;
    const sx = Math.sign(dx), sz = Math.sign(dz);
    const tdx = dx !== 0 ? 1 / Math.abs(dx) : Infinity;
    const tdz = dz !== 0 ? 1 / Math.abs(dz) : Infinity;
    let tmx = dx !== 0 ? (sx > 0 ? x + 1 - gx0 : gx0 - x) * tdx : Infinity;
    let tmz = dz !== 0 ? (sz > 0 ? z + 1 - gz0 : gz0 - z) * tdz : Infinity;
    for (let guard = 0; guard < 512; guard++) {
      if (x === tx && z === tz) return true;
      if (tmx < tmz) {
        if (this.wall(x, z, sx > 0 ? 1 : 3)) return false;
        x += sx;
        tmx += tdx;
      } else {
        if (this.wall(x, z, sz > 0 ? 2 : 0)) return false;
        z += sz;
        tmz += tdz;
      }
      if (!this.inside(x, z)) return false;
    }
    return true;
  }

  // ---------------------------------------------------------- collision --
  // Boxes for every wall and pillar around a point, written into `out`.
  collidersNear(wx, wz, out = []) {
    out.length = 0;
    const n = this.n, h = WALL_T / 2, p = PILLAR / 2;
    const cx = Math.floor(wx / CELL), cz = Math.floor(wz / CELL);
    for (let z = cz - 1; z <= cz + 1; z++) {
      if (z < 0 || z >= n) continue;
      for (let x = cx - 1; x <= cx + 2; x++) {
        if (x < 0 || x > n || !this.vw[z * (n + 1) + x]) continue;
        out.push({ x0: x * CELL - h, x1: x * CELL + h, z0: z * CELL - h, z1: (z + 1) * CELL + h });
      }
    }
    for (let z = cz - 1; z <= cz + 2; z++) {
      if (z < 0 || z > n) continue;
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (x < 0 || x >= n || !this.hw[z * n + x]) continue;
        out.push({ x0: x * CELL - h, x1: (x + 1) * CELL + h, z0: z * CELL - h, z1: z * CELL + h });
      }
    }
    for (let z = cz - 1; z <= cz + 2; z++) {
      for (let x = cx - 1; x <= cx + 2; x++) {
        if (x < 0 || z < 0 || x > n || z > n || !this.pillar[z * (n + 1) + x]) continue;
        out.push({ x0: x * CELL - p, x1: x * CELL + p, z0: z * CELL - p, z1: z * CELL + p });
      }
    }
    return out;
  }

  // Where everyone comes to after falling through: the one who slipped in
  // the middle of the room they landed in, the rest in a loose ring around
  // them, all facing in. Index i is the player's place in the roster.
  introSpots(count, slipper) {
    const cx = this.centerX(this.spawn), cz = this.centerZ(this.spawn);
    const out = [];
    let k = 0;
    for (let i = 0; i < count; i++) {
      if (i === slipper) { out.push({ x: cx, z: cz }); continue; }
      const a = 0.7 + (k++ * Math.PI * 2) / Math.max(1, count - 1);
      out.push({ x: cx + Math.cos(a) * 2.3, z: cz + Math.sin(a) * 2.3 });
    }
    // the others face the one who slipped, who faces the first of them
    const first = out.find((_, i) => i !== slipper) || { x: cx, z: cz - 1 };
    out.forEach((p, i) => {
      const t = i === slipper ? first : { x: cx, z: cz };
      p.ry = Math.atan2(-(t.x - p.x), -(t.z - p.z));
    });
    return out;
  }
}
