// The map in the top-left corner, the only thing on screen while you play.
// It shows just what you have seen of Level 0, turns with you (straight
// ahead is always up), and marks your teammates, almond water you've spotted
// and the exit once you've found it. The ring around it is your sanity, the
// thin inner ring your stamina, and the bottles below are almond water
// you're carrying.

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

  draw({ x, z, ry, mates, taken, sanity = 1, stamina = 1, almond = 0, t = 0 }) {
    const L = this.level, n = L.n, ctx = this.ctx;
    const S = this.canvas.width, R = S / 2, k = R / RANGE;
    ctx.clearRect(0, 0, S, this.canvas.height);
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
    ctx.fillText('N', R + Math.cos(na) * (R - 14), R + Math.sin(na) * (R - 14));

    // sanity: the rim, emptying clockwise; red and pulsing when it's low
    ctx.lineCap = 'butt';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.arc(R, R, R - 3, 0, Math.PI * 2);
    ctx.stroke();
    const low = sanity < 0.3;
    ctx.strokeStyle = low ? `rgba(255, 70, 50, ${0.6 + 0.4 * Math.abs(Math.sin(t * 5))})` : '#e2cf73';
    ctx.beginPath();
    ctx.arc(R, R, R - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.002, sanity));
    ctx.stroke();
    // stamina: a thin inner ring, only while it's not full
    if (stamina < 0.99) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(R, R, R - 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * stamina);
      ctx.stroke();
    }

    // almond water you're carrying
    for (let i = 0; i < Math.min(almond, 6); i++) {
      const bx = R - (Math.min(almond, 6) - 1) * 9 + i * 18, by = S + 4;
      ctx.fillStyle = '#cfe8f2';
      ctx.fillRect(bx - 4, by + 4, 8, 13);
      ctx.fillRect(bx - 2, by, 4, 5);
      ctx.fillStyle = '#6b8fb3';
      ctx.fillRect(bx - 2, by - 1, 4, 2);
      ctx.fillRect(bx - 4, by + 8, 8, 4);
    }
  }
}
