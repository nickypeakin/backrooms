// One match, simulated by the hosting player's browser. Clients move their
// own characters and report where they are; the host decides who slips,
// moves the bots and the entity, hands out almond water and says when it's
// over. It has no DOM or three.js dependencies so tests can run it in Node.

import { Level0 } from '../shared/maze.js';
import { SPAWNS, inSpill, touchingHole, HOLE } from '../shared/store.js';
import { makeRng } from '../shared/rng.js';
import { PLAYER_R, SNAP_EVERY, ESCAPE_GRACE } from '../shared/config.js';
import { Entity } from './entity.js';
import { updateBot, say } from './bots.js';

export const LV = { store: 0, gone: 1, l0: 2 };
export const ST = { alive: 0, caught: 1, escaped: 2 };
const LV_NAME = ['store', 'gone', 'l0'];

const round = (v) => Math.round(v * 100) / 100;

export class Match {
  // roster: [{ id, name, bot, color }]; send(to, msg): to is a player id, or null for everyone
  constructor({ seed, roster, send }) {
    this.seed = seed;
    this.send = send;
    this.rng = makeRng(`${seed}:host`);
    this.level = new Level0(seed);
    this.entity = new Entity(this.level, this.rng);
    this.t = 0;
    this.ticks = 0;
    this.slip = null;
    this.taken = new Set();
    this.endAt = null;
    this.over = false;
    this.players = roster.map((r, i) => ({
      id: r.id, name: r.name, bot: !!r.bot, color: r.color,
      x: SPAWNS[i].x, z: SPAWNS[i].z, ry: 0, rx: 0,
      lv: 'store', st: 'alive', mv: 0, fl: 0, lost: false,
      slipping: false, timer: 0, t0: null, tEnd: null,
    }));
  }

  emit(msg) { this.send(null, msg); }
  player(id) { return this.players.find((p) => p.id === id); }

  // ------------------------------------------------- messages from people --
  handle(id, msg) {
    const p = this.player(id);
    if (!p || p.bot || this.over) return;
    switch (msg.t) {
      case 'st': {
        if (p.st !== 'alive') return;
        if (Number.isFinite(msg.x) && Number.isFinite(msg.z)) { p.x = msg.x; p.z = msg.z; }
        if (Number.isFinite(msg.ry)) p.ry = msg.ry;
        if (Number.isFinite(msg.rx)) p.rx = msg.rx;
        p.mv = msg.mv | 0;
        p.fl = msg.fl ? 1 : 0;
        p.lost = !!msg.lost;
        const lv = LV_NAME[msg.lv];
        if (lv && lv !== p.lv && this.slip) {
          if (lv === 'l0') this.arrive(p);
          else if (lv === 'gone' && p.lv === 'store') p.lv = 'gone';
        }
        break;
      }
      case 'pick': {
        const it = this.level.items[msg.i];
        if (!it || this.taken.has(msg.i) || p.lv !== 'l0') return;
        if (Math.hypot(it.x - p.x, it.z - p.z) > 3) return;
        this.taken.add(msg.i);
        this.send(p.id, { t: 'got', i: msg.i });
        break;
      }
      case 'esc': {
        const ex = this.level.exit;
        if (p.lv === 'l0' && p.st === 'alive' && Math.hypot(ex.x - p.x, ex.z - p.z) < 3.5) this.escape(p);
        break;
      }
    }
  }

  // a person disconnected mid-match: a bot carries on as them
  drop(id) {
    const p = this.player(id);
    if (!p || p.bot) return;
    p.bot = true;
    p.brain = null;
    p.lost = false;
    if (p.lv === 'gone') this.arrive(p);
    if (p.lv === 'l0') p.brain = { mode: 'l0', arrived: true };
    this.emit({ t: 'dropped', id });
  }

  // ------------------------------------------------------------- events --
  doSlip(p) {
    this.slip = { id: p.id, x: p.x, z: p.z, t: this.t };
    p.slipping = true;
    p.timer = 0;
    this.emit({ t: 'slip', id: p.id, x: round(p.x), z: round(p.z) });
  }

  arrive(p, at) {
    const a = at || this.level.arrivalPoint(this.rng);
    p.lv = 'l0';
    p.slipping = false;
    if (p.bot || at) { p.x = a.x; p.z = a.z; }
    if (p.t0 == null) p.t0 = this.t;
    this.entity.arm(this.t);
  }

  catchPlayer(p) {
    if (p.st !== 'alive') return;
    p.st = 'caught';
    p.tEnd = this.t;
    p.mv = 0;
    this.emit({ t: 'caught', id: p.id });
  }

  escape(p) {
    if (p.st !== 'alive') return;
    p.st = 'escaped';
    p.tEnd = this.t;
    this.emit({ t: 'escaped', id: p.id });
  }

  // --------------------------------------------------------------- tick --
  step(dt) {
    if (this.over) return;
    this.t += dt;
    this.ticks++;
    const L = this.level;

    for (const p of this.players) {
      if (p.st !== 'alive') continue;
      if (p.bot && p.slipping) {
        // the bot that slipped: falls, is gone for a moment, lands in Level 0
        p.timer += dt;
        p.mv = 0;
        if (p.timer > 1.1 && p.lv === 'store') p.lv = 'gone';
        if (p.timer > 2.6) this.arrive(p, { x: L.centerX(L.spawn), z: L.centerZ(L.spawn) });
        continue;
      }
      if (p.bot && p.lv === 'gone') {
        p.timer += dt;
        if (p.timer > 1.0) this.arrive(p);
        continue;
      }
      if (p.bot) updateBot(this, p, dt);
    }

    // bots don't stand inside people
    for (const p of this.players) {
      if (!p.bot || p.st !== 'alive' || p.slipping || p.lv === 'gone') continue;
      for (const q of this.players) {
        if (q === p || q.st !== 'alive' || q.lv !== p.lv) continue;
        const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz);
        if (d > 0.01 && d < PLAYER_R * 2.2) {
          const push = (PLAYER_R * 2.2 - d) * 0.5;
          p.x += (dx / d) * push;
          p.z += (dz / d) * push;
        }
      }
    }

    // the first person to walk through the puddle goes down
    if (!this.slip) {
      const p = this.players.find((q) => q.st === 'alive' && q.lv === 'store' && inSpill(q.x, q.z));
      if (p) this.doSlip(p);
    } else {
      for (const p of this.players) {
        if (p.bot && p.st === 'alive' && p.lv === 'store' && !p.slipping && touchingHole(p.x, p.z, PLAYER_R + 0.05)) {
          p.lv = 'gone';
          p.timer = 0;
          p.x = HOLE.x - 0.5;
        }
      }
    }

    const living = this.players.filter((p) => p.st === 'alive' && p.lv === 'l0');
    this.entity.step(this, dt, living);
    if (this.entity.state === 'chase' && this.entity.chaseTime < dt * 1.5) {
      const near = living.find((p) => p.bot && p.id !== this.entity.target);
      if (near) say(this, near, 'roar');
    }

    const ex = L.exit;
    for (const p of living) {
      if (p.bot && p.st === 'alive' && Math.hypot(ex.x + ex.nx * 0.5 - p.x, ex.z + ex.nz * 0.5 - p.z) < 1.2) this.escape(p);
    }

    // over once every person (or, in an all-bot test, everyone) is out or taken
    const people = this.players.some((p) => !p.bot) ? this.players.filter((p) => !p.bot) : this.players;
    if (this.endAt == null && !people.some((p) => p.st === 'alive')) {
      this.endAt = this.t + (people.some((p) => p.st === 'escaped') ? ESCAPE_GRACE : 3.5);
    }
    if (this.endAt != null && this.t >= this.endAt) { this.finish(); return; }

    if (this.ticks % SNAP_EVERY === 0) this.emit(this.snapshot());
  }

  snapshot() {
    return {
      t: 's',
      T: round(this.t),
      ps: this.players.map((p) => [
        p.id, round(p.x), round(p.z), round(p.ry), round(p.rx), LV[p.lv], ST[p.st], p.mv,
        (p.fl ? 1 : 0) | (p.lost ? 2 : 0) | (p.slipping ? 4 : 0),
      ]),
      e: this.entity.visible ? this.entity.snapshot() : null,
      tk: [...this.taken],
    };
  }

  finish() {
    this.over = true;
    const results = this.players.map((p) => ({
      id: p.id, name: p.name, bot: p.bot, color: p.color, st: p.st,
      time: p.t0 == null ? 0 : round((p.tEnd ?? this.t) - p.t0),
    }));
    this.emit({ t: 'over', results });
  }
}
