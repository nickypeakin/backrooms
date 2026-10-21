// The in-game overlay and the menu screens. While you play, the only thing
// on screen is the map (see minimap.js); words appear only in the opening
// cutscene and when you're out of the game.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const COLORS = ['#b8322a', '#2f6fb0', '#2f8a4c', '#d08a1c'];

export class Hud {
  constructor() {
    this.root = $('hud');
    this.last = {};
  }

  show() { this.root.hidden = false; this.banner(null); }
  hide() { this.root.hidden = true; }

  get mapCanvas() { return $('minimap'); }
  showMap(on) { $('minimap').hidden = !on; }

  // cutscenes get letterbox-style subtitles and a skip hint
  cinematic(on) { this.root.classList.toggle('cinematic', on); }

  prompt(text) {
    if (this.last.prompt === text) return;
    this.last.prompt = text;
    $('prompt').textContent = text || '';
  }

  // a line of dialogue (cutscene only)
  say(name, text) {
    const d = document.createElement('div');
    d.innerHTML = `<b>${esc(name)}:</b> ${esc(text)}`;
    const box = $('subs');
    box.appendChild(d);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => d.remove(), 4500);
  }

  // big title card; hides itself after `secs` if given
  banner(title, sub, secs) {
    const b = $('banner');
    clearTimeout(this.bannerTimer);
    b.hidden = !title;
    if (!title) return;
    b.querySelector('h1').textContent = title;
    b.querySelector('p').textContent = sub || '';
    if (secs) this.bannerTimer = setTimeout(() => { b.hidden = true; }, secs * 1000);
  }

  reset() {
    this.last = {};
    this.cinematic(false);
    this.showMap(false);
    $('prompt').textContent = '';
    $('subs').innerHTML = '';
    this.banner(null);
  }
}

// --------------------------------------------------------------- screens --
export function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
}

export function screenShown(id) {
  return !$(id).hidden;
}

export function renderLobby(msg, myId) {
  $('lobbyCode').textContent = msg.code || '·····';
  const amHost = msg.hostId === myId;
  const slots = [];
  for (let i = 0; i < 4; i++) {
    const p = msg.players[i];
    if (p) {
      slots.push(`<li style="--c:${COLORS[p.color % 4]}"><span>${esc(p.name)}${p.id === myId ? ' (you)' : ''}</span><span>${p.id === msg.hostId ? 'HOST' : 'READY'}</span></li>`);
    } else {
      slots.push(`<li class="empty"><span>${msg.fill ? 'Bot coworker' : 'Empty'}</span><span>${msg.fill ? 'BOT' : '-'}</span></li>`);
    }
  }
  $('slots').innerHTML = slots.join('');
  $('fill').checked = msg.fill;
  $('fill').disabled = !amHost;
  $('startBtn').hidden = !amHost;
  $('lobbyWait').textContent = amHost ? '' : 'Waiting for the host to clock in...';
}

export function renderResults(results, myId, amHost) {
  const me = results.find((r) => r.id === myId);
  const anyOut = results.some((r) => r.st === 'escaped');
  $('resultHead').textContent = me && me.st === 'escaped' ? 'YOU GOT OUT' : anyOut ? 'SOME OF YOU GOT OUT' : 'LOST IN THE BACKROOMS';
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const label = { escaped: 'ESCAPED', caught: 'TAKEN', alive: 'STILL WANDERING' };
  $('resultList').innerHTML = results.map((r) =>
    `<li class="${r.st}" style="--c:${COLORS[r.color % 4]}"><span>${esc(r.name)}${r.bot ? ' (bot)' : ''}${r.id === myId ? ' (you)' : ''}</span><span>${label[r.st]} &middot; ${mmss(r.time)} in Level 0</span></li>`).join('');
  $('againBtn').hidden = !amHost;
  $('toLobbyBtn').hidden = !amHost;
  $('resultWait').textContent = amHost ? '' : 'Waiting for the host...';
}

// cls: 'good' or 'bad' to colour the message
export function setMsg(id, text, cls = '') {
  const el = $(id);
  el.textContent = text || '';
  el.className = `msg ${cls}`.trim();
}
