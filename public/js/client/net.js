// How this tab talks to the match. If you host (or play solo) the lobby runs
// right here and your own messages are plain function calls. Friends who
// join by code connect to the host's browser over a WebRTC data channel; the
// free PeerJS service is only used to find each other by lobby code.

import { Lobby } from '../host/lobby.js';
import { PEER_PREFIX } from '../shared/config.js';

const JOIN_TIMEOUT = 20000;
const SILENCE = 12000;          // pings flow every 2 s, so this means they're gone
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

let peerLib = null;
function loadPeer() {
  if (!peerLib) {
    peerLib = new Promise((resolve, reject) => {
      if (window.Peer) { resolve(window.Peer); return; }
      const s = document.createElement('script');
      s.src = new URL('../../vendor/peerjs.min.js', import.meta.url).href;
      s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS missing')));
      s.onerror = () => { peerLib = null; reject(new Error('Could not load PeerJS')); };
      document.head.appendChild(s);
    });
  }
  return peerLib;
}

// ?peer=host:port points at a self-hosted PeerJS server (used by tests)
function peerOptions() {
  const v = new URLSearchParams(location.search).get('peer');
  const opts = { debug: 1 };
  if (v) {
    const [host, port] = v.split(':');
    Object.assign(opts, { host, port: Number(port) || 9000, path: '/', secure: false });
  }
  return opts;
}

// Browsers slow timers in background tabs to about once a second, which
// would stall the match for everyone if the host switched tabs. Timers in a
// worker keep their pace, so the host's match clock ticks from one.
function workerTicker(fn, ms) {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = fn;
    return () => { w.terminate(); URL.revokeObjectURL(url); };
  } catch {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
}

export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

class Emitter {
  constructor() { this.handlers = new Map(); }
  on(t, fn) {
    if (!this.handlers.has(t)) this.handlers.set(t, new Set());
    this.handlers.get(t).add(fn);
    return () => this.handlers.get(t).delete(fn);
  }
  emit(msg) {
    for (const fn of this.handlers.get(msg.t) || []) fn(msg);
    for (const fn of this.handlers.get('*') || []) fn(msg);
  }
}

// ------------------------------------------------------------------ host --
export class HostLink extends Emitter {
  constructor(name, { online = false } = {}) {
    super();
    this.isHost = true;
    this.lobby = new Lobby({ ticker: workerTicker });
    this.guests = new Set();
    this.id = this.lobby.add(name, (msg) => queueMicrotask(() => this.emit(msg)));
    if (online) this.goOnline();
  }

  send(msg) { this.lobby.fromPlayer(this.id, msg); }

  async goOnline() {
    let Peer;
    try { Peer = await loadPeer(); } catch {
      this.emit({ t: 'neterror', text: 'Could not load the multiplayer library. Check your internet connection.' });
      return;
    }
    for (let attempt = 0; attempt < 5 && !this.closed; attempt++) {
      const code = makeCode();
      try {
        await this.listen(Peer, code);
        this.lobby.code = code;
        this.lobby.sendLobby();
        this.pinger = setInterval(() => this.heartbeat(), 2000);
        return;
      } catch (e) {
        if (e && e.type === 'unavailable-id') continue;
        this.emit({ t: 'neterror', text: `Couldn't reach the matchmaking service (${(e && e.type) || 'error'}). You can still play solo.` });
        return;
      }
    }
  }

  listen(Peer, code) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(PEER_PREFIX + code, peerOptions());
      let open = false;
      peer.on('open', () => { open = true; this.peer = peer; resolve(); });
      peer.on('error', (e) => {
        if (!open) { peer.destroy(); reject(e); return; }
        console.warn('peer error', e.type);
      });
      // keep the code registered so more friends can still find us
      peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) peer.reconnect(); });
      peer.on('connection', (conn) => this.accept(conn));
    });
  }

  accept(conn) {
    const g = { conn, id: null, last: performance.now() };
    this.guests.add(g);
    const drop = () => {
      if (!this.guests.has(g)) return;
      this.guests.delete(g);
      if (g.id) this.lobby.remove(g.id);
      try { conn.close(); } catch { /* already closed */ }
    };
    g.drop = drop;
    conn.on('data', (msg) => {
      g.last = performance.now();
      if (!msg || typeof msg !== 'object') return;
      if (g.id == null) {
        if (msg.t !== 'hello') return;
        g.id = this.lobby.add(msg.name, (m) => { if (conn.open) conn.send(m); });
        if (!g.id) setTimeout(drop, 1000);
        return;
      }
      this.lobby.fromPlayer(g.id, msg);
    });
    conn.on('close', drop);
    conn.on('error', drop);
  }

  heartbeat() {
    const now = performance.now();
    for (const g of [...this.guests]) {
      if (now - g.last > SILENCE) g.drop();
      else if (g.conn.open) g.conn.send({ t: 'ping' });
    }
  }

  close() {
    this.closed = true;
    clearInterval(this.pinger);
    this.lobby.close();
    for (const g of this.guests) try { g.conn.close(); } catch { /* gone */ }
    if (this.peer) this.peer.destroy();
  }
}

// ----------------------------------------------------------------- guest --
export class GuestLink extends Emitter {
  constructor(name, code) {
    super();
    this.isHost = false;
    this.name = name;
    this.code = code.toUpperCase().replace(/[^A-Z]/g, '');
  }

  connect() {
    return new Promise(async (resolve, reject) => {
      const fail = (text) => { this.close(); reject(new Error(text)); };
      const timer = setTimeout(() => fail(`Couldn't reach lobby ${this.code}. Check the code and make sure the host still has the game open.`), JOIN_TIMEOUT);
      let Peer;
      try { Peer = await loadPeer(); } catch { clearTimeout(timer); fail('Could not load the multiplayer library. Check your internet connection.'); return; }
      const peer = (this.peer = new Peer(peerOptions()));
      peer.on('error', (e) => {
        clearTimeout(timer);
        if (e.type === 'peer-unavailable') fail(`There's no lobby with code ${this.code}. The host may have closed the game.`);
        else if (!this.id) fail(`Couldn't connect to lobby ${this.code} (${e.type}).`);
      });
      peer.on('open', () => {
        const conn = (this.conn = peer.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'json' }));
        conn.on('open', () => {
          this.last = performance.now();
          conn.send({ t: 'hello', name: this.name });
          this.pinger = setInterval(() => {
            if (performance.now() - this.last > SILENCE) this.lost();
            else if (conn.open) conn.send({ t: 'ping' });
          }, 2000);
        });
        conn.on('data', (msg) => {
          this.last = performance.now();
          if (!msg || typeof msg !== 'object' || msg.t === 'ping') return;
          if (msg.t === 'welcome') { this.id = msg.id; clearTimeout(timer); resolve(); }
          if (msg.t === 'refused') { clearTimeout(timer); fail(msg.text); return; }
          this.emit(msg);
        });
        conn.on('close', () => this.lost());
      });
    });
  }

  lost() {
    if (this.closed) return;
    this.close();
    this.emit({ t: 'closed', text: 'Lost connection to the host.' });
  }

  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }

  close() {
    this.closed = true;
    clearInterval(this.pinger);
    try { if (this.conn) this.conn.close(); } catch { /* gone */ }
    if (this.peer) this.peer.destroy();
  }
}
