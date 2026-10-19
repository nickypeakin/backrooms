// One match from this player's point of view: first-person movement, the
// slip, following through the wall, Level 0, sanity, almond water, the
// entity, and spectating once you are out of the game. The host decides the
// big events; this file plays them out.

import * as THREE from 'three';
import { Level0 } from '../shared/maze.js';
import * as Store from '../shared/store.js';
import { resolveCircle } from '../shared/collision.js';
import { PLAYER_R, EYE, WALK, SPRINT, STAMINA_MAX, STAMINA_REGEN, SANITY } from '../shared/config.js';
import { StoreView } from './storeScene.js';
import { Level0View } from './level0Scene.js';
import { person, animatePerson, entity as entityModel, animateEntity } from './models.js';
import * as TX from './textures.js';
import { sound } from './audio.js';

const LV = ['store', 'gone', 'l0'];
const LV_CODE = { store: 0, gone: 1, l0: 2 };
const ST = ['alive', 'caught', 'escaped'];
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const span = (t, a, b) => smooth((t - a) / (b - a));
function angleLerp(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// someone else, as this client sees them
class Avatar {
  constructor(r, game) {
    this.game = game;
    this.id = r.id;
    this.name = r.name;
    this.bot = r.bot;
    this.root = person(r.color);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TX.sign(r.name, { w: 256, h: 72, bg: 'rgba(8,8,8,0.7)', fg: '#fff6d8', font: '60px VT323, monospace' }),
      transparent: true, depthWrite: false,
    }));
    label.scale.set(0.9, 0.25, 1);
    label.position.y = 2.1;
    this.root.add(label);
    this.x = this.z = this.tx = this.tz = 0;
    this.ry = this.tr = this.rx = 0;
    this.lv = null;
    this.st = 'alive';
    this.speed = 0;
    this.slipT = null;
    this.snapNext = true;
  }

  setLevel(lv) {
    if (lv === this.lv) return;
    this.root.removeFromParent();
    if (lv === 'store') this.game.store.scene.add(this.root);
    else if (lv === 'l0') this.game.l0.scene.add(this.root);
    this.lv = lv;
    this.snapNext = true;
    if (lv === 'l0') {
      this.slipT = null;
      this.root.userData.body.rotation.x = 0;
    }
  }

  apply(row) {
    this.tx = row[1];
    this.tz = row[2];
    this.tr = row[3];
    this.rx = row[4];
    this.setLevel(LV[row[5]]);
    this.st = ST[row[6]];
    this.mv = row[7];
    this.flags = row[8];
  }

  startSlip() {
    this.slipT = 0;
    this.slipFrom = { x: this.x, z: this.z, ry: this.ry };
  }

  get alive() { return this.st === 'alive'; }

  update(dt) {
    const u = this.root.userData;
    if (this.slipT != null && this.lv !== 'l0') {
      // feet go out, they fall backwards, and the wall doesn't stop them
      const t = (this.slipT += dt);
      const f = this.slipFrom;
      this.ry = angleLerp(f.ry, -Math.PI / 2, clamp01(t * 5));
      this.x = lerp(f.x, Store.HOLE.x + 0.35, span(t, 0.15, 0.8));
      this.z = lerp(f.z, Store.HOLE.z, span(t, 0.15, 0.8));
      u.body.rotation.x = -1.5 * span(t, 0.2, 0.75);
      u.armL.rotation.x = u.armR.rotation.x = -2.2 * span(t, 0.1, 0.4);
      this.root.position.set(this.x, 0, this.z);
      this.root.rotation.y = this.ry + Math.PI;
      this.root.visible = t < 1.15 && this.game.viewing !== this;
      return;
    }
    if (this.snapNext) {
      this.x = this.tx; this.z = this.tz; this.ry = this.tr;
      this.snapNext = false;
    }
    const k = 1 - Math.exp(-dt * 12);
    const px = this.x, pz = this.z;
    this.x = lerp(this.x, this.tx, k);
    this.z = lerp(this.z, this.tz, k);
    this.ry = angleLerp(this.ry, this.tr, k);
    this.speed = lerp(this.speed, Math.hypot(this.x - px, this.z - pz) / Math.max(dt, 1e-3), 0.2);
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.ry + Math.PI;
    this.root.visible = this.alive && this.lv !== 'gone' && this.game.viewing !== this;
    animatePerson(this.root, this.speed, dt, this.rx);
  }
}

export class Game {
  constructor({ renderer, vhs, link, start, hud, input, settings }) {
    this.renderer = renderer;
    this.vhs = vhs;
    this.link = link;
    this.hud = hud;
    this.input = input;
    this.settings = settings;
    this.me = link.id;
    this.roster = start.roster;
    this.level = new Level0(start.seed);
    this.store = new StoreView();
    this.l0 = new Level0View(this.level);
    this.camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 90);
    this.camera.rotation.order = 'YXZ';

    const idx = Math.max(0, this.roster.findIndex((r) => r.id === this.me));
    const sp = Store.SPAWNS[idx];
    this.p = {
      x: sp.x, z: sp.z, ry: 0, rx: 0, roll: 0, eye: EYE, lv: 'store',
      vx: 0, vz: 0, stamina: STAMINA_MAX, tired: false, sanity: SANITY.max,
      almond: 0, flash: false, stepDist: 0, mv: 0,
    };
    this.mode = 'play';
    this.t = 0;
    this.fx = { glitch: 0, staticAmt: 0, fade: 1, fadeColor: 0x000000, noise: 0, warp: 0, time: 0 };
    this.fadeTo = 0;
    this.pulse = 0;
    this.taken = new Set();
    this.slip = null;
    this.viewing = null;
    this.sendT = 0;
    this.whisperT = 20;
    this.tmp = [];

    this.avatars = new Map();
    for (const r of this.roster) if (r.id !== this.me) this.avatars.set(r.id, new Avatar(r, this));
    for (const a of this.avatars.values()) a.setLevel('store');
    this.status = new Map(this.roster.map((r) => [r.id, { lv: 'store', st: 'alive' }]));

    this.ent = { root: entityModel(), x: 0, z: 0, ry: 0, tx: 0, tz: 0, tr: 0, visible: false, state: 0, speed: 0, stepAcc: 0 };
    this.ent.root.visible = false;
    this.l0.scene.add(this.ent.root);
    this.scare = entityModel();
    this.scare.visible = false;
    this.l0.scene.add(this.scare);

    const L = this.link;
    this.off = [
      L.on('s', (m) => this.onSnapshot(m)),
      L.on('slip', (m) => this.onSlip(m)),
      L.on('caught', (m) => this.onCaught(m)),
      L.on('escaped', (m) => this.onEscaped(m)),
      L.on('roar', (m) => this.onRoar(m)),
      L.on('stir', () => { this.stirred = true; }),
      L.on('got', () => { this.p.almond++; this.pickPending = null; sound.pickup(); this.hud.toast('Almond water. Press Q to drink it.'); }),
      L.on('say', (m) => this.hud.say(this.nameOf(m.id), m.text)),
      L.on('dropped', (m) => this.hud.toast(`${this.nameOf(m.id)} lost connection. A bot is playing as them now.`)),
    ];

    sound.startMuzak();
    sound.setHum(0.05);
    hud.show();
    hud.objective('Closing time at Gold Oak Furniture. Take the inventory sheet to the STOCKROOM at the end of the back hallway.');
    hud.say('Manager', "Lock up when you're done. And somebody mop the back hallway!");
    this.updateTeam();
  }

  nameOf(id) {
    const r = this.roster.find((x) => x.id === id);
    return r ? r.name : '???';
  }

  // ----------------------------------------------------------- network --
  onSnapshot(m) {
    for (const row of m.ps) {
      const s = this.status.get(row[0]);
      if (s) { s.lv = LV[row[5]]; s.st = ST[row[6]]; }
      const a = this.avatars.get(row[0]);
      if (a) a.apply(row);
    }
    this.taken = new Set(m.tk);
    const e = this.ent;
    if (m.e) {
      [e.tx, e.tz, e.tr, e.state] = m.e;
      if (!e.visible) { e.x = e.tx; e.z = e.tz; e.ry = e.tr; }
      e.visible = true;
      if (this.stirred) {
        this.stirred = false;
        if (this.p.lv === 'l0') sound.roar({ x: e.x, y: 2, z: e.z });
      }
    } else e.visible = false;
    this.updateTeam();
  }

  updateTeam() {
    this.hud.team(this.roster.map((r) => {
      const s = this.status.get(r.id);
      const where = s.st === 'caught' ? 'TAKEN' : s.st === 'escaped' ? 'ESCAPED' : s.lv === 'store' ? 'in the store' : s.lv === 'gone' ? '???' : 'Level 0';
      return { name: r.name, me: r.id === this.me, bot: r.bot, where, out: s.st !== 'alive' };
    }));
  }

  onSlip(m) {
    this.slip = m;
    if (this.p.lv === 'store') sound.warpMuzak();
    if (m.id === this.me) { this.startSlip(); return; }
    const a = this.avatars.get(m.id);
    if (a) a.startSlip();
    setTimeout(() => this.store.openHole(), 700);
    if (this.p.lv === 'store') {
      sound.slip();
      setTimeout(() => sound.noclip(0.7), 600);
      this.pulse = 0.6;
      this.hud.objective(`${this.nameOf(m.id)} slipped and fell THROUGH the hallway wall. Go after them.`);
    }
  }

  onCaught(m) {
    if (m.id === this.me) { this.startCaught(); return; }
    const a = this.avatars.get(m.id);
    if (a && a.lv === 'l0' && this.p.lv === 'l0') sound.roar({ x: a.x, y: 1.6, z: a.z });
    this.hud.toast(`${this.nameOf(m.id)} was taken.`);
    if (this.viewing && this.viewing.id === m.id) this.viewing = null;
  }

  onEscaped(m) {
    if (m.id === this.me) {
      this.escapedOk = true;
      return;
    }
    this.hud.toast(`${this.nameOf(m.id)} found the way out.`);
    if (this.viewing && this.viewing.id === m.id) this.viewing = null;
  }

  onRoar(m) {
    if (this.p.lv !== 'l0') return;
    sound.roar({ x: this.ent.x, y: 2, z: this.ent.z });
    if (m.id === this.me && this.mode === 'play') {
      this.pulse = 1;
      this.hud.flash('RUN');
    }
  }

  send() {
    const p = this.p;
    this.link.send({
      t: 'st', x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +p.ry.toFixed(2), rx: +p.rx.toFixed(2),
      lv: LV_CODE[p.lv], mv: p.mv, fl: p.flash ? 1 : 0, lost: p.sanity <= 0,
    });
  }

  // --------------------------------------------------------------- tick --
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const inp = this.input, p = this.p;

    if (this.mode === 'play' && inp.locked) {
      const s = 0.0022 * this.settings.sens;
      p.ry -= inp.mx * s;
      p.rx -= inp.my * s * (this.settings.invert ? -1 : 1);
      p.rx = Math.max(-1.45, Math.min(1.45, p.rx));
    }

    switch (this.mode) {
      case 'play':
        this.move(dt);
        if (this.mode === 'play') this.interact();
        break;
      case 'slip': this.updateSlip(dt); break;
      case 'noclip': this.updateNoclip(dt); break;
      case 'caught': this.updateCaught(dt); break;
      case 'exiting': this.updateExiting(dt); break;
      case 'spectate': this.updateSpectate(); break;
    }

    for (const a of this.avatars.values()) a.update(dt);
    this.updateEntity(dt);
    this.updateSanity(dt);

    // network
    this.sendT -= dt;
    if (this.sendT <= 0 && (this.mode === 'play' || this.mode === 'slip' || this.mode === 'noclip' || this.mode === 'exiting')) {
      this.sendT = 0.05;
      this.send();
    }

    // camera
    const cam = this.camera;
    if (this.mode === 'spectate' && this.viewing) {
      const v = this.viewing;
      cam.position.set(v.x, EYE, v.z);
      cam.rotation.set(v.rx, v.ry, 0);
    } else {
      const bob = this.mode === 'play' ? Math.abs(Math.sin((p.stepDist / (p.mv === 2 ? 0.95 : 0.72)) * Math.PI)) * 0.045 * Math.min(1, Math.hypot(p.vx, p.vz) / 3) : 0;
      cam.position.set(p.x, p.eye + bob, p.z);
      cam.rotation.set(p.rx, p.ry, p.roll);
    }
    cam.updateMatrixWorld();
    sound.setListener(cam);

    const viewLv = this.viewLevel();
    this.store.update(dt, this.t);
    if (viewLv === 'l0') {
      this.l0.update(dt, this.t, cam, {
        flash: p.flash && this.mode !== 'spectate',
        entity: this.ent.visible ? { x: this.ent.x, z: this.ent.z, visible: true, chase: this.ent.state === 3 } : null,
        taken: this.taken,
        dim: 1,
      });
    }
    this.updateAmbience(viewLv);
    this.updateFx(dt, viewLv);
    this.updateHud();
    inp.endFrame();
  }

  viewLevel() {
    if (this.mode === 'spectate' && this.viewing) return this.viewing.lv === 'l0' ? 'l0' : 'store';
    return this.p.lv === 'gone' ? this.goneView || 'store' : this.p.lv;
  }

  render() {
    const scene = this.viewLevel() === 'l0' ? this.l0.scene : this.store.scene;
    this.fx.time = this.t;
    this.vhs.render(scene, this.camera, this.fx);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------- walking --
  move(dt) {
    const inp = this.input, p = this.p;
    const f = (inp.down('KeyW') || inp.down('ArrowUp') ? 1 : 0) - (inp.down('KeyS') || inp.down('ArrowDown') ? 1 : 0);
    const s = (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0) - (inp.down('KeyA') || inp.down('ArrowLeft') ? 1 : 0);
    const len = Math.hypot(f, s);
    const sprint = (inp.down('ShiftLeft') || inp.down('ShiftRight')) && f > 0 && !p.tired;
    if (sprint && len > 0) {
      p.stamina = Math.max(0, p.stamina - dt);
      if (p.stamina <= 0) p.tired = true;
    } else {
      p.stamina = Math.min(STAMINA_MAX, p.stamina + dt * STAMINA_REGEN);
      if (p.tired && p.stamina > 1.5) p.tired = false;
    }
    const speed = sprint && len > 0 ? SPRINT : WALK;
    let wx = 0, wz = 0;
    if (len > 0) {
      const fx = -Math.sin(p.ry), fz = -Math.cos(p.ry);
      const rx = Math.cos(p.ry), rz = -Math.sin(p.ry);
      wx = ((fx * f + rx * s) / len) * speed;
      wz = ((fz * f + rz * s) / len) * speed;
    }
    const k = 1 - Math.exp(-dt * 12);
    p.vx = lerp(p.vx, wx, k);
    p.vz = lerp(p.vz, wz, k);
    const ox = p.x, oz = p.z;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const boxes = p.lv === 'store' ? Store.COLLIDERS : this.level.collidersNear(p.x, p.z, this.tmp);
    resolveCircle(p, PLAYER_R, boxes);
    const moved = Math.hypot(p.x - ox, p.z - oz);
    const v = moved / dt;
    p.mv = v > 3.8 ? 2 : v > 0.4 ? 1 : 0;
    const stride = p.mv === 2 ? 0.95 : 0.72;
    const before = Math.floor(p.stepDist / stride);
    p.stepDist += moved;
    if (Math.floor(p.stepDist / stride) !== before) {
      const surface = p.lv === 'l0' ? 'carpet' : p.z < Store.SHOWROOM.z0 ? 'concrete' : 'tile';
      sound.step(surface, p.mv === 2 ? 1.25 : 0.8);
    }

    // walking into the glitching wall takes you through it
    if (p.lv === 'store' && this.slip && this.slip.id !== this.me && Store.touchingHole(p.x, p.z, PLAYER_R + 0.06)) this.startNoclip();
  }

  interact() {
    const inp = this.input, p = this.p, hud = this.hud;
    let prompt = null;
    if (inp.hit('KeyF')) {
      p.flash = !p.flash;
      sound.step('tile', 0.4);
    }
    if (p.lv === 'store' && this.slip && this.slip.id !== this.me && Math.hypot(p.x - Store.HOLE.x, p.z - Store.HOLE.z) < 2.6) {
      prompt = 'Walk into the wall';
    }
    if (p.lv === 'l0') {
      const ex = this.level.exit;
      const i = this.l0.itemNear(p.x, p.z, 1.7, this.taken);
      if (Math.hypot(ex.x - p.x, ex.z - p.z) < 2.0) {
        prompt = '[E] Open the door';
        if (inp.hit('KeyE')) { this.startExit(); return; }
      } else if (i >= 0) {
        prompt = '[E] Pick up almond water';
        if (inp.hit('KeyE') && this.pickPending !== i) {
          this.pickPending = i;
          this.link.send({ t: 'pick', i });
          setTimeout(() => { if (this.pickPending === i) this.pickPending = null; }, 1500);
        }
      }
      if (inp.hit('KeyQ')) {
        if (p.almond > 0 && p.sanity < SANITY.max - 1) {
          p.almond--;
          p.sanity = Math.min(SANITY.max, p.sanity + SANITY.almond);
          sound.drink();
          hud.toast('You feel a little more like yourself.');
        } else if (p.almond === 0) hud.toast("You don't have any almond water.");
      }
    }
    hud.prompt(prompt);
  }

  // --------------------------------------------------- the big moments --
  startSlip() {
    const p = this.p;
    this.mode = 'slip';
    this.cine = { t: 0, x: p.x, z: p.z, ry: p.ry, rx: p.rx, landed: false };
    p.vx = p.vz = 0;
    sound.slip();
    this.hud.prompt(null);
  }

  // you slip, fall backwards, and keep falling, through the wall and out
  // of the world, onto damp carpet under buzzing lights
  updateSlip(dt) {
    const c = this.cine, p = this.p, t = (c.t += dt);
    if (t < 1.0) {
      p.ry = angleLerp(c.ry, -Math.PI / 2, smooth(t * 4));
      p.rx = lerp(c.rx, 1.35, span(t, 0.25, 0.9));
      p.roll = Math.sin(t * 9) * 0.12 * (1 - t);
      p.eye = lerp(EYE, 0.5, span(t, 0.3, 0.95));
      p.x = lerp(c.x, Store.HOLE.x - 0.35, span(t, 0.2, 0.95));
      p.z = lerp(c.z, Store.HOLE.z, span(t, 0.2, 0.95));
      this.fx.staticAmt = span(t, 0.62, 0.85);
      this.fx.glitch = span(t, 0.4, 0.8);
      if (t > 0.6 && !c.through) {
        c.through = true;
        sound.noclip(1.8);
        sound.stopMuzak(0.3);
        p.lv = 'gone';
      }
      return;
    }
    if (!c.landed) {
      c.landed = true;
      p.lv = 'l0';
      this.goneView = 'l0';
      p.x = this.level.centerX(this.level.spawn);
      p.z = this.level.centerZ(this.level.spawn);
      p.ry = Math.random() * Math.PI * 2;
      p.rx = 1.45;
      p.roll = 0.25;
      p.eye = 0.22;
      this.enterLevel0();
    }
    this.fx.staticAmt = 1 - span(t, 1.6, 2.6);
    this.fx.glitch = 1 - span(t, 1.4, 2.8);
    if (t > 1.9 && !c.thud) { c.thud = true; sound.thud(null, 0.6); }
    // lie there a moment, then get up
    p.rx = lerp(1.45, 0, span(t, 4.2, 5.4));
    p.eye = lerp(0.22, EYE, span(t, 4.3, 5.5));
    p.roll = lerp(0.25, 0, span(t, 4.2, 5.4));
    if (t > 3.2 && !c.said) { c.said = true; this.hud.say(this.nameOf(this.me), 'Where... am I?'); }
    if (t > 5.5) {
      this.mode = 'play';
      this.cine = null;
    }
  }

  startNoclip() {
    const p = this.p;
    this.mode = 'noclip';
    this.cine = { t: 0, x: p.x, z: p.z };
    p.lv = 'gone';
    this.goneView = 'store';
    sound.noclip(1.5);
    this.hud.prompt(null);
  }

  updateNoclip(dt) {
    const c = this.cine, p = this.p, t = (c.t += dt);
    if (t < 0.55) {
      p.x = lerp(c.x, Store.HOLE.x - 0.4, span(t, 0, 0.5));
      this.fx.staticAmt = span(t, 0.05, 0.4);
      this.fx.glitch = span(t, 0, 0.3);
      p.roll = Math.sin(t * 20) * 0.05;
      return;
    }
    if (!c.landed) {
      c.landed = true;
      const a = this.level.arrivalPoint();
      p.x = a.x;
      p.z = a.z;
      p.ry = Math.random() * Math.PI * 2;
      p.lv = 'l0';
      this.goneView = 'l0';
      p.eye = 1.0;
      p.rx = -0.5;
      this.enterLevel0();
    }
    this.fx.staticAmt = 1 - span(t, 0.7, 1.5);
    this.fx.glitch = 1 - span(t, 0.7, 1.8);
    p.eye = lerp(1.0, EYE, span(t, 0.9, 1.6));
    p.rx = lerp(-0.5, 0, span(t, 0.9, 1.6));
    p.roll = lerp(0.15, 0, span(t, 0.9, 1.6));
    if (t > 0.95 && !c.thud) { c.thud = true; sound.thud(null, 0.5); }
    if (t > 1.6) { this.mode = 'play'; this.cine = null; }
  }

  enterLevel0() {
    sound.stopMuzak(0.2);
    sound.setHum(0.9, 2.5);
    const ex = this.level.exit;
    sound.setLoop('exit', { x: ex.x + ex.nx * 0.3, y: 2.3, z: ex.z + ex.nz * 0.3 }, 1);
    this.hud.objective('Find the others. Find a way out. Listen for the buzz of an EXIT sign, and keep moving.');
    this.hud.toast('[F] flashlight  [Shift] run  [E] pick up  [Q] drink almond water');
  }

  startCaught() {
    const p = this.p;
    this.mode = 'caught';
    this.cine = { t: 0 };
    sound.jumpscare();
    const fx = -Math.sin(p.ry), fz = -Math.cos(p.ry);
    this.scare.position.set(p.x + fx * 0.55, p.eye - 2.32, p.z + fz * 0.55);
    this.scare.rotation.y = p.ry;
    this.scare.userData.head.rotation.set(0, 0, 0.3);
    this.scare.visible = true;
    p.rx = 0;
    this.hud.prompt(null);
  }

  updateCaught(dt) {
    const c = this.cine, p = this.p, t = (c.t += dt);
    p.roll = (Math.random() - 0.5) * 0.12 * (1 - span(t, 0.8, 1.4));
    this.fx.glitch = 1;
    this.fx.staticAmt = t < 1.2 ? (Math.random() < 0.3 ? 0.6 : 0.1) : span(t, 1.2, 1.6);
    animateEntity(this.scare, 0, dt, this.t);
    if (t > 1.6) this.scare.visible = false;
    if (t > 2.4) {
      this.fx.staticAmt = 0;
      this.fx.glitch = 0;
      p.roll = 0;
      this.hud.banner('YOU WERE TAKEN', 'It got you. Watching the others...');
      this.toSpectate();
    }
  }

  startExit() {
    this.mode = 'exiting';
    this.cine = { t: 0, x: this.p.x, z: this.p.z };
    this.escapedOk = false;
    sound.door();
    this.link.send({ t: 'esc' });
    this.hud.prompt(null);
  }

  updateExiting(dt) {
    const c = this.cine, p = this.p, t = (c.t += dt);
    const ex = this.level.exit;
    p.x = lerp(c.x, ex.x + ex.nx * 0.3, span(t, 0.2, 1.4));
    p.z = lerp(c.z, ex.z + ex.nz * 0.3, span(t, 0.2, 1.4));
    this.fx.fadeColor = 0xf4f1e4;
    this.fadeTo = span(t, 0.4, 1.6);
    if (t > 3 && !this.escapedOk) {
      // the host didn't accept it: carry on
      this.fadeTo = 0;
      this.mode = 'play';
      return;
    }
    if (t > 2.4 && this.escapedOk) {
      this.hud.banner('YOU GOT OUT', '...for now. Watching the others...');
      sound.setHum(0, 1);
      sound.setLoop('exit', null, 0);
      this.toSpectate();
    }
  }

  toSpectate() {
    this.mode = 'spectate';
    this.fadeTo = 0;
    this.fx.fadeColor = 0x000000;
    this.p.flash = false;
    this.viewing = null;
    this.hud.objective(null);
  }

  updateSpectate() {
    const list = [...this.avatars.values()].filter((a) => a.alive && a.lv !== 'gone');
    list.sort((a, b) => (a.bot === b.bot ? 0 : a.bot ? 1 : -1));
    if (!list.length) { this.viewing = null; this.hud.prompt(null); return; }
    let i = list.indexOf(this.viewing);
    if (i < 0) i = 0;
    else if (this.input.clicks > 0 || this.input.hit('Space')) i = (i + 1) % list.length;
    this.viewing = list[i];
    this.hud.prompt(`Watching ${this.viewing.name}. Click to switch.`);
  }

  // --------------------------------------------------------- the thing --
  updateEntity(dt) {
    const e = this.ent;
    const k = 1 - Math.exp(-dt * 10);
    const px = e.x, pz = e.z;
    e.x = lerp(e.x, e.tx, k);
    e.z = lerp(e.z, e.tz, k);
    e.ry = angleLerp(e.ry, e.tr, k);
    e.speed = lerp(e.speed, Math.hypot(e.x - px, e.z - pz) / Math.max(dt, 1e-3), 0.2);
    e.root.visible = e.visible;
    e.root.position.set(e.x, 0, e.z);
    e.root.rotation.y = e.ry + Math.PI;
    if (e.visible) animateEntity(e.root, e.speed, dt, this.t);
    const hearing = this.viewLevel() === 'l0' && e.visible;
    sound.setLoop('entity', { x: e.x, y: 2, z: e.z }, hearing ? (e.state === 3 ? 1.1 : 0.55) : 0);
    if (hearing) {
      e.stepAcc += e.speed * dt;
      if (e.stepAcc > 1.15) { e.stepAcc = 0; sound.thud({ x: e.x, y: 0.2, z: e.z }, e.state === 3 ? 0.55 : 0.3); }
    }
  }

  updateSanity(dt) {
    const p = this.p;
    if (p.lv !== 'l0' || this.mode !== 'play') return;
    let buddy = false;
    for (const a of this.avatars.values()) {
      if (a.alive && a.lv === 'l0' && Math.hypot(a.x - p.x, a.z - p.z) < SANITY.buddy) { buddy = true; break; }
    }
    let drain = buddy ? SANITY.drain : SANITY.drainAlone;
    if (this.ent.visible && Math.hypot(this.ent.x - p.x, this.ent.z - p.z) < 12) drain += SANITY.drainEntity;
    const before = p.sanity;
    p.sanity = Math.max(0, p.sanity - drain * dt);
    if (before > 0 && p.sanity <= 0) this.hud.toast("You can't think straight. It can hear you now.");
    if (before >= 30 && p.sanity < 30) this.hud.toast('Find almond water. Stay near the others.');
    if (p.sanity < 45) {
      this.whisperT -= dt;
      if (this.whisperT <= 0) {
        this.whisperT = 6 + Math.random() * 14 * (p.sanity / 45);
        sound.whisper();
      }
    }
  }

  // ------------------------------------------------------ presentation --
  updateAmbience(viewLv) {
    if (this.mode === 'spectate' || this.mode === 'caught') {
      sound.setHum(viewLv === 'l0' ? 0.6 : 0.05, 1);
      return;
    }
    if (this.p.lv === 'store') sound.setHum(this.p.z < Store.SHOWROOM.z0 ? 0.22 : 0.05, 1);
  }

  updateFx(dt, viewLv) {
    const fx = this.fx, p = this.p;
    this.pulse = Math.max(0, this.pulse - dt * 1.5);
    if (this.mode === 'play' || this.mode === 'spectate' || this.mode === 'exiting') {
      let g = this.pulse * 0.6;
      if (this.ent.visible && viewLv === 'l0') {
        const vx = this.camera.position.x, vz = this.camera.position.z;
        const d = Math.hypot(this.ent.x - vx, this.ent.z - vz);
        g = Math.max(g, clamp01((11 - d) / 11) * (this.ent.state === 3 ? 0.55 : 0.3));
      }
      fx.glitch = lerp(fx.glitch, g, 1 - Math.exp(-dt * 8));
      fx.staticAmt = lerp(fx.staticAmt, 0, 1 - Math.exp(-dt * 6));
    }
    const insane = this.mode === 'play' && p.lv === 'l0' ? 1 - p.sanity / SANITY.max : 0;
    fx.noise = insane * insane * 0.22;
    fx.warp = p.sanity < 35 && this.mode === 'play' && p.lv === 'l0' ? ((35 - p.sanity) / 35) * 0.9 : 0;
    fx.fade = lerp(fx.fade, this.fadeTo, 1 - Math.exp(-dt * 2.5));
  }

  updateHud() {
    const p = this.p, hud = this.hud;
    const inL0 = p.lv === 'l0' && (this.mode === 'play' || this.mode === 'exiting');
    hud.bars(inL0 ? p.sanity / SANITY.max : null, this.mode === 'play' ? p.stamina / STAMINA_MAX : null);
    hud.almond(inL0 ? p.almond : null);
    hud.flashlight(p.flash && inL0);
  }

  dispose() {
    for (const f of this.off) f();
    sound.quiet();
    const all = [this.store.scene, this.l0.scene];
    for (const s of all) {
      s.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
        }
      });
    }
    this.l0.lightTex.dispose();
  }
}
