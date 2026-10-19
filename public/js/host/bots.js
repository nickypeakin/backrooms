// Coworkers played by the computer. In the store they browse the displays on
// their way to the stockroom; once someone falls through the wall they go in
// after them. In Level 0 they stick close to the nearest person and run from
// the entity. Runs on the host only.

import { BROWSE, COLLIDERS } from '../shared/store.js';
import { PLAYER_R } from '../shared/config.js';
import { stepTowards, walkTo, fleeTarget, turn, yawTowards } from './nav.js';

const LINES = {
  witness: ['Whoa! Where did they go?!', 'Did they just... fall through the wall?', 'Hello?! Can you hear me?', 'That wall just swallowed them.'],
  follow: ["I'm going in after them.", "We can't just leave them in there.", 'Okay... okay. Here goes nothing.'],
  arrive: ['Where... are we?', "This isn't the stockroom.", 'Do you hear that humming?', 'It smells like wet carpet.', 'How far does this go?'],
  roar: ['What was that?!', 'RUN!', "Something's in here with us!", "Don't stop moving!"],
  alone: ['Hello? Anyone?', 'Wait up!', 'Where is everyone?'],
};

export function say(m, p, kind) {
  const b = p.brain;
  if (!b || m.t < (b.quietUntil || 0) || m.t < (m.chatter || 0)) return;
  b.quietUntil = m.t + 12;
  m.chatter = m.t + 2.5;
  m.emit({ t: 'say', id: p.id, text: m.rng.pick(LINES[kind]) });
}

function initBrain(m, p) {
  const browse = m.rng.pick(BROWSE);
  return {
    mode: 'browse',
    wps: [{ x: Math.sign(browse.x) * 1.3, z: p.z - 0.4 }, { x: browse.x, z: browse.z }],
    look: browse.ry,
    wait: m.rng.range(4, 11),
  };
}

function followWps(p, b, speed, dt) {
  const wp = b.wps[0];
  if (!wp) { p.moving = false; return true; }
  const left = stepTowards(p, wp.x, wp.z, speed, dt, PLAYER_R, COLLIDERS);
  if (left < 0.25) b.wps.shift();
  return b.wps.length === 0;
}

function storeBot(m, p, b, dt) {
  if (m.slip && b.mode !== 'react' && b.mode !== 'toHole') {
    b.mode = 'react';
    b.wait = m.rng.range(1.2, 3.2);
    if (!m.witnessed) { m.witnessed = true; say(m, p, 'witness'); }
  }
  p.mv = 0;
  switch (b.mode) {
    case 'browse':
      p.mv = 1;
      if (followWps(p, b, 2.3, dt)) b.mode = 'look';
      break;
    case 'look':
      p.ry = turn(p.ry, b.look, 3 * dt);
      if ((b.wait -= dt) <= 0) {
        b.mode = 'toBack';
        b.wps = [{ x: 0, z: p.z }, { x: 0, z: -9.3 }, { x: 0, z: -12.8 }, { x: -0.1, z: -16.4 }];
      }
      break;
    case 'toBack':
      p.mv = 1;
      followWps(p, b, 2.3, dt);
      break;
    case 'react':
      // stare towards the back hallway for a moment, then go after them
      p.ry = turn(p.ry, yawTowards(-1.3 - p.x, -16.5 - p.z), 4 * dt);
      if ((b.wait -= dt) <= 0) {
        b.mode = 'toHole';
        b.wps = [];
        if (p.z > -9.6) b.wps.push({ x: 0, z: Math.min(p.z, 8) }, { x: 0, z: -9.3 });
        b.wps.push({ x: 0, z: -13.6 }, { x: -0.7, z: -16.5 }, { x: -2, z: -16.5 });
        if (m.rng.chance(0.5)) say(m, p, 'follow');
      }
      break;
    case 'toHole':
      p.mv = 2;
      followWps(p, b, 3.6, dt);
      break;
  }
}

function leaderFor(m, p) {
  const humans = m.players.filter((q) => !q.bot);
  if (!humans.length) return 'exit';
  let best = null, bestD = Infinity;
  for (const q of humans) {
    if (q.st !== 'alive' || q.lv !== 'l0') continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bestD) { bestD = d; best = q; }
  }
  if (best) return best;
  if (humans.some((q) => q.st === 'escaped')) return 'exit';
  return null;
}

function level0Bot(m, p, b, dt) {
  const L = m.level, E = m.entity;
  if (!b.arrived) {
    b.arrived = true;
    if (m.rng.chance(0.6)) say(m, p, 'arrive');
  }

  // run if it is coming for us, or close and in plain view
  const ed = E.visible ? Math.hypot(E.x - p.x, E.z - p.z) : Infinity;
  if ((E.state === 'chase' && E.target === p.id) || (ed < 9 && L.los(p.x, p.z, E.x, E.z))) {
    b.fleeT = (b.fleeT || 0) - dt;
    if (b.flee == null || b.fleeT <= 0) {
      b.flee = fleeTarget(L, p, E.x, E.z, 10, m.rng);
      b.fleeT = 1.2;
    }
    if (b.flee >= 0) walkTo(L, p, L.centerX(b.flee), L.centerZ(b.flee), 4.7, dt, PLAYER_R);
    p.mv = 2;
    return;
  }
  b.flee = null;

  const lead = leaderFor(m, p);
  if (lead === 'exit') {
    const ex = L.exit;
    walkTo(L, p, ex.x + ex.nx * 0.7, ex.z + ex.nz * 0.7, 4.2, dt, PLAYER_R);
    p.mv = 2;
    return;
  }
  if (lead) {
    const d = Math.hypot(lead.x - p.x, lead.z - p.z);
    const want = b.gap || (b.gap = m.rng.range(2.2, 3.4));
    if (d > want + 0.6) {
      const speed = d > 9 ? 4.6 : 2.9;
      walkTo(L, p, lead.x, lead.z, speed, dt, PLAYER_R);
      p.mv = speed > 3 ? 2 : 1;
      if (d > 18) say(m, p, 'alone');
    } else {
      p.mv = 0;
      p.ry = turn(p.ry, yawTowards(lead.x - p.x, lead.z - p.z), 2 * dt);
    }
    return;
  }

  // nobody to follow yet: mill about where we landed
  b.wanderT = (b.wanderT || 0) - dt;
  if (!b.wander || b.wanderT <= 0) {
    const a = L.arrivalPoint(m.rng);
    b.wander = a;
    b.wanderT = m.rng.range(3, 7);
  }
  const left = walkTo(L, p, b.wander.x, b.wander.z, 1.6, dt, PLAYER_R);
  p.mv = left > 0.3 ? 1 : 0;
}

export function updateBot(m, p, dt) {
  const b = p.brain || (p.brain = initBrain(m, p));
  if (p.lv === 'store') storeBot(m, p, b, dt);
  else if (p.lv === 'l0') level0Bot(m, p, b, dt);
}
