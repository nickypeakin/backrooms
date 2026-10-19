// All sound is synthesised with the Web Audio API: the fluorescent hum, the
// store's ceiling-speaker music, footsteps, static and the thing in the walls.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
  }

  // must be called from a user gesture
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // a big empty office: long, dull reverb
    this.verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.4, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3.2);
    }
    this.verb.buffer = ir;
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.12;
    this.verbSend.connect(this.verb).connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.sfx.connect(this.verbSend);

    this.buildHum();
    this.buildMuzak();
  }

  get ready() { return !!this.ctx; }
  get now() { return this.ctx.currentTime; }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.now, 0.05);
  }

  setListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener, p = cam.position;
    const f = cam.getWorldDirection(this._fwd || (this._fwd = cam.position.clone()));
    if (l.positionX) {
      const t = this.now;
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f.x, t); l.forwardY.setValueAtTime(f.y, t); l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  // ------------------------------------------------------------ helpers --
  noiseSrc(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    if (!loop) s.loopStart = 0;
    return s;
  }

  env(gainNode, t, a, peak, dur) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  panner(x, y, z, ref = 2, roll = 1.3) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = roll;
    p.maxDistance = 200;
    this.place(p, x, y, z);
    return p;
  }

  place(p, x, y, z) {
    if (p.positionX) {
      const t = this.now;
      p.positionX.setTargetAtTime(x, t, 0.03); p.positionY.setTargetAtTime(y, t, 0.03); p.positionZ.setTargetAtTime(z, t, 0.03);
    } else p.setPosition(x, y, z);
  }

  out(pos) {
    if (!pos) return this.sfx;
    const p = this.panner(pos.x, pos.y ?? 1.5, pos.z);
    p.connect(this.sfx);
    return p;
  }

  // ---------------------------------------------------------- ambience --
  buildHum() {
    const ctx = this.ctx;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humGain.connect(this.master);
    const mod = ctx.createGain();
    mod.connect(this.humGain);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.connect(mod);
    for (const [f, type, g] of [[120, 'sawtooth', 0.05], [240, 'sine', 0.03], [119.4, 'sawtooth', 0.025], [360, 'sine', 0.008]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const gg = ctx.createGain();
      gg.gain.value = g;
      o.connect(gg).connect(lp);
      o.start();
    }
    const n = this.noiseSrc(true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3400;
    bp.Q.value = 3;
    const ng = ctx.createGain();
    ng.gain.value = 0.012;
    n.connect(bp).connect(ng).connect(mod);
    n.start();
    // the hum swells and sags slowly
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lg = ctx.createGain();
    lg.gain.value = 0.15;
    lfo.connect(lg).connect(mod.gain);
    lfo.start();
  }

  setHum(level, time = 1.5) {
    if (!this.ctx) return;
    this.humGain.gain.setTargetAtTime(level, this.now, time / 3);
  }

  buildMuzak() {
    const ctx = this.ctx;
    this.muzakGain = ctx.createGain();
    this.muzakGain.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 220;
    this.muzakLP = ctx.createBiquadFilter();
    this.muzakLP.type = 'lowpass';
    this.muzakLP.frequency.value = 2800;
    this.muzakBus = ctx.createGain();
    this.muzakBus.connect(hp).connect(this.muzakLP).connect(this.muzakGain).connect(this.master);
    this.muzakGain.connect(this.verbSend);
    this.muzakOn = false;
    this.muzakDetune = 0;
  }

  // easy-listening loop over the ceiling speakers
  startMuzak() {
    if (!this.ctx || this.muzakOn) return;
    this.muzakOn = true;
    this.muzakDetune = 0;
    this.muzakLP.frequency.setValueAtTime(2800, this.now);
    this.muzakGain.gain.setTargetAtTime(0.55, this.now, 0.5);
    const beat = 60 / 84;
    const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65]];
    const scale = [72, 74, 76, 79, 81, 84];
    let next = this.now + 0.1, step = 0;
    const tick = () => {
      if (!this.muzakOn) return;
      while (next < this.now + 0.4) {
        const bar = Math.floor(step / 8) % 4, half = step % 8;
        const ch = chords[bar];
        if (half === 0) for (const m of ch) this.note(mtof(m), next, beat * 3.8, 'triangle', 0.035);
        if (half === 0 || half === 4) this.note(mtof(ch[0] - 24), next, beat * 1.6, 'sine', 0.12);
        if (Math.random() < 0.45) this.note(mtof(scale[Math.floor(Math.random() * scale.length)]), next, beat * 0.9, 'sine', 0.05, true);
        next += beat / 2;
        step++;
      }
    };
    tick();
    this.muzakTimer = setInterval(tick, 120);
  }

  note(freq, t, dur, type, peak, vibrato = false) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = this.muzakDetune;
    if (vibrato) {
      const v = ctx.createOscillator();
      v.frequency.value = 5;
      const vg = ctx.createGain();
      vg.gain.value = 6;
      v.connect(vg).connect(o.detune);
      v.start(t);
      v.stop(t + dur + 0.1);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.08, dur * 0.2));
    g.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.2);
    o.connect(g).connect(this.muzakBus);
    o.start(t);
    o.stop(t + dur + 0.5);
  }

  // the music sags and drowns, as if the tape is being eaten
  warpMuzak() {
    if (!this.muzakOn) return;
    this.muzakDetune = -350;
    this.muzakLP.frequency.setTargetAtTime(380, this.now, 0.6);
    this.muzakGain.gain.setTargetAtTime(0.25, this.now, 0.8);
  }

  stopMuzak(time = 1) {
    if (!this.ctx || !this.muzakOn) return;
    this.muzakOn = false;
    clearInterval(this.muzakTimer);
    this.muzakGain.gain.setTargetAtTime(0, this.now, time / 3);
  }

  // ---------------------------------------------------------- one-shots --
  step(surface, loud = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const n = this.noiseSrc();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    if (surface === 'carpet') {
      f.type = 'lowpass'; f.frequency.value = 420 + Math.random() * 120;
      this.env(g, t, 0.012, 0.28 * loud, 0.13);
    } else if (surface === 'concrete') {
      f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 300; f.Q.value = 0.8;
      this.env(g, t, 0.004, 0.22 * loud, 0.08);
    } else {
      f.type = 'bandpass'; f.frequency.value = 1500 + Math.random() * 500; f.Q.value = 1.1;
      this.env(g, t, 0.003, 0.2 * loud, 0.07);
    }
    n.connect(f).connect(g).connect(this.sfx);
    n.start(t, Math.random() * 1.5, 0.2);
  }

  slip() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(950, t);
    o.frequency.exponentialRampToValueAtTime(2100, t + 0.13);
    const g = ctx.createGain();
    this.env(g, t, 0.01, 0.18, 0.16);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.2);
    this.whoosh(t + 0.15);
  }

  whoosh(t = this.now) {
    const ctx = this.ctx;
    const n = this.noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1600, t + 0.5);
    const g = ctx.createGain();
    this.env(g, t, 0.15, 0.25, 0.6);
    n.connect(f).connect(g).connect(this.sfx);
    n.start(t, 0, 0.7);
  }

  thud(pos, loud = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now, dst = this.out(pos);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    const g = ctx.createGain();
    this.env(g, t, 0.005, 0.7 * loud, 0.4);
    o.connect(g).connect(dst);
    o.start(t);
    o.stop(t + 0.45);
    const n = this.noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const ng = ctx.createGain();
    this.env(ng, t, 0.003, 0.4 * loud, 0.18);
    n.connect(f).connect(ng).connect(dst);
    n.start(t, 0.3, 0.25);
  }

  // tearing static and a sub-bass drop: falling through reality
  noclip(dur = 1.4) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const n = this.noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    for (let k = 0.1; k < dur; k += 0.07) g.gain.setValueAtTime(0.15 + Math.random() * 0.4, t + k);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(hp).connect(g).connect(this.master);
    n.start(t, 0, dur + 0.1);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(18, t + dur);
    const og = ctx.createGain();
    this.env(og, t, 0.05, 0.6, dur);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  pickup() {
    if (!this.ctx) return;
    const t = this.now;
    for (const [f, dt] of [[2350, 0], [3100, 0.07]]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      this.env(g, t + dt, 0.003, 0.09, 0.35);
      o.connect(g).connect(this.sfx);
      o.start(t + dt);
      o.stop(t + dt + 0.4);
    }
  }

  drink() {
    if (!this.ctx) return;
    const t = this.now;
    for (let i = 0; i < 3; i++) {
      const n = this.noiseSrc();
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 380;
      const g = this.ctx.createGain();
      this.env(g, t + i * 0.32, 0.03, 0.5, 0.22);
      n.connect(f).connect(g).connect(this.sfx);
      n.start(t + i * 0.32, Math.random(), 0.3);
    }
  }

  door() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 85;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const g = ctx.createGain();
    this.env(g, t, 0.005, 0.4, 0.3);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.35);
    const c = ctx.createOscillator();
    c.type = 'sawtooth';
    c.frequency.setValueAtTime(280, t + 0.2);
    for (let k = 0; k < 10; k++) c.frequency.setValueAtTime(260 + Math.random() * 140, t + 0.25 + k * 0.08);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 6;
    const cg = ctx.createGain();
    this.env(cg, t + 0.2, 0.1, 0.12, 1.1);
    c.connect(bp).connect(cg).connect(this.sfx);
    c.start(t + 0.2);
    c.stop(t + 1.4);
  }

  distort(amount) {
    const ws = this.ctx.createWaveShaper();
    const k = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      k[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    ws.curve = k;
    return ws;
  }

  roar(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now, dst = this.out(pos);
    const ws = this.distort(30);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    const g = ctx.createGain();
    this.env(g, t, 0.15, 0.55, 2.2);
    ws.connect(lp).connect(g).connect(dst);
    for (const base of [62, 93, 141]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.5, t + 0.5);
      o.frequency.linearRampToValueAtTime(base * 0.8, t + 2.1);
      o.connect(ws);
      o.start(t);
      o.stop(t + 2.3);
    }
    const n = this.noiseSrc();
    n.connect(ws);
    n.start(t, 0, 2.2);
  }

  jumpscare() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const ws = this.distort(80);
    const g = ctx.createGain();
    this.env(g, t, 0.01, 0.9, 1.6);
    ws.connect(g).connect(this.master);
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(300 + i * 170, t);
      for (let k = 0; k < 14; k++) o.frequency.setValueAtTime(250 + Math.random() * 1400, t + k * 0.1);
      o.connect(ws);
      o.start(t);
      o.stop(t + 1.6);
    }
    const n = this.noiseSrc();
    n.connect(ws);
    n.start(t, 0, 1.6);
  }

  // half-heard voices that aren't there
  whisper() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7;
    for (let k = 0; k < 12; k++) bp.frequency.setValueAtTime(600 + Math.random() * 2200, t + k * 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < 12; k++) g.gain.setValueAtTime(Math.random() < 0.7 ? 0.25 : 0.02, t + k * 0.13);
    g.gain.setValueAtTime(0.0001, t + 1.6);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() < 0.5 ? -0.8 : 0.8;
    n.connect(bp).connect(g).connect(pan).connect(this.sfx);
    n.start(t, Math.random(), 1.7);
  }

  // something heavy, far away
  distant(pos) {
    if (!this.ctx) return;
    for (let i = 0; i < 3; i++) setTimeout(() => this.thud(pos, 0.5), i * 420);
  }

  // ---------------------------------------------------- positional loops --
  loop(kind) {
    const ctx = this.ctx;
    const p = this.panner(0, 1.5, 0, kind === 'exit' ? 1.5 : 2.5, kind === 'exit' ? 1.6 : 1.1);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(p).connect(this.sfx);
    const nodes = [];
    if (kind === 'exit') {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 60;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1250;
      bp.Q.value = 2;
      const og = ctx.createGain();
      og.gain.value = 0.08;
      o.connect(bp).connect(og).connect(g);
      o.start();
      nodes.push(o);
    } else {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      lp.connect(g);
      for (const f of [44, 46.5, 88.7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = 0.12;
        o.connect(og).connect(lp);
        o.start();
        nodes.push(o);
      }
      const n = this.noiseSrc(true);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 260;
      const ng = ctx.createGain();
      ng.gain.value = 0.35;
      n.connect(bp).connect(ng).connect(g);
      n.start();
      nodes.push(n);
    }
    return { p, g, nodes };
  }

  setLoop(kind, pos, level) {
    if (!this.ctx) return;
    const key = `${kind}Loop`;
    if (!this[key]) this[key] = this.loop(kind);
    const l = this[key];
    if (pos) this.place(l.p, pos.x, pos.y ?? 1.5, pos.z);
    l.g.gain.setTargetAtTime(level, this.now, 0.25);
  }

  // everything situational off (between matches)
  quiet() {
    if (!this.ctx) return;
    this.stopMuzak(0.5);
    this.setHum(0, 0.6);
    this.setLoop('entity', null, 0);
    this.setLoop('exit', null, 0);
  }
}

export const sound = new Sound();
