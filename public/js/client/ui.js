// The camcorder HUD and the menu screens.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const COLORS = ['#b8322a', '#2f6fb0', '#2f8a4c', '#d08a1c'];

export class Hud {
  constructor() {
    this.root = $('hud');
    this.last = {};
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const tick = () => {
      const d = new Date();
      const h = d.getHours(), pm = h >= 12;
      const two = (n) => String(n).padStart(2, '0');
      $('tc').textContent = `${pm ? 'PM' : 'AM'} ${two(h % 12 || 12)}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
      $('date').textContent = `${months[d.getMonth()]}. ${two(d.getDate())} 1996`;
    };
    tick();
    setInterval(tick, 1000);
  }

  show() { this.root.hidden = false; this.banner(null); }
  hide() { this.root.hidden = true; }

  get mapCanvas() { return $('minimap'); }
  showMap(on) { $('minimap').hidden = !on; }

  // cutscenes show only subtitles, the title card and the skip hint
  cinematic(on) { this.root.classList.toggle('cinematic', on); }

  set(id, text) {
    if (this.last[id] === text) return;
    this.last[id] = text;
    $(id).textContent = text || '';
  }

  objective(text) { this.set('objective', text); }
  prompt(text) { this.set('prompt', text); }

  bars(sanity, stamina) {
    const s = $('sanity'), st = $('stamina');
    s.hidden = sanity == null;
    st.hidden = stamina == null;
    if (sanity != null) {
      s.querySelector('i').style.width = `${Math.round(sanity * 100)}%`;
      s.classList.toggle('low', sanity < 0.3);
    }
    if (stamina != null) st.querySelector('i').style.width = `${Math.round(stamina * 100)}%`;
  }

  almond(n) { this.set('almond', n == null ? '' : `ALMOND WATER x${n}`); }
  flashlight(on) { $('flashicon').classList.toggle('on', !!on); }

  team(list) {
    const html = list.map((p) => `<li class="${p.me ? 'me' : ''} ${p.out ? 'out' : ''}">${esc(p.name)}${p.bot ? ' (bot)' : ''} <span class="where">- ${esc(p.where)}</span></li>`).join('');
    if (html !== this.last.team) { this.last.team = html; $('team').innerHTML = html; }
  }

  say(name, text) {
    const d = document.createElement('div');
    d.innerHTML = `<b>${esc(name)}:</b> ${esc(text)}`;
    const box = $('subs');
    box.appendChild(d);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => d.remove(), 4500);
  }

  toast(text) {
    const d = document.createElement('div');
    d.textContent = text;
    const box = $('toasts');
    box.appendChild(d);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => d.remove(), 4500);
  }

  flash(text) {
    const f = $('flash');
    f.textContent = text;
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  banner(title, sub) {
    const b = $('banner');
    b.hidden = !title;
    if (title) {
      b.querySelector('h1').textContent = title;
      b.querySelector('p').textContent = sub || '';
    }
  }

  reset() {
    this.last = {};
    this.cinematic(false);
    this.showMap(false);
    for (const id of ['objective', 'prompt', 'almond']) $(id).textContent = '';
    $('subs').innerHTML = '';
    $('toasts').innerHTML = '';
    $('team').innerHTML = '';
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
