// Coworkers played by the computer. In Level 0 they stick close to the
// nearest person, run from the entity, and head for the door once there is
// nobody left to follow. Runs on the host only.

import { PLAYER_R } from '../shared/config.js';
import { walkTo, fleeTarget, turn, yawTowards } from './nav.js';

const LINES = {
  arrive: ['Do you hear that humming?', 'It smells like wet carpet.', 'How far does this go?', 'Stay close, okay?'],
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

  // nobody to follow: mill about where we landed
  b.wanderT = (b.wanderT || 0) - dt;
  if (!b.wander || b.wanderT <= 0) {
    b.wander = { x: L.centerX(L.spawn) + m.rng.range(-3, 3), z: L.centerZ(L.spawn) + m.rng.range(-3, 3) };
    b.wanderT = m.rng.range(3, 7);
  }
  const left = walkTo(L, p, b.wander.x, b.wander.z, 1.6, dt, PLAYER_R);
  p.mv = left > 0.3 ? 1 : 0;
}

export function updateBot(m, p, dt) {
  const b = p.brain || (p.brain = {});
  if (p.lv === 'l0') level0Bot(m, p, b, dt);
}
