// Tuning numbers shared by the host simulation and every client.

export const MAX_PLAYERS = 4;
export const PEER_PREFIX = 'bdb-backrooms-noclip-';

// people
export const PLAYER_R = 0.3;
export const EYE = 1.62;
export const WALK = 3.0;
export const SPRINT = 5.3;
export const STAMINA_MAX = 5;       // seconds of sprinting
export const STAMINA_REGEN = 0.6;   // seconds of stamina regained per second

// Level 0: a square grid of CELL-sized rooms whose edges may carry a wall
export const CELL = 3;
export const L0_N = 52;
export const L0_H = 2.75;
export const WALL_T = 0.2;
export const PILLAR = 0.7;
export const ALMOND_COUNT = 34;

// sanity drains in Level 0; almond water restores it
export const SANITY = {
  max: 100,
  drain: 0.16,        // per second with a teammate close by
  drainAlone: 0.42,   // per second with nobody within `buddy` metres
  drainEntity: 1.6,   // extra per second while it is within 12 m
  buddy: 8,
  almond: 35,
};

// the thing that lives in Level 0
export const ENTITY = {
  wakeDelay: 40,      // seconds after the first person arrives
  roam: 1.9,
  investigate: 2.9,
  chase: 4.45,
  radius: 0.35,
  catchDist: 0.9,
  seeDist: 22,
  hearSprint: 15,
  hearWalk: 4.5,
  hearLost: 45,       // a player at zero sanity can be heard from this far
  giveUp: 5,          // seconds without seeing its target before it stops chasing
  maxChase: 28,
  respawn: 12,        // seconds it stays away after catching someone
};

// furniture store
export const STORE_H = 3.6;
export const HALL_H = 2.8;

// the opening cutscene: closing time, the slip, following through the wall
export const INTRO_LEN = 34;

// simulation
export const TICK = 1 / 20;
export const SNAP_EVERY = 3;        // ticks between snapshots (about 15 Hz)
export const ESCAPE_GRACE = 4;      // seconds bots get to follow the last person out
