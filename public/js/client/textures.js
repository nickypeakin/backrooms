// Every texture in the game is painted onto a canvas at start-up: there are
// no image files to download.

import * as THREE from 'three';
import { makeRng } from '../shared/rng.js';

const cache = new Map();

// Textures are painted in "design" pixels and stored at twice that size so
// they stay sharp up close.
const SCALE = 2;
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w * SCALE;
  c.height = h * SCALE;
  const x = c.getContext('2d');
  x.scale(SCALE, SCALE);
  return [c, x];
}

function toTexture(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// per-pixel brightness noise
function grain(ctx, w, h, amount, rng) {
  const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function blotch(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', alpha));
  g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// ---------------------------------------------------------------- Level 0 --
export const wallpaper = () => cached('wallpaper', () => {
  const S = 256, rng = makeRng('wallpaper');
  const [c, x] = canvas(S, S);
  x.fillStyle = '#c9b45f';
  x.fillRect(0, 0, S, S);
  // faint vertical bands
  for (let i = 0; i < S; i += 32) {
    x.fillStyle = 'rgba(255,240,170,0.10)';
    x.fillRect(i, 0, 14, S);
    x.fillStyle = 'rgba(90,70,20,0.06)';
    x.fillRect(i + 14, 0, 2, S);
  }
  // the little repeating motif
  x.strokeStyle = 'rgba(120,96,30,0.22)';
  x.lineWidth = 1.5;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cx = col * 32 + (row % 2 ? 23 : 7), cy = row * 32 + 16;
      x.beginPath();
      x.moveTo(cx, cy - 6); x.lineTo(cx + 4, cy); x.lineTo(cx, cy + 6); x.lineTo(cx - 4, cy);
      x.closePath();
      x.stroke();
    }
  }
  for (let k = 0; k < 7; k++) blotch(x, rng() * S, rng() * S, 20 + rng() * 50, 'rgba(110,85,25,A)', 0.08 + rng() * 0.08);
  grain(x, S, S, 14, rng);
  return toTexture(c);
});

export const carpet = () => cached('carpet', () => {
  const S = 256, rng = makeRng('carpet');
  const [c, x] = canvas(S, S);
  x.fillStyle = '#a28f55';
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 9000; k++) {
    const v = rng();
    x.fillStyle = v < 0.5 ? 'rgba(70,55,20,0.18)' : 'rgba(230,210,140,0.14)';
    x.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  for (let k = 0; k < 5; k++) blotch(x, rng() * S, rng() * S, 25 + rng() * 45, 'rgba(60,45,15,A)', 0.12 + rng() * 0.1);
  grain(x, S, S, 20, rng);
  return toTexture(c);
});

export const ceilingTile = (tint = '#d9d2b0', key = 'ceilingTile') => cached(key, () => {
  const S = 256, rng = makeRng(key);
  const [c, x] = canvas(S, S);
  x.fillStyle = tint;
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 2600; k++) {
    x.fillStyle = `rgba(90,80,50,${0.12 + rng() * 0.2})`;
    x.fillRect(rng() * S, rng() * S, 1.4, 1.4);
  }
  x.strokeStyle = 'rgba(110,100,70,0.75)';
  x.lineWidth = 4;
  x.strokeRect(0, 0, S, S);
  x.beginPath(); x.moveTo(S / 2, 0); x.lineTo(S / 2, S); x.moveTo(0, S / 2); x.lineTo(S, S / 2); x.stroke();
  blotch(x, rng() * S, rng() * S, 40, 'rgba(140,110,40,A)', 0.18);
  grain(x, S, S, 10, rng);
  return toTexture(c);
});

// ------------------------------------------------------------------ store --
export const storeFloor = () => cached('storeFloor', () => {
  const S = 256, rng = makeRng('storeFloor');
  const [c, x] = canvas(S, S);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const v = 214 + Math.floor(rng() * 14);
      x.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
      x.fillRect(i * 64, j * 64, 64, 64);
    }
  }
  x.strokeStyle = 'rgba(120,115,105,0.55)';
  x.lineWidth = 2;
  for (let i = 0; i <= S; i += 64) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke();
  }
  grain(x, S, S, 8, rng);
  return toTexture(c);
});

export const plainWall = (tint = '#ece8df', key = 'plainWall') => cached(key, () => {
  const S = 128, rng = makeRng(key);
  const [c, x] = canvas(S, S);
  x.fillStyle = tint;
  x.fillRect(0, 0, S, S);
  grain(x, S, S, 7, rng);
  return toTexture(c);
});

export const blockWall = () => cached('blockWall', () => {
  const S = 256, rng = makeRng('blockWall');
  const [c, x] = canvas(S, S);
  x.fillStyle = '#b9b4a6';
  x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(80,76,66,0.45)';
  x.lineWidth = 3;
  for (let row = 0; row < 4; row++) {
    const y = row * 64;
    x.beginPath(); x.moveTo(0, y); x.lineTo(S, y); x.stroke();
    for (let col = 0; col < 2; col++) {
      const bx = col * 128 + (row % 2) * 64;
      x.beginPath(); x.moveTo(bx, y); x.lineTo(bx, y + 64); x.stroke();
    }
  }
  grain(x, S, S, 16, rng);
  return toTexture(c);
});

export const concrete = () => cached('concrete', () => {
  const S = 256, rng = makeRng('concrete');
  const [c, x] = canvas(S, S);
  x.fillStyle = '#8f8b84';
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 10; k++) blotch(x, rng() * S, rng() * S, 30 + rng() * 40, 'rgba(60,58,52,A)', 0.15);
  grain(x, S, S, 22, rng);
  return toTexture(c);
});

export const wood = (tone = '#8a5a35', key = 'wood') => cached(key, () => {
  const S = 256, rng = makeRng(key);
  const [c, x] = canvas(S, S);
  x.fillStyle = tone;
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 70; k++) {
    const y = rng() * S;
    x.strokeStyle = `rgba(40,20,5,${0.05 + rng() * 0.12})`;
    x.lineWidth = 1 + rng() * 2;
    x.beginPath();
    x.moveTo(0, y);
    for (let i = 0; i <= S; i += 32) x.lineTo(i, y + Math.sin(i * 0.03 + k) * 3);
    x.stroke();
  }
  grain(x, S, S, 10, rng);
  return toTexture(c);
});

export const fabric = () => cached('fabric', () => {
  const S = 128, rng = makeRng('fabric');
  const [c, x] = canvas(S, S);
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 2) {
    x.fillStyle = 'rgba(0,0,0,0.045)';
    x.fillRect(i, 0, 1, S);
    x.fillRect(0, i, S, 1);
  }
  grain(x, S, S, 14, rng);
  return toTexture(c);
});

export const rugPattern = (color) => cached(`rug${color}`, () => {
  const S = 256, rng = makeRng(`rug${color}`);
  const [c, x] = canvas(S, S);
  const base = new THREE.Color(color);
  x.fillStyle = `#${base.getHexString()}`;
  x.fillRect(0, 0, S, S);
  const light = base.clone().lerp(new THREE.Color(0xf0e6d0), 0.45);
  x.strokeStyle = `#${light.getHexString()}`;
  x.lineWidth = 6;
  x.strokeRect(14, 14, S - 28, S - 28);
  x.lineWidth = 2;
  x.strokeRect(28, 28, S - 56, S - 56);
  x.beginPath();
  x.moveTo(S / 2, 50); x.lineTo(S - 50, S / 2); x.lineTo(S / 2, S - 50); x.lineTo(50, S / 2); x.closePath();
  x.stroke();
  grain(x, S, S, 18, rng);
  return toTexture(c, { repeat: false });
});

export const books = () => cached('books', () => {
  const W = 256, H = 64, rng = makeRng('books');
  const [c, x] = canvas(W, H);
  x.fillStyle = '#2a2018';
  x.fillRect(0, 0, W, H);
  const colors = ['#7a2b22', '#2b4a6b', '#3d5a35', '#c9b27a', '#5b3b5e', '#a8642c', '#d8d0c0', '#333'];
  let px = 2;
  while (px < W - 4) {
    const w = 6 + rng() * 10, h = H * (0.62 + rng() * 0.36);
    x.fillStyle = colors[Math.floor(rng() * colors.length)];
    x.fillRect(px, H - h, w, h);
    x.fillStyle = 'rgba(255,255,255,0.18)';
    x.fillRect(px + 1, H - h + 6, w - 2, 2);
    px += w + 1;
  }
  return toTexture(c, { repeat: false });
});

// ------------------------------------------------------------------ signs --
export function sign(text, { w = 512, h = 128, bg = '#1d3b2a', fg = '#f2f0e6', font = 'bold 64px Arial, sans-serif', border = null } = {}) {
  return cached(`sign:${text}:${bg}:${fg}:${w}x${h}:${font}`, () => {
    const [c, x] = canvas(w, h);
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    if (border) {
      x.strokeStyle = border;
      x.lineWidth = 8;
      x.strokeRect(6, 6, w - 12, h - 12);
    }
    x.fillStyle = fg;
    x.font = font;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const lines = text.split('\n');
    lines.forEach((ln, i) => x.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (h / (lines.length + 0.6))));
    return toTexture(c, { repeat: false });
  });
}

// a hand-drawn marker arrow pointing right
export const arrowDecal = () => cached('arrow', () => {
  const W = 256, H = 128, rng = makeRng('arrow');
  const [c, x] = canvas(W, H);
  x.clearRect(0, 0, W, H);
  x.strokeStyle = 'rgba(25,18,12,0.85)';
  x.lineCap = 'round';
  x.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    x.lineWidth = 11 - pass * 3;
    const j = () => (rng() - 0.5) * 6;
    x.beginPath();
    x.moveTo(24 + j(), 64 + j());
    x.lineTo(200 + j(), 62 + j());
    x.moveTo(150 + j(), 26 + j());
    x.lineTo(206 + j(), 63 + j());
    x.lineTo(152 + j(), 100 + j());
    x.stroke();
  }
  const t = toTexture(c, { repeat: false });
  return t;
});

export const puddle = () => cached('puddle', () => {
  const S = 256, rng = makeRng('puddle');
  const [c, x] = canvas(S, S);
  x.clearRect(0, 0, S, S);
  x.fillStyle = 'rgba(255,255,255,1)';
  x.beginPath();
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 12) {
    const r = S * (0.32 + rng() * 0.14);
    const px = S / 2 + Math.cos(a) * r, py = S / 2 + Math.sin(a) * r * 0.8;
    if (a === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.closePath();
  x.filter = 'blur(6px)';
  x.fill();
  return toTexture(c, { repeat: false, srgb: false });
});

// an abstract print for the store walls
export const painting = (seed) => cached(`painting${seed}`, () => {
  const W = 256, H = 192, rng = makeRng(`painting${seed}`);
  const [c, x] = canvas(W, H);
  const palettes = [
    ['#e9e1cf', '#c96a3d', '#2f4858', '#d9a441', '#8aa39b'],
    ['#f1ece2', '#3d5a80', '#98c1d9', '#ee6c4d', '#293241'],
    ['#efe6d8', '#6b705c', '#a5a58d', '#cb997e', '#3f4238'],
  ];
  const pal = palettes[seed % palettes.length];
  x.fillStyle = pal[0];
  x.fillRect(0, 0, W, H);
  for (let k = 0; k < 7; k++) {
    x.fillStyle = pal[1 + Math.floor(rng() * (pal.length - 1))];
    x.globalAlpha = 0.65 + rng() * 0.35;
    if (rng() < 0.5) {
      x.beginPath();
      x.arc(rng() * W, rng() * H, 18 + rng() * 60, 0, Math.PI * 2);
      x.fill();
    } else x.fillRect(rng() * W * 0.8, rng() * H * 0.8, 30 + rng() * 120, 14 + rng() * 80);
  }
  x.globalAlpha = 1;
  grain(x, W, H, 10, rng);
  return toTexture(c, { repeat: false });
});

export const almondLabel = () => cached('almondLabel', () => {
  const [c, x] = canvas(256, 128);
  x.fillStyle = '#f4efe2';
  x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#6b8fb3';
  x.fillRect(0, 0, 256, 18);
  x.fillRect(0, 110, 256, 18);
  x.fillStyle = '#3c3326';
  x.font = 'bold 34px Georgia, serif';
  x.textAlign = 'center';
  x.fillText('ALMOND', 128, 58);
  x.font = '26px Georgia, serif';
  x.fillText('WATER', 128, 90);
  return toTexture(c, { repeat: false });
});
