// The thing in Level 0. It wanders, listens for footsteps, chases whoever it
// sees and takes whoever it catches. Runs on the host only.

import { ENTITY as E, CELL } from '../shared/config.js';
import { walkTo, fleeTarget } from './nav.js';

export const ENTITY_STATE = { hidden: 0, roam: 1, investigate: 2, chase: 3 };

export class Entity {
  constructor(level, rng) {
    this.level = level;
    this.rng = rng;
    this.state = 'hidden';
    this.x = 0; this.z = 0; this.ry = 0;
    this.wake = null;       // match time it (re)appears
    this.goal = null;
    this.target = null;
    this.lastSeen = 0;
    this.chaseTime = 0;
    this.hunt = 0;          // grows over time: it gets bolder
  }

  get visible() { return this.state !== 'hidden'; }

  // someone arrived in Level 0 for the first time
  arm(t) {
    if (this.wake == null) this.wake = t + E.wakeDelay;
  }

  spawnFar(players) {
    const L = this.level, rng = this.rng;
    let best = null, bestD = -1;
    for (let k = 0; k < 300; k++) {
      const i = rng.int(0, L.n * L.n - 1);
      const x = L.centerX(i), z = L.centerZ(i);
      let d = Infinity;
      for (const p of players) d = Math.min(d, Math.hypot(p.x - x, p.z - z));
      if (d > bestD) { bestD = d; best = { x, z }; }
      if (d > 34 && d < 60) break;
    }
    this.x = best.x; this.z = best.z;
    this.nav = null;
    this.state = 'roam';
    this.goal = null;
    this.target = null;
  }

  // players: the people currently in Level 0 and still in the game
  step(m, dt, players) {
    if (this.state === 'hidden') {
      if (this.wake != null && m.t >= this.wake && players.length) {
        this.spawnFar(players);
        m.emit({ t: 'stir' });
      }
      return;
    }
    this.hunt = Math.min(1, this.hunt + dt / 400);
    const L = this.level;

    // senses
    let seen = null, seenD = Infinity, heard = null, heardD = Infinity;
    const fx = -Math.sin(this.ry), fz = -Math.cos(this.ry);
    for (const p of players) {
      const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
      const facing = (dx * fx + dz * fz) / (d || 1);
      if (d < E.seeDist && (facing > 0.35 || d < 5) && L.los(this.x, this.z, p.x, p.z)) {
        if (d < seenD) { seen = p; seenD = d; }
      }
      const loud = p.lost ? E.hearLost : p.mv === 2 ? E.hearSprint : p.mv === 1 ? E.hearWalk : 0;
      if (d < loud * (1 + this.hunt * 0.5) && d < heardD) { heard = p; heardD = d; }
    }

    if (this.state === 'chase') {
      const tgt = players.find((p) => p.id === this.target);
      this.chaseTime += dt;
      if (tgt && seen === tgt) this.lastSeen = m.t;
      else if (seen && seenD < 6) { this.target = seen.id; this.lastSeen = m.t; }
      const t2 = players.find((p) => p.id === this.target);
      if (!t2 || m.t - this.lastSeen > E.giveUp || this.chaseTime > E.maxChase) {
        this.state = 'investigate';
        this.goal = t2 ? { x: t2.x, z: t2.z } : this.goal;
        this.target = null;
      } else {
        this.goal = { x: t2.x, z: t2.z };
      }
    } else if (seen) {
      this.state = 'chase';
      this.target = seen.id;
      this.lastSeen = m.t;
      this.chaseTime = 0;
      m.emit({ t: 'roar', id: seen.id });
    } else if (heard) {
      this.state = 'investigate';
      this.goal = { x: heard.x, z: heard.z };
    }

    if (!this.goal) this.goal = this.roamGoal(players);
    const speed = this.state === 'chase' ? E.chase + this.hunt * 0.35
      : this.state === 'investigate' ? E.investigate : E.roam;
    const left = walkTo(L, this, this.goal.x, this.goal.z, speed, dt, E.radius);
    if (left < 0.6 && this.state !== 'chase') {
      this.state = 'roam';
      this.goal = this.roamGoal(players);
    }

    // anyone within reach is taken
    for (const p of players) {
      if (Math.hypot(p.x - this.x, p.z - this.z) < E.catchDist) {
        m.catchPlayer(p);
        this.state = 'hidden';
        this.wake = m.t + E.respawn;
        return;
      }
    }
  }

  // Wander somewhere, drifting towards the living more as time goes on.
  roamGoal(players) {
    const L = this.level, rng = this.rng;
    if (players.length && rng.chance(0.35 + this.hunt * 0.4)) {
      const p = rng.pick(players);
      const clamp = (v) => Math.max(CELL / 2, Math.min(L.size - CELL / 2, v));
      return { x: clamp(p.x + rng.range(-4, 4) * CELL), z: clamp(p.z + rng.range(-4, 4) * CELL) };
    }
    const i = fleeTarget(L, this, this.x + rng.range(-1, 1), this.z + rng.range(-1, 1), 12, rng);
    if (i < 0) return { x: this.x, z: this.z };
    return { x: L.centerX(i), z: L.centerZ(i) };
  }

  snapshot() {
    return [+this.x.toFixed(2), +this.z.toFixed(2), +this.ry.toFixed(2), ENTITY_STATE[this.state]];
  }
}
