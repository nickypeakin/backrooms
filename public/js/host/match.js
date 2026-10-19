// One match, simulated by the hosting player's browser. It opens with the
// cutscene (everyone watches the same one; the host picks who slips), then
// puts everyone in Level 0. From there clients move their own characters and
// report where they are; the host moves the bots and the entity, hands out
// almond water and says when it's over. It has no DOM or three.js
// dependencies so tests can run it in Node.

import { Level0 } from '../shared/maze.js';
import { makeRng } from '../shared/rng.js';
import { PLAYER_R, SNAP_EVERY, ESCAPE_GRACE, INTRO_LEN } from '../shared/config.js';
import { Entity } from './entity.js';
import { updateBot, say } from './bots.js';

export const LV = { store: 0, l0: 1 };
export const ST = { alive: 0, caught: 1, escaped: 2 };

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
    this.phase = 'intro';
    this.slipper = this.rng.int(0, roster.length - 1);
    this.taken = new Set();
    this.endAt = null;
    this.over = false;
    this.players = roster.map((r) => ({
      id: r.id, name: r.name, bot: !!r.bot, color: r.color,
      x: 0, z: 0, ry: 0, rx: 0,
      lv: 'store', st: 'alive', mv: 0, fl: 0, lost: false, t0: null, tEnd: null,
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
        if (p.st !== 'alive' || this.phase !== 'play') return;
        if (Number.isFinite(msg.x) && Number.isFinite(msg.z)) { p.x = msg.x; p.z = msg.z; }
        if (Number.isFinite(msg.ry)) p.ry = msg.ry;
        if (Number.isFinite(msg.rx)) p.rx = msg.rx;
        p.mv = msg.mv | 0;
        p.fl = msg.fl ? 1 : 0;
        p.lost = !!msg.lost;
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
    p.brain = { arrived: true };
    p.lost = false;
    this.emit({ t: 'dropped', id });
  }

  // ------------------------------------------------------------- events --
  // the host can cut the opening cutscene short for everyone
  skipIntro() {
    if (this.phase === 'intro') this.t = Math.max(this.t, INTRO_LEN);
  }

  // the cutscene is over: everyone is lying on the carpet in Level 0
  enterLevel0() {
    this.phase = 'play';
    const spots = this.level.introSpots(this.players.length, this.slipper);
    this.players.forEach((p, i) => {
      Object.assign(p, spots[i]);
      p.lv = 'l0';
      p.t0 = this.t;
    });
    this.entity.arm(this.t);
    this.emit({ t: 'go' });
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
    if (this.phase === 'intro') {
      if (this.t >= INTRO_LEN) this.enterLevel0();
      return;
    }

    for (const p of this.players) {
      if (p.bot && p.st === 'alive') updateBot(this, p, dt);
    }

    // bots don't stand inside people
    for (const p of this.players) {
      if (!p.bot || p.st !== 'alive') continue;
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
        (p.fl ? 1 : 0) | (p.lost ? 2 : 0),
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
