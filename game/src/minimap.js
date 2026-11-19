// minimap.js — a live top-down canvas map: roads, sea, beach, the marina,
// the player arrow, police blips, mission marker, fare and token dots.
import { CFG } from './config.js';

export class Minimap {
  constructor(state) {
    this.state = state;
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.size = 190;
    this.world = 440; // world units across the map
  }
  _to(x, z) {
    const s = this.size / this.world;
    return [(x + this.world / 2) * s, (z + this.world / 2) * s];
  }
  draw() {
    const st = this.state, ctx = this.ctx, S = this.size;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(12, 26, 40, 0.82)';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.clip();
    // sea (south + west) and sand
    ctx.fillStyle = '#1e6fb8';
    let [sx, sy] = this._to(-220, 186); ctx.fillRect(0, sy, S, S - sy);
    ctx.fillRect(0, 0, sx, S);
    ctx.fillStyle = '#e8d9a8';
    [sx, sy] = this._to(-220, 180); ctx.fillRect(0, sy, S, 8);
    // roads
    ctx.strokeStyle = '#565b63'; ctx.lineWidth = 5;
    for (const l of [-180, -120, -60, 0, 60, 120, 180]) {
      let [a, b] = this._to(l, -200); ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(a, S); ctx.stroke();
      [a, b] = this._to(-200, l); ctx.beginPath(); ctx.moveTo(0, b); ctx.lineTo(S, b); ctx.stroke();
    }
    // marina docks
    ctx.fillStyle = '#8a6f4d';
    const [mx, my] = this._to(120, 168); ctx.fillRect(mx, my, 42, 6);
    // lighthouse
    ctx.fillStyle = '#ffd23c';
    const [lx, ly] = this._to(-198, 198); ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.fill();
    // sun tokens (uncollected)
    ctx.fillStyle = '#ffe27a';
    for (const t of st.missions.tokens) {
      if (t.taken) continue;
      const [tx, ty] = this._to(t.x, t.z);
      ctx.beginPath(); ctx.arc(tx, ty, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    // mission marker (pulsing)
    if (st.marker) {
      const [px, py] = this._to(st.marker.x, st.marker.z);
      const r = 5 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, r + 3, 0, Math.PI * 2); ctx.stroke();
    }
    // police blips (blue flashing)
    ctx.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#ff4444' : '#4488ff';
    for (const c of st.police.cars) {
      const [cx, cy] = this._to(c.pos.x, c.pos.z);
      ctx.beginPath(); ctx.arc(cx, cy, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    // fare blip
    if (st.missions.farePed) {
      ctx.fillStyle = '#37d67a';
      const [fx, fy] = this._to(st.missions.farePed.x, st.missions.farePed.z);
      ctx.beginPath(); ctx.arc(fx, fy, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    // player arrow
    const [px, py] = this._to(st.player.pos.x, st.player.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(st.player.heading), Math.cos(st.player.heading)) + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    ctx.restore();
    // rim + north tick
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('N', S / 2 - 4, 13);
  }
}
