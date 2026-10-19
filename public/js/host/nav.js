// Movement helpers for everything the host moves itself: bots and the entity.

import { CELL } from '../shared/config.js';
import { resolveCircle } from '../shared/collision.js';

const tmp = [];

export function yawTowards(dx, dz) {
  return Math.atan2(-dx, -dz);
}

export function turn(from, to, rate) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-rate, Math.min(rate, d));
}

// Straight-line step towards (tx, tz), sliding along whatever is in the way.
// Returns the remaining distance.
export function stepTowards(a, tx, tz, speed, dt, r, colliders) {
  const dx = tx - a.x, dz = tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) { a.moving = false; return 0; }
  const s = Math.min(d, speed * dt);
  a.x += (dx / d) * s;
  a.z += (dz / d) * s;
  resolveCircle(a, r, typeof colliders === 'function' ? colliders(a.x, a.z) : colliders);
  a.ry = turn(a.ry, yawTowards(dx, dz), 8 * dt);
  a.moving = true;
  return d - s;
}

// Would something of radius r get from a to b along a straight line in Level 0?
function clearLine(level, ax, az, bx, bz, r) {
  const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz) || 1;
  const ox = (-dz / d) * r, oz = (dx / d) * r;
  return level.los(ax + ox, az + oz, bx + ox, bz + oz) && level.los(ax - ox, az - oz, bx - ox, bz - oz);
}

// Walks `a` through Level 0 towards world point (gx, gz) along a grid path.
// `a.nav` caches the path between calls. Returns the straight distance left.
export function walkTo(level, a, gx, gz, speed, dt, r) {
  const here = level.cellAt(a.x, a.z), goal = level.cellAt(gx, gz);
  const nav = a.nav || (a.nav = { path: [], goal: -1, t: 0 });
  let tx = gx, tz = gz;
  if (here !== goal && !(Math.hypot(gx - a.x, gz - a.z) < CELL * 1.5 && clearLine(level, a.x, a.z, gx, gz, r))) {
    nav.t -= dt;
    let k = nav.path.indexOf(here);
    if (nav.goal !== goal || k < 0 || nav.t <= 0) {
      nav.path = level.path(here, goal);
      nav.goal = goal;
      nav.t = 0.7;
      k = 0;
    }
    if (nav.path.length > k + 1) {
      // aim for the furthest of the next few cells we can walk straight to
      let next = nav.path[k + 1];
      for (let j = k + 2; j < Math.min(nav.path.length, k + 4); j++) {
        const c = nav.path[j];
        if (!clearLine(level, a.x, a.z, level.centerX(c), level.centerZ(c), r + 0.05)) break;
        next = c;
      }
      if (next === goal) { tx = gx; tz = gz; } else { tx = level.centerX(next); tz = level.centerZ(next); }
    }
  }
  stepTowards(a, tx, tz, speed, dt, r, (x, z) => level.collidersNear(x, z, tmp));
  return Math.hypot(gx - a.x, gz - a.z);
}

// Somewhere up to `steps` cells away that is as far as possible from (fx, fz).
export function fleeTarget(level, a, fx, fz, steps, rng) {
  level.bfs(level.cellAt(a.x, a.z));
  let best = -1, bestScore = -Infinity;
  for (let i = 0; i < level.n * level.n; i++) {
    const d = level.dist[i];
    if (d < 2 || d > steps) continue;
    const score = Math.hypot(level.centerX(i) - fx, level.centerZ(i) - fz) - d * 0.6 + rng() * 2;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}
