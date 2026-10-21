// One match from this player's point of view: the opening cutscene, then
// first-person play in Level 0 (sanity, almond water, the entity, the map),
// then spectating once you're out. The host decides the big events; this
// file plays them out.

import * as THREE from 'three';
import { Level0 } from '../shared/maze.js';
import { resolveCircle } from '../shared/collision.js';
import { PLAYER_R, EYE, WALK, SPRINT, STAMINA_MAX, STAMINA_REGEN, SANITY } from '../shared/config.js';
import { StoreView } from './storeScene.js';
import { Level0View } from './level0Scene.js';
import { entity as entityModel, animateEntity } from './models.js';
import { Avatar } from './avatar.js';
import { Cutscene } from './cutscene.js';
import { Minimap } from './minimap.js';
import { sound } from './audio.js';
import { lerp, clamp01, span, angleLerp } from './util.js';

const ST = ['alive', 'caught', 'escaped'];

export class Game {
  constructor({ renderer, vhs, link, start, hud, input, settings }) {
    this.renderer = renderer;
    this.vhs = vhs;
    this.link = link;
    this.hud = hud;
    this.input = input;
    this.settings = settings;
    this.me = link.id;
    this.isHost = start.host === link.id;
    this.roster = start.roster;
    this.level = new Level0(start.seed);
    this.store = new StoreView(renderer);
    this.l0 = new Level0View(this.level);
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 90);
    this.camera.rotation.order = 'YXZ';

    this.slipper = start.slipper;
    const myIndex = Math.max(0, this.roster.findIndex((r) => r.id === this.me));
    const spot = this.level.introSpots(this.roster.length, this.slipper)[myIndex];
    this.p = {
      x: spot.x, z: spot.z, ry: spot.ry, rx: 0, roll: 0, eye: EYE,
      vx: 0, vz: 0, stamina: STAMINA_MAX, tired: false, sanity: SANITY.max,
      almond: 0, flash: false, stepDist: 0, mv: 0,
    };
    this.mode = 'intro';
    this.t = 0;
    this.fx = { glitch: 0, staticAmt: 0, fade: 1, fadeColor: 0x000000, noise: 0, warp: 0, time: 0, bars: 1 };
    this.fadeTo = 0;
    this.pulse = 0;
    this.taken = new Set();
    this.viewing = null;
    this.sendT = 0;
    this.whisperT = 20;
    this.skipHeld = 0;
    this.tmp = [];

    this.avatars = new Map();
    for (const r of this.roster) this.avatars.set(r.id, new Avatar(r, this, r.id === this.me));
    this.cutscene = new Cutscene(this, start.slipper);

    this.ent = { root: entityModel(), x: 0, z: 0, ry: 0, tx: 0, tz: 0, tr: 0, visible: false, state: 0, speed: 0, stepAcc: 0 };
    this.ent.root.visible = false;
    this.l0.scene.add(this.ent.root);
    this.scare = entityModel();
    this.scare.visible = false;
    this.l0.scene.add(this.scare);
    this.map = new Minimap(hud.mapCanvas, this.level);
    // build every shader now, for the render target the game draws into, so
    // the cutscene doesn't stutter (or look worse) while they compile
    renderer.setRenderTarget(vhs.target);
    renderer.compile(this.store.scene, this.camera);
    renderer.compile(this.l0.scene, this.camera);
    renderer.setRenderTarget(null);

    const L = this.link;
    this.off = [
      L.on('s', (m) => this.onSnapshot(m)),
      L.on('go', () => { if (this.mode === 'intro') this.beginPlay(); }),
      L.on('caught', (m) => this.onCaught(m)),
      L.on('escaped', (m) => this.onEscaped(m)),
      L.on('roar', (m) => this.onRoar(m)),
      L.on('stir', () => { this.stirred = true; }),
      L.on('got', () => { this.p.almond++; this.pickPending = null; sound.pickup(); }),
    ];

    sound.startMuzak();
    sound.setHum(0.05);
    hud.show();
    hud.cinematic(true);
    hud.prompt(this.isHost ? 'Hold SPACE to skip' : null);
  }

  nameOf(id) {
    const r = this.roster.find((x) => x.id === id);
    return r ? r.name : '???';
  }

  // ----------------------------------------------------------- network --
  onSnapshot(m) {
    for (const row of m.ps) {
      const a = this.avatars.get(row[0]);
      if (a && !a.isMe) a.apply(row);
      else if (a) a.st = ST[row[6]];
    }
    this.taken = new Set(m.tk);
    const e = this.ent;
    if (m.e) {
      [e.tx, e.tz, e.tr, e.state] = m.e;
      if (!e.visible) { e.x = e.tx; e.z = e.tz; e.ry = e.tr; }
      e.visible = true;
      if (this.stirred) {
        this.stirred = false;
        sound.roar({ x: e.x, y: 2, z: e.z });
      }
    } else e.visible = false;
  }

  onCaught(m) {
    if (m.id === this.me) { this.startCaught(); return; }
    const a = this.avatars.get(m.id);
    if (a && a.lv === 'l0') sound.roar({ x: a.x, y: 1.6, z: a.z });
    if (this.viewing && this.viewing.id === m.id) this.viewing = null;
  }

  onEscaped(m) {
    if (m.id === this.me) { this.escapedOk = true; return; }
    if (this.viewing && this.viewing.id === m.id) this.viewing = null;
  }

  onRoar(m) {
    if (this.mode === 'intro') return;
    sound.roar({ x: this.ent.x, y: 2, z: this.ent.z });
    if (m.id === this.me && this.mode === 'play') this.pulse = 1;
  }

  send() {
    const p = this.p;
    this.link.send({
      t: 'st', x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +p.ry.toFixed(2), rx: +p.rx.toFixed(2),
      mv: p.mv, fl: p.flash ? 1 : 0, lost: p.sanity <= 0,
    });
  }

  // --------------------------------------------------------------- tick --
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const inp = this.input, p = this.p, cam = this.camera;

    if (this.mode === 'play' && inp.locked) {
      const s = 0.0022 * this.settings.sens;
      p.ry -= inp.mx * s;
      p.rx -= inp.my * s * (this.settings.invert ? -1 : 1);
      p.rx = Math.max(-1.45, Math.min(1.45, p.rx));
    }

    switch (this.mode) {
      case 'intro': this.updateIntro(dt); break;
      case 'play':
        this.move(dt);
        if (this.mode === 'play') this.interact();
        break;
      case 'caught': this.updateCaught(dt); break;
      case 'exiting': this.updateExiting(dt); break;
      case 'spectate': this.updateSpectate(); break;
    }

    for (const a of this.avatars.values()) a.update(dt);
    this.updateEntity(dt);
    this.updateSanity(dt);

    this.sendT -= dt;
    if (this.sendT <= 0 && (this.mode === 'play' || this.mode === 'exiting')) {
      this.sendT = 0.05;
      this.send();
    }

    // camera
    if (this.mode === 'intro') {
      // the cutscene placed it already
    } else if (this.mode === 'spectate' && this.viewing) {
      const v = this.viewing;
      cam.position.set(v.x, EYE, v.z);
      cam.rotation.set(v.rx, v.ry, 0);
    } else {
      const bob = this.mode === 'play' ? Math.abs(Math.sin((p.stepDist / (p.mv === 2 ? 0.95 : 0.72)) * Math.PI)) * 0.04 * Math.min(1, Math.hypot(p.vx, p.vz) / 3) : 0;
      cam.position.set(p.x, p.eye + bob, p.z);
      cam.rotation.set(p.rx, p.ry, p.roll);
    }
    cam.updateMatrixWorld();
    sound.setListener(cam);

    const viewLv = this.viewLevel();
    this.store.sun.castShadow = this.vhs.shadows;
    this.store.update(dt, this.t);
    if (viewLv === 'l0') {
      this.l0.update(dt, this.t, cam, {
        flash: p.flash && this.mode !== 'spectate' && this.mode !== 'intro',
        entity: this.ent.visible ? { x: this.ent.x, z: this.ent.z, visible: true, chase: this.ent.state === 3 } : null,
        taken: this.taken,
      });
    }
    this.updateFx(dt, viewLv);
    this.updateHud(dt);
    inp.endFrame();
  }

  viewLevel() {
    if (this.mode === 'intro') return this.cutscene.scene;
    if (this.mode === 'spectate' && this.viewing) return this.viewing.lv === 'l0' ? 'l0' : 'store';
    return 'l0';
  }

  render() {
    const store = this.viewLevel() === 'store';
    this.fx.time = this.t;
    this.fx.tone = store;
    this.vhs.render(store ? this.store.scene : this.l0.scene, this.camera, this.fx);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------- cutscene --
  updateIntro(dt) {
    const pos = this.cutscene.update(dt);
    this.camera.position.copy(pos);
    this.camera.lookAt(this.cutscene.lookAt);
    // the host can skip it for everyone
    if (this.isHost) {
      this.skipHeld = this.input.down('Space') ? this.skipHeld + dt : 0;
      if (this.skipHeld > 0.6 && !this.skipSent) {
        this.skipSent = true;
        this.link.send({ t: 'skip' });
      }
    }
    if (this.cutscene.done) this.beginPlay();
  }

  // the cutscene is over: you're standing in Level 0 with the others
  beginPlay() {
    if (this.mode !== 'intro') return;
    this.cutscene.finish();
    this.mode = 'play';
    this.fx.bars = 0;
    this.fx.staticAmt = 0;
    this.fx.glitch = 0;
    for (const a of this.avatars.values()) a.setLevel('l0');
    const spots = this.level.introSpots(this.roster.length, this.slipper);
    this.roster.forEach((r, i) => {
      const a = this.avatars.get(r.id);
      a.place(spots[i].x, spots[i].z, spots[i].ry);
    });
    const p = this.p;
    p.rx = 0;
    p.roll = 0;
    p.eye = EYE;
    sound.stopMuzak(0.2);
    sound.setHum(0.85, 1);
    const ex = this.level.exit;
    sound.setLoop('exit', { x: ex.x + ex.nx * 0.3, y: 2.3, z: ex.z + ex.nz * 0.3 }, 1);
    this.hud.cinematic(false);
    this.hud.banner(null);
    this.hud.prompt(null);
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
    resolveCircle(p, PLAYER_R, this.level.collidersNear(p.x, p.z, this.tmp));
    const moved = Math.hypot(p.x - ox, p.z - oz);
    const v = moved / dt;
    p.mv = v > 3.8 ? 2 : v > 0.4 ? 1 : 0;
    const stride = p.mv === 2 ? 0.95 : 0.72;
    const before = Math.floor(p.stepDist / stride);
    p.stepDist += moved;
    if (Math.floor(p.stepDist / stride) !== before) sound.step('carpet', p.mv === 2 ? 1.25 : 0.8);
  }

  // No buttons to remember: walk over almond water to pick it up, walk
  // into the EXIT door to leave. Q drinks, F is the flashlight.
  interact() {
    const inp = this.input, p = this.p;
    if (inp.hit('KeyF')) {
      p.flash = !p.flash;
      sound.step('tile', 0.4);
    }
    const ex = this.level.exit;
    if (Math.hypot(ex.x - p.x, ex.z - p.z) < 1.1) { this.startExit(); return; }
    const i = this.l0.itemNear(p.x, p.z, 0.9, this.taken);
    if (i >= 0 && this.pickPending !== i) {
      this.pickPending = i;
      this.link.send({ t: 'pick', i });
      setTimeout(() => { if (this.pickPending === i) this.pickPending = null; }, 1500);
    }
    if (inp.hit('KeyQ') && p.almond > 0 && p.sanity < SANITY.max - 1) {
      p.almond--;
      p.sanity = Math.min(SANITY.max, p.sanity + SANITY.almond);
      sound.drink();
    }
  }

  // --------------------------------------------------- the big moments --
  startCaught() {
    const p = this.p;
    this.mode = 'caught';
    this.cine = { t: 0 };
    sound.jumpscare();
    const fx = -Math.sin(p.ry), fz = -Math.cos(p.ry);
    this.scare.position.set(p.x + fx * 0.6, p.eye - 2.33, p.z + fz * 0.6);
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
      this.hud.banner('YOU WERE TAKEN', 'Watching the others...', 4);
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
      this.hud.banner('YOU GOT OUT', '...for now.', 4);
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
  }

  updateSpectate() {
    const list = [...this.avatars.values()].filter((a) => a.alive && !a.isMe && a.lv === 'l0');
    list.sort((a, b) => (a.bot === b.bot ? 0 : a.bot ? 1 : -1));
    if (!list.length) { this.viewing = null; this.hud.prompt(null); return; }
    let i = list.indexOf(this.viewing);
    if (i < 0) i = 0;
    else if (this.input.clicks > 0 || this.input.hit('Space')) i = (i + 1) % list.length;
    this.viewing = list[i];
    this.hud.prompt(this.viewing.name);
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
    const hearing = this.viewLevel() === 'l0' && e.visible && this.mode !== 'intro';
    sound.setLoop('entity', { x: e.x, y: 2, z: e.z }, hearing ? (e.state === 3 ? 1.1 : 0.55) : 0);
    if (hearing) {
      e.stepAcc += e.speed * dt;
      if (e.stepAcc > 1.15) { e.stepAcc = 0; sound.thud({ x: e.x, y: 0.2, z: e.z }, e.state === 3 ? 0.55 : 0.3); }
    }
  }

  updateSanity(dt) {
    const p = this.p;
    if (this.mode !== 'play') return;
    let buddy = false;
    for (const a of this.avatars.values()) {
      if (!a.isMe && a.alive && a.lv === 'l0' && Math.hypot(a.x - p.x, a.z - p.z) < SANITY.buddy) { buddy = true; break; }
    }
    let drain = buddy ? SANITY.drain : SANITY.drainAlone;
    if (this.ent.visible && Math.hypot(this.ent.x - p.x, this.ent.z - p.z) < 12) drain += SANITY.drainEntity;
    p.sanity = Math.max(0, p.sanity - drain * dt);
    if (p.sanity < 45) {
      this.whisperT -= dt;
      if (this.whisperT <= 0) {
        this.whisperT = 6 + Math.random() * 14 * (p.sanity / 45);
        sound.whisper();
      }
    }
  }

  // ------------------------------------------------------ presentation --
  updateFx(dt, viewLv) {
    const fx = this.fx, p = this.p;
    this.pulse = Math.max(0, this.pulse - dt * 1.5);
    if (this.mode === 'play' || this.mode === 'spectate' || this.mode === 'exiting') {
      let g = this.pulse * 0.6;
      if (this.ent.visible && viewLv === 'l0') {
        const d = Math.hypot(this.ent.x - this.camera.position.x, this.ent.z - this.camera.position.z);
        g = Math.max(g, clamp01((11 - d) / 11) * (this.ent.state === 3 ? 0.55 : 0.3));
      }
      fx.glitch = lerp(fx.glitch, g, 1 - Math.exp(-dt * 8));
      fx.staticAmt = lerp(fx.staticAmt, 0, 1 - Math.exp(-dt * 6));
    }
    const insane = this.mode === 'play' ? 1 - p.sanity / SANITY.max : 0;
    fx.noise = insane * insane * 0.22;
    fx.warp = p.sanity < 35 && this.mode === 'play' ? ((35 - p.sanity) / 35) * 0.9 : 0;
    fx.fade = lerp(fx.fade, this.fadeTo, 1 - Math.exp(-dt * 2.5));
  }

  updateHud(dt) {
    const p = this.p;
    const playing = this.mode === 'play' || this.mode === 'exiting';
    this.hud.showMap(playing);
    if (!playing) return;
    const mates = [];
    for (const a of this.avatars.values()) if (!a.isMe && a.alive && a.lv === 'l0') mates.push({ x: a.x, z: a.z, color: this.roster.find((r) => r.id === a.id).color });
    this.map.update(dt, {
      x: p.x, z: p.z, ry: p.ry, mates, taken: this.taken, t: this.t,
      sanity: p.sanity / SANITY.max, stamina: p.stamina / STAMINA_MAX, almond: p.almond,
    });
  }

  dispose() {
    for (const f of this.off) f();
    sound.quiet();
    for (const s of [this.store.scene, this.l0.scene]) {
      s.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
    }
    this.store.dispose();
    this.l0.lightTex.dispose();
  }
}
