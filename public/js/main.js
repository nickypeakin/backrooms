// Start-up and menu flow: title screen, solo / host / join, lobby, the match
// itself, pause and results.

import * as THREE from 'three';
import { VHS } from './client/vhs.js';
import { Input } from './client/input.js';
import { Hud, showScreen, screenShown, renderLobby, renderResults, setMsg } from './client/ui.js';
import { HostLink, GuestLink } from './client/net.js';
import { Game } from './client/game.js';
import { Attract } from './client/attract.js';
import { sound } from './client/audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch {
  setMsg('titleMsg', 'Your browser could not start WebGL, which this game needs. Try Chrome, Edge or Firefox on a computer.');
  throw new Error('WebGL unavailable');
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const vhs = new VHS(renderer);
const input = new Input(canvas);
const hud = new Hud();
const attract = new Attract();

// ------------------------------------------------------------- settings --
const params = new URLSearchParams(location.search);
const SETTINGS_KEY = 'backrooms-closing-time';
const settings = { name: '', sens: 1, vol: 0.8, invert: false, look: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch { /* private mode */ }
const save = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ } };
sound.volume = settings.vol;
vhs.look = settings.look ? 1 : 0;

const DEFAULT_NAMES = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Jamie', 'Taylor'];
$('name').value = settings.name || DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];
$('sens').value = settings.sens;
$('vol').value = settings.vol;
$('invert').checked = settings.invert;
$('sens').addEventListener('input', (e) => { settings.sens = +e.target.value; save(); });
$('vol').addEventListener('input', (e) => { settings.vol = +e.target.value; sound.setVolume(settings.vol); save(); });
$('invert').addEventListener('change', (e) => { settings.invert = e.target.checked; save(); });
$('look').checked = settings.look;
$('look').addEventListener('change', (e) => { settings.look = e.target.checked; vhs.look = settings.look ? 1 : 0; save(); });

if (params.get('join')) $('code').value = params.get('join').toUpperCase().slice(0, 5);
document.fonts?.load('40px VT323').catch(() => {});

// ---------------------------------------------------------------- state --
let link = null;
let game = null;
let solo = false;
let backTo = 'title';
let paused = false;

// Resolution adapts to the computer: if frames take too long the picture
// renders at a lower resolution, and climbs back once there's headroom.
// `?scale=0.5` fixes it (used by tests).
const fixedScale = Number(params.get('scale')) || 0;
let quality = fixedScale || 1;
let frameAvg = 1 / 60, judgeT = 0, calmT = 0;
function adaptQuality(dt) {
  if (fixedScale) return;
  frameAvg += (dt - frameAvg) * 0.05;
  judgeT += dt;
  calmT += dt;
  if (judgeT < 2) return;
  judgeT = 0;
  let next = quality;
  if (frameAvg > 1 / 35 && quality > 0.5) { next = Math.max(0.5, quality - 0.15); calmT = 0; }
  else if (frameAvg < 1 / 57 && quality < 1 && calmT > 8) next = Math.min(1, quality + 0.1);
  if (next !== quality) {
    quality = next;
    vhs.setSize(innerWidth, innerHeight, quality);
  }
}

function resize() {
  const w = innerWidth, h = innerHeight;
  vhs.setSize(w, h, quality);
  attract.resize(w, h);
  if (game) game.resize(w, h);
}
addEventListener('resize', resize);
resize();

function playerName() {
  const n = $('name').value.trim() || 'Employee';
  settings.name = n;
  save();
  return n;
}

// the title screen hums once the browser lets us make sound
addEventListener('pointerdown', () => {
  if (!sound.ready) { sound.init(); sound.setVolume(settings.vol); }
  if (!game) sound.setHum(0.3, 2);
}, { once: true });

function begin() {
  sound.init();
  sound.setVolume(settings.vol);
  if (link) link.close();
  link = null;
  setMsg('titleMsg', '');
  setMsg('lobbyMsg', '');
}

function wire(l) {
  l.on('lobby', (m) => {
    if (l !== link || game || solo) return;
    showScreen('lobby');
    renderLobby(m, l.id);
  });
  l.on('status', (m) => { if (l === link && !game) setMsg(l.isHost ? 'lobbyMsg' : 'titleMsg', m.text); });
  l.on('start', (m) => { if (l === link) startGame(m); });
  l.on('over', (m) => { if (l === link) endGame(m.results); });
  l.on('closed', (m) => { if (l === link) { leave(); setMsg('titleMsg', m.text); } });
  l.on('neterror', (m) => { if (l === link) setMsg('lobbyMsg', m.text); });
}

const actions = {
  solo() {
    begin();
    solo = true;
    link = new HostLink(playerName());
    wire(link);
    link.send({ t: 'start', fill: true });
  },
  host() {
    begin();
    solo = false;
    link = new HostLink(playerName(), { online: true });
    wire(link);
    showScreen('lobby');
  },
  join() {
    const code = $('code').value.toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 5) { setMsg('titleMsg', 'Lobby codes are 5 letters.'); return; }
    begin();
    solo = false;
    const l = (link = new GuestLink(playerName(), code));
    wire(l);
    l.connect().then(() => setMsg('titleMsg', '')).catch((e) => {
      if (link === l) link = null;
      setMsg('titleMsg', e.message);
    });
  },
  help() { backTo = currentScreen(); showScreen('help'); },
  settings() { backTo = currentScreen(); showScreen('settings'); },
  back() { showScreen(backTo); },
  copy() {
    const code = $('lobbyCode').textContent;
    if (!/^[A-Z]{5}$/.test(code)) return;
    const url = `${location.origin}${location.pathname}?join=${code}`;
    navigator.clipboard?.writeText(url).then(
      () => setMsg('lobbyMsg', 'Invite link copied. Send it to your friends.'),
      () => setMsg('lobbyMsg', url),
    );
  },
  start() { link?.send({ t: 'start', fill: $('fill').checked }); },
  again() { link?.send({ t: 'start' }); },
  tolobby() { link?.send({ t: 'tolobby' }); },
  leave: () => leave(),
  menu: () => leave(),
  quit: () => leave(),
  resume() {
    showScreen(null);
    input.lock();
    setPaused(false);
  },
};

function currentScreen() {
  for (const id of ['title', 'lobby', 'pause', 'results']) if (screenShown(id)) return id;
  return 'title';
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (b && actions[b.dataset.act]) actions[b.dataset.act]();
});
$('fill').addEventListener('change', (e) => link?.send({ t: 'fill', fill: e.target.checked }));
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.join(); });

// ---------------------------------------------------------------- match --
function startGame(m) {
  if (game) disposeGame();
  hud.reset();
  game = new Game({ renderer, vhs, link, start: m, hud, input, settings });
  game.resize(innerWidth, innerHeight);
  setPaused(false);
  showScreen(null);
  input.lock();
  setTimeout(() => { if (game && !input.locked && !screenShown('pause')) showScreen('clickToPlay'); }, 400);
  window.__game = game; // handle for automated browser tests
}

function endGame(results) {
  const amHost = !!link?.isHost;
  disposeGame();
  input.unlock();
  renderResults(results, link?.id, amHost);
  $('toLobbyBtn').hidden = !amHost || solo;
  showScreen('results');
  sound.setHum(0.3, 2);
}

function disposeGame() {
  game.dispose();
  game = null;
  window.__game = null;
  hud.hide();
  hud.reset();
}

function leave() {
  if (link) link.close();
  link = null;
  solo = false;
  if (game) disposeGame();
  setPaused(false);
  input.unlock();
  showScreen('title');
  sound.quiet();
  if (sound.ready) sound.setHum(0.3, 2);
}

// solo games really pause; with friends the world keeps going
function setPaused(on) {
  paused = on && solo;
  if (link && link.lobby) link.lobby.paused = paused;
}

document.addEventListener('pointerlockchange', () => {
  if (!game) return;
  if (input.locked) {
    showScreen(null);
    setPaused(false);
  } else {
    showScreen('pause');
    setMsg('pauseNote', solo ? '' : "Heads up: the game keeps going for everyone else while you're paused.");
    setPaused(true);
  }
});
canvas.addEventListener('click', () => { if (game && !input.locked) actions.resume(); });

// ----------------------------------------------------------------- loop --
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  adaptQuality(dt);
  if (game) {
    if (!paused) game.update(dt);
    game.render();
  } else {
    attract.update(dt);
    vhs.render(attract.view.scene, attract.camera, { time: now / 1000 });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

showScreen('title');
