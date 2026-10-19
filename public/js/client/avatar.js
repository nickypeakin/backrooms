// Someone in the match as this client sees them: a model, a name tag, and
// smoothing between the host's snapshots. The cutscene drives avatars
// directly while `scripted` is set.

import * as THREE from 'three';
import { person, animatePerson } from './models.js';
import * as TX from './textures.js';
import { lerp, angleLerp } from './util.js';

const LV = ['store', 'l0'];
const ST = ['alive', 'caught', 'escaped'];

export class Avatar {
  constructor(r, game, isMe) {
    this.game = game;
    this.id = r.id;
    this.name = r.name;
    this.bot = r.bot;
    this.isMe = isMe;
    this.root = person(r.color);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TX.sign(r.name, { w: 256, h: 64, bg: 'rgba(8,8,8,0.45)', fg: '#fff6d8', font: '54px VT323, monospace' }),
      transparent: true, depthWrite: false,
    }));
    this.label.scale.set(0.62, 0.155, 1);
    this.label.position.y = 2.05;
    this.root.add(this.label);
    this.x = this.z = this.tx = this.tz = 0;
    this.ry = this.tr = this.rx = 0;
    this.lv = null;
    this.st = 'alive';
    this.speed = 0;
    this.scripted = false;
    this.snapNext = true;
  }

  get alive() { return this.st === 'alive'; }

  setLevel(lv) {
    if (lv === this.lv) return;
    this.root.removeFromParent();
    if (lv === 'store') this.game.store.scene.add(this.root);
    else if (lv === 'l0') this.game.l0.scene.add(this.root);
    this.lv = lv;
    this.snapNext = true;
  }

  // one row of a host snapshot
  apply(row) {
    this.tx = row[1];
    this.tz = row[2];
    this.tr = row[3];
    this.rx = row[4];
    if (!this.scripted) this.setLevel(LV[row[5]]);
    this.st = ST[row[6]];
  }

  // put them somewhere without smoothing
  place(x, z, ry) {
    this.x = this.tx = x;
    this.z = this.tz = z;
    this.ry = this.tr = ry;
    this.snapNext = false;
    this.root.position.set(x, 0, z);
    this.root.rotation.y = ry + Math.PI;
  }

  update(dt) {
    if (this.scripted) return;
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
    this.root.visible = this.alive && !this.isMe && this.game.viewing !== this;
    animatePerson(this.root, this.speed, dt, this.rx);
  }
}
