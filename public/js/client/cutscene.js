// The opening cutscene. Nobody has control: it's closing time at Gold Oak
// Furniture, the crew heads for the stockroom, one of them slips on the wet
// floor and falls backwards through the hallway wall, and the rest follow
// them in. It ends with everyone getting up off the carpet in Level 0.
// Every client plays the same script from the same start message, so all
// players see the same thing at the same time.

import * as THREE from 'three';
import { INTRO_LEN } from '../shared/config.js';
import { HOLE } from '../shared/store.js';
import { animatePerson } from './models.js';
import { sound } from './audio.js';
import { lerp, span, yawTo, angleLerp } from './util.js';

// where someone walking `points` at `speed` since `t0` is at time t
function walk(points, speed, t0, t) {
  let d = Math.max(0, t - t0) * speed;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= len) {
      const k = len ? d / len : 1;
      return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), ry: yawTo(b.x - a.x, b.z - a.z), speed: t > t0 ? speed : 0 };
    }
    d -= len;
  }
  const b = points[points.length - 1], a = points[points.length - 2] || b;
  return { x: b.x, z: b.z, ry: b.ry ?? yawTo(b.x - a.x, b.z - a.z), speed: 0 };
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

export class Cutscene {
  constructor(game, slipperIndex) {
    this.g = game;
    this.t = 0;
    this.done = false;
    this.cast = game.roster.map((r) => game.avatars.get(r.id));
    this.S = this.cast[slipperIndex] || this.cast[0];
    this.others = this.cast.filter((a) => a !== this.S);
    this.spots = game.level.introSpots(this.cast.length, Math.max(0, slipperIndex));
    this.fired = new Set();
    this.lookAt = new THREE.Vector3();
    for (const a of this.cast) {
      a.scripted = true;
      a.label.visible = false;
      a.setLevel('store');
    }
    // where each of them stands at closing time, the slipper in the middle
    const starts = [{ x: -0.4, z: 7.0 }, { x: -1.6, z: 6.3 }, { x: 0.8, z: 6.4 }, { x: 1.9, z: 7.1 }];
    this.start = new Map();
    this.start.set(this.S, starts[0]);
    this.others.forEach((a, k) => this.start.set(a, starts[k + 1]));
    // where the others stop in the hallway
    this.stops = [{ x: 0.45, z: -14.2 }, { x: 0.5, z: -13.2 }, { x: -0.45, z: -12.4 }];
    for (const a of this.cast) {
      const p = this.start.get(a);
      a.place(p.x, p.z, yawTo(9.5 - p.x, 9.6 - p.z));
    }
  }

  // things that happen once
  cue(name, at, fn) {
    if (this.t >= at && !this.fired.has(name)) {
      this.fired.add(name);
      fn();
    }
  }

  say(who, text) {
    if (who) this.g.hud.say(who.name, text);
  }

  // returns the camera position, and points this.lookAt at what it sees
  update(dt) {
    const t = (this.t += dt);
    const g = this.g, fx = g.fx, S = this.S, O = this.others;
    fx.bars = 1;
    fx.glitch = 0;
    fx.staticAmt = 0;

    // ------------------------------------------------------ sound & words
    this.cue('pa1', 0.6, () => g.hud.say('Manager (over the speakers)', "Okay, team, that's closing time."));
    this.cue('pa2', 2.6, () => g.hud.say('Manager (over the speakers)', 'Somebody take the inventory sheet to the stockroom. And mop the back hallway!'));
    this.cue('volunteer', 4.8, () => this.say(S, "I'll take it. Let's get out of here."));
    this.cue('grumble', 7.2, () => this.say(O[0], 'Why do we always get stuck closing?'));
    this.cue('hum', 11, () => sound.setHum(0.2, 1));
    this.cue('squeak', 14.0, () => sound.slip());
    this.cue('through', 14.5, () => { sound.noclip(0.9); sound.warpMuzak(); g.store.openHole(); });
    this.cue('r1', 17.3, () => this.say(O[0], '...Did you see that?'));
    this.cue('r2', 18.7, () => this.say(O[1] || O[0], `${S.name}?! Where did you go?`));
    this.cue('r3', 20.1, () => this.say(O[2] || O[0], 'The wall... it\'s moving.'));
    this.cue('brave', 21.5, () => this.say(O[0], "I'm going in after them."));
    this.cue('static', 27.8, () => { sound.stopMuzak(0.2); sound.noclip(1.2); });
    this.cue('land', 28.6, () => { sound.setHum(0.85, 2); sound.thud(null, 0.6); });
    this.cue('where', 30.6, () => this.say(S, 'Where... are we?'));
    this.cue('notstock', 32.0, () => this.say(O[0], "This isn't the stockroom."));
    this.cue('title', 32.2, () => g.hud.banner('LEVEL 0', 'The Lobby'));

    // ------------------------------------------------------------- actors
    const pose = (a, st) => {
      a.place(st.x, st.z, st.ry);
      animatePerson(a.root, st.speed, dt, 0);
      a.root.userData.body.rotation.x = 0;
    };
    let cam, look;
    if (t < 28.2) {
      for (const a of this.cast) a.setLevel('store');
      const sp = this.start.get(S);
      if (t < 5.5) {
        // closing time, by the checkout
        for (const a of this.cast) {
          const p = this.start.get(a);
          const face = a === S && t > 4.6 ? yawTo(-1.6 - p.x, 6.3 - p.z) : yawTo(9.5 - p.x, 9.6 - p.z);
          pose(a, { x: p.x, z: p.z, ry: angleLerp(a.ry, face, Math.min(1, dt * 4)), speed: 0 });
        }
        cam = v3(lerp(-2.9, -1.9, t / 5.5), lerp(1.95, 1.75, t / 5.5), 9.45);
        look = v3(0.7, 1.25, 4.6);
      } else if (t < 11) {
        // down the main aisle, single file
        pose(S, walk([sp, { x: 0, z: 4.6 }, { x: 0, z: -8 }], 2.1, 5.5, t));
        O.forEach((a, k) => {
          const p = this.start.get(a), x = k % 2 ? 0.35 : -0.35, back = 1.25 * (k + 1);
          pose(a, walk([p, { x, z: 4.6 + back }, { x, z: -8 + back }], 2.1, 5.7 + k * 0.2, t));
        });
        cam = v3(1.9, 1.75, S.z + 5.2);
        look = v3(-0.2, 1.2, S.z - 3);
      } else if (t < 14.0) {
        // into the back hallway: the slipper leads, straight for the puddle
        pose(S, walk([{ x: 0, z: -10.4 }, { x: -0.6, z: -16.3 }], 1.98, 11, t));
        O.forEach((a, k) => pose(a, walk([{ x: k % 2 ? 0.35 : -0.35, z: -10.4 + 1.3 * (k + 1) }, this.stops[k]], 1.9, 11, t)));
        if (t < 13.4) { cam = v3(0.55, 1.6, -21.2); look = v3(-0.2, 1.1, -13); }
        else { cam = v3(0.95, 1.3, -18.4); look = v3(-0.9, 1.0, -15.9); }
      } else if (t < 17) {
        // the slip: feet go out, they twist, fall backwards into the wall
        // and the wall doesn't stop them
        const st = t - 14;
        const u = S.root.userData;
        S.place(lerp(-0.6, -0.42, span(st, 0, 0.4)), -16.3, angleLerp(0, -Math.PI / 2, span(st, 0, 0.3)));
        animatePerson(S.root, 0, dt, 0);
        u.body.rotation.x = -1.45 * span(st, 0.12, 0.8);
        u.armL.shoulder.rotation.x = u.armR.shoulder.rotation.x = -2.6 * span(st, 0.05, 0.35);
        u.legL.hip.rotation.x = -1.1 * span(st, 0, 0.25);
        S.root.visible = st < 1.05;
        O.forEach((a, k) => {
          if (t < 15.6) { pose(a, walk([{ x: k % 2 ? 0.35 : -0.35, z: -10.4 + 1.3 * (k + 1) }, this.stops[k]], 1.9, 11, t)); return; }
          // then they stare at the wall
          const stop = this.stops[k];
          a.place(stop.x, stop.z, angleLerp(a.ry, yawTo(HOLE.x - stop.x, HOLE.z - stop.z), Math.min(1, dt * 3)));
          animatePerson(a.root, 0, dt, 0);
        });
        if (st > 0.45 && st < 0.6) { fx.glitch = 0.8; fx.staticAmt = 0.3; }
        if (st > 0.98 && st < 1.08) { fx.glitch = 0.6; fx.staticAmt = 0.2; }
        cam = v3(0.95, 1.3, -18.4);
        look = v3(-0.9, 1.0, -15.9);
        if (t > 15.6) {
          cam = v3(0.95, 1.6, -18.9);
          look = v3(-0.35, 1.35, -14.0);
        }
      } else {
        S.root.visible = false;
        // one by one, the others walk into the wall after them
        O.forEach((a, k) => {
          const stop = this.stops[k];
          const go = 21.6 + k * 1.5;
          if (t < go) {
            a.place(stop.x, stop.z, angleLerp(a.ry, yawTo(HOLE.x - stop.x, HOLE.z - stop.z), Math.min(1, dt * 3)));
            animatePerson(a.root, 0, dt, 0);
          } else {
            pose(a, walk([stop, { x: -0.5, z: HOLE.z }, { x: -2.2, z: HOLE.z }], 1.5, go, t));
            const gone = a.x < HOLE.x + 0.05;
            if (gone && !this.fired.has(`in${k}`)) { this.fired.add(`in${k}`); sound.noclip(0.4); }
            if (gone && a.x > HOLE.x - 0.4) { fx.glitch = 0.5; fx.staticAmt = 0.15; }
          }
          a.root.visible = a.x > HOLE.x - 0.05;
        });
        if (t < 21.4) { cam = v3(0.95, 1.6, -18.9); look = v3(-0.35, 1.35, -14.0); }
        else if (t < 26.3) { cam = v3(1.0, 1.85, -10.7); look = v3(-1.2, 1.1, -16.5); }
        else {
          // the camera follows them in
          const k = span(t, 26.3, 28.0);
          cam = v3(lerp(1.0, -1.0, k), lerp(1.85, 1.45, k), lerp(-10.7, HOLE.z, k));
          look = v3(lerp(-1.2, -2.4, k), 1.3, HOLE.z);
          fx.staticAmt = span(t, 27.2, 28.0);
          fx.glitch = span(t, 26.8, 28.0) * 0.8;
        }
      }
    } else {
      // Level 0: everyone wakes up on the carpet and gets to their feet
      const c = this.spots[this.cast.indexOf(S)];
      this.cast.forEach((a, i) => {
        a.setLevel('l0');
        const sp = this.spots[i];
        a.place(sp.x, sp.z, sp.ry);
        a.root.visible = true;
        animatePerson(a.root, 0, dt, 0);
        const up = a === S ? 29.2 : 29.8 + this.others.indexOf(a) * 0.55;
        const k = span(t, up, up + 1.4);
        const u = a.root.userData;
        u.body.rotation.x = -1.5 * (1 - k);
        const bend = Math.sin(k * Math.PI);
        u.legL.hip.rotation.x = u.legR.hip.rotation.x = -0.9 * bend;
        u.legL.knee.rotation.x = u.legR.knee.rotation.x = 1.5 * bend;
      });
      fx.staticAmt = 1 - span(t, 28.3, 29.5);
      fx.glitch = 1 - span(t, 28.3, 30);
      const k = span(t, 28.2, 33.5);
      cam = v3(c.x + 3.6, lerp(0.45, 1.65, k), c.z + 3.4);
      look = v3(c.x, lerp(0.4, 1.1, k), c.z);
    }
    if (t >= INTRO_LEN) this.finish();
    this.lookAt.copy(look);
    return cam;
  }

  get scene() {
    return this.t < 28.2 ? 'store' : 'l0';
  }

  finish() {
    if (this.done) return;
    this.done = true;
    for (const a of this.cast) {
      a.scripted = false;
      a.label.visible = true;
      a.root.userData.body.rotation.x = 0;
    }
    this.g.store.openHole();
  }
}
