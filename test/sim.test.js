// Headless check of the host simulation: a scripted player and three bots
// play whole matches on a handful of seeds. Each match must get someone to
// slip, get everyone through the wall, wake the entity and finish, and every
// generated level must be fully connected with a reachable exit.
// Usage: npm test

import assert from 'node:assert/strict';
import { Match } from '../public/js/host/match.js';
import { Level0 } from '../public/js/shared/maze.js';
import { TICK, L0_N, PLAYER_R } from '../public/js/shared/config.js';
import { COLLIDERS, HOLE } from '../public/js/shared/store.js';
import { walkTo, stepTowards } from '../public/js/host/nav.js';
import { makeRng } from '../public/js/shared/rng.js';

// A stand-in for a person: walks to the back hallway, follows through the
// wall when it opens, then wanders Level 0 at random until it finds the door
// or gets caught. It talks to the match exactly like a real client does.
function fakeHuman(m, id) {
  const me = { id, x: 1, z: 8.2, ry: 0, lv: 0, wps: [{ x: 0, z: 6 }, { x: 0, z: -9.3 }, { x: 0, z: -13 }], rng: makeRng(id), goal: null };
  return (dt) => {
    const p = m.player(id);
    if (p.st !== 'alive') return;
    const L = m.level;
    if (me.lv === 0) {
      const slipped = m.slip && m.slip.id === id;
      if (slipped) { me.fall = (me.fall || 0) + dt; if (me.fall > 2.5) { Object.assign(me, L.arrivalPoint(me.rng)); me.lv = 2; } }
      else if (m.slip && !me.wps.length) me.wps.push({ x: -0.7, z: -16.5 }, { x: -2, z: -16.5 });
      else if (!m.slip && !me.wps.length && me.z > -16) me.wps.push({ x: 0, z: -16.5 });
      const wp = me.wps[0];
      if (wp && !slipped && stepTowards(me, wp.x, wp.z, 3, dt, PLAYER_R, COLLIDERS) < 0.25) me.wps.shift();
      if (m.slip && !slipped && me.x - PLAYER_R < HOLE.x + 0.06) { Object.assign(me, L.arrivalPoint(me.rng)); me.lv = 2; }
    } else {
      const ex = L.exit;
      if (Math.hypot(ex.x - me.x, ex.z - me.z) < 2.5) { m.handle(id, { t: 'esc' }); return; }
      if (L.los(me.x, me.z, ex.x, ex.z) && Math.hypot(ex.x - me.x, ex.z - me.z) < 12) me.goal = { x: ex.x + ex.nx * 0.6, z: ex.z + ex.nz * 0.6 };
      if (!me.goal || Math.hypot(me.goal.x - me.x, me.goal.z - me.z) < 0.5) {
        const i = me.rng.int(0, L.n * L.n - 1);
        if (Math.hypot(L.centerX(i) - me.x, L.centerZ(i) - me.z) < 30) me.goal = { x: L.centerX(i), z: L.centerZ(i) };
      }
      if (me.goal) walkTo(L, me, me.goal.x, me.goal.z, 3, dt, PLAYER_R);
    }
    m.handle(id, { t: 'st', x: me.x, z: me.z, ry: me.ry || 0, rx: 0, lv: me.lv, mv: 1, fl: 0 });
  };
}

const seeds = process.argv.slice(2).length ? process.argv.slice(2) : ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
let failures = 0;

for (const seed of seeds) {
  const level = new Level0(seed);
  level.bfs(level.spawn);
  const unreachable = [...level.dist].filter((d) => d < 0).length;
  const exitDist = level.dist[level.exit.cell];

  const roster = ['You', 'Kevin', 'Dana', 'Marcus'].map((name, i) => ({ id: `p${i}`, name, bot: i > 0, color: i }));
  const events = [];
  const m = new Match({ seed, roster, send: (to, msg) => { if (msg.t !== 's') events.push({ at: m.t, ...msg }); } });
  const human = fakeHuman(m, 'p0');
  const LIMIT = 20 * 60;
  while (!m.over && m.t < LIMIT) { human(TICK); m.step(TICK); }

  const first = (t) => events.find((e) => e.t === t);
  const slip = first('slip');
  const stir = first('stir');
  const over = first('over');
  const arrived = m.players.filter((p) => p.t0 != null).length;
  const results = over ? over.results.map((r) => `${r.name}:${r.st}`).join(' ') : 'none';
  console.log(
    `seed ${seed.padEnd(8)} exit ${String(exitDist).padStart(2)} cells | slip ${slip ? slip.at.toFixed(1) : '-'}s` +
    ` | entity ${stir ? stir.at.toFixed(1) : '-'}s | arrived ${arrived}/4 | caught ${events.filter((e) => e.t === 'caught').length}` +
    ` | over ${over ? over.at.toFixed(0) : '-'}s | ${results}`,
  );
  try {
    assert.equal(unreachable, 0, 'every cell is reachable');
    assert.ok(exitDist >= 20, 'exit is a fair walk away');
    assert.equal(level.items.length > 0, true, 'almond water exists');
    assert.ok(slip, 'someone slipped');
    assert.equal(arrived, 4, 'everyone made it into Level 0');
    assert.ok(stir, 'the entity woke up');
    assert.ok(over, 'the match finished');
    assert.notEqual(over.results[0].st, 'alive', 'the person got out or got caught');
    assert.equal(new Level0(seed).vw.join(), level.vw.join(), 'same seed, same level');
  } catch (e) {
    failures++;
    console.error(`  FAIL (${seed}): ${e.message}`);
  }
}

// with nobody to follow, bots head for the door: every one of them should make it
{
  const roster = ['Kevin', 'Dana', 'Marcus', 'Priya'].map((name, i) => ({ id: `b${i}`, name, bot: true, color: i }));
  let over = null;
  const m = new Match({ seed: 'all-bots', roster, send: (to, msg) => { if (msg.t === 'over') over = msg; } });
  while (!m.over && m.t < 600) m.step(TICK);
  const line = over ? over.results.map((r) => `${r.name}:${r.st}`).join(' ') : 'none';
  console.log(`all bots: over ${m.t.toFixed(0)}s | ${line}`);
  if (!over || over.results.some((r) => r.st !== 'escaped')) { failures++; console.error('  FAIL (all bots): not everyone escaped'); }
}

assert.equal(L0_N % 2, 0, 'the spawn room sits in the middle of the grid');
if (failures) { console.error(`${failures} seed(s) failed`); process.exit(1); }
console.log('all good');
