// The map in the top-left corner. It only shows what you have actually seen
// of Level 0, turns with you (straight ahead is always up), and marks your
// teammates, almond water you've spotted and the exit once you've found it.

import { CELL } from '../shared/config.js';
import { COLORS } from './ui.js';

const RANGE = 15;   // metres from the centre to the edge of the map

export class Minimap {
  constructor(canvas, level) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.level = level;
    this.seen = new Uint8Array(level.n * level.n);
    this.revealT = 0;
    this.drawT = 0;
  }

  // Mark the squares you can see from (x, z): the ones right around you,
  // plus anything with a clear line of sight within 16 m.
  reveal(x, z) {
    const L = this.level, n = L.n;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let dz = -5; dz <= 5; dz++) {
      for (let dx = -5; dx <= 5; dx++) {
        const gx = cx + dx, gz = cz + dz;
        if (!L.inside(gx, gz)) continue;
        const i = gz * n + gx;
        if (this.seen[i]) continue;
        const wx = (gx + 0.5) * CELL, wz = (gz + 0.5) * CELL;
        if ((Math.abs(dx) <= 1 && Math.abs(dz) <= 1) || (Math.hypot(wx - x, wz - z) < 16 && L.los(x, z, wx, wz))) this.seen[i] = 1;
      }
    }
  }

  update(dt, view) {
    this.revealT -= dt;
    if (this.revealT <= 0) {
      this.revealT = 0.2;
      this.reveal(view.x, view.z);
    }
    this.drawT -= dt;
    if (this.drawT <= 0) {
      this.drawT = 1 / 30;
      this.draw(view);
    }
  }

  draw({ x, z, ry, mates, taken }) {
    const L = this.level, n = L.n, ctx = this.ctx;
    const S = this.canvas.width, R = S / 2, k = R / RANGE;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(10, 8, 2, 0.72)';
    ctx.fillRect(0, 0, S, S);

    ctx.translate(R, R);
    ctx.rotate(ry);
    const mx = (wx) => (wx - x) * k, mz = (wz) => (wz - z) * k;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), span = Math.ceil(RANGE * 1.5 / CELL);
    const c = CELL * k;

    // floor you've seen
    ctx.fillStyle = 'rgba(201, 180, 95, 0.32)';
    for (let gz = cz - span; gz <= cz + span; gz++) {
      for (let gx = cx - span; gx <= cx + span; gx++) {
        if (!L.inside(gx, gz) || !this.seen[gz * n + gx]) continue;
        ctx.fillRect(mx(gx * CELL) - 0.5, mz(gz * CELL) - 0.5, c + 1, c + 1);
      }
    }
    // walls around it
    ctx.strokeStyle = '#f1e3a0';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let gz = cz - span; gz <= cz + span; gz++) {
      for (let gx = cx - span; gx <= cx + span; gx++) {
        if (!L.inside(gx, gz) || !this.seen[gz * n + gx]) continue;
        const x0 = mx(gx * CELL), z0 = mz(gz * CELL);
        if (L.wall(gx, gz, 0)) { ctx.moveTo(x0, z0); ctx.lineTo(x0 + c, z0); }
        if (L.wall(gx, gz, 2)) { ctx.moveTo(x0, z0 + c); ctx.lineTo(x0 + c, z0 + c); }
        if (L.wall(gx, gz, 3)) { ctx.moveTo(x0, z0); ctx.lineTo(x0, z0 + c); }
        if (L.wall(gx, gz, 1)) { ctx.moveTo(x0 + c, z0); ctx.lineTo(x0 + c, z0 + c); }
      }
    }
    ctx.stroke();
    ctx.fillStyle = '#f1e3a0';
    for (let vz = cz - span; vz <= cz + span + 1; vz++) {
      for (let vx = cx - span; vx <= cx + span + 1; vx++) {
        if (vx < 0 || vz < 0 || vx > n || vz > n || !L.pillar[vz * (n + 1) + vx]) continue;
        const near = [[vx - 1, vz - 1], [vx, vz - 1], [vx - 1, vz], [vx, vz]].some(([a, b]) => L.inside(a, b) && this.seen[b * n + a]);
        if (near) ctx.fillRect(mx(vx * CELL) - 2.5, mz(vz * CELL) - 2.5, 5, 5);
      }
    }

    // almond water you've spotted
    ctx.fillStyle = '#9fd3ff';
    L.items.forEach((it, i) => {
      if (taken.has(i) || !this.seen[it.cell]) return;
      ctx.beginPath();
      ctx.arc(mx(it.x), mz(it.z), 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // the way out, once you've seen it
    const ex = L.exit;
    if (this.seen[ex.cell]) {
      ctx.fillStyle = '#ff3b2f';
      ctx.fillRect(mx(ex.x) - 5, mz(ex.z) - 5, 10, 10);
      ctx.save();
      ctx.translate(mx(ex.x), mz(ex.z));
      ctx.rotate(-ry);
      ctx.font = '16px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', 0, -9);
      ctx.restore();
    }

    // everyone else
    for (const m of mates) {
      ctx.fillStyle = COLORS[m.color % 4];
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx(m.x), mz(m.z), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // you, always in the middle pointing up
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(R, R - 8);
    ctx.lineTo(R + 6, R + 6);
    ctx.lineTo(R, R + 2);
    ctx.lineTo(R - 6, R + 6);
    ctx.closePath();
    ctx.fill();

    // north marker on the rim
    const na = -Math.PI / 2 + ry;
    ctx.font = '18px VT323, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e2cf73';
    ctx.fillText('N', R + Math.cos(na) * (R - 11), R + Math.sin(na) * (R - 11));
    ctx.strokeStyle = 'rgba(226, 207, 115, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}
