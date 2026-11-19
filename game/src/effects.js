// effects.js — particles, muzzle flashes, skid smoke, explosions and screen
// shake. All cheap THREE.Points / sprite pools; nothing allocates per frame.
const THREE = window.THREE;
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.shake = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 3), 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
    this.points.frustumCulled = false;
    this.posAttr = geo.getAttribute('position');
    this.colAttr = new THREE.BufferAttribute(new Float32Array(600 * 3), 3);
    geo.setAttribute('color', this.colAttr);
    scene.add(this.points);
    for (let i = 0; i < 600; i++) this.parts.push({ life: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 });
    this.cursor = 0;
    // reusable flash sprite for muzzle / explosions
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const grad = c.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,240,180,1)'); grad.addColorStop(0.4, 'rgba(255,160,60,0.85)'); grad.addColorStop(1, 'rgba(255,80,0,0)');
    c.fillStyle = grad; c.fillRect(0, 0, 64, 64);
    this.flashTex = new THREE.CanvasTexture(cv);
    this.flashes = [];
  }
  spawn(x, y, z, n, color, speed = 6, up = 4, life = 0.7) {
    const col = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const p = this.parts[this.cursor]; this.cursor = (this.cursor + 1) % this.parts.length;
      p.life = life * (0.6 + Math.random() * 0.7);
      p.maxLife = p.life;
      const a = Math.random() * Math.PI * 2, r = Math.random() * speed;
      p.vx = Math.cos(a) * r; p.vz = Math.sin(a) * r; p.vy = Math.random() * up;
      p.r = col.r; p.g = col.g; p.b = col.b;
      this.posAttr.setXYZ(this.parts.indexOf(p), x, y, z);
    }
  }
  burst(x, y, z, color = 0xffaa33, n = 26) { this.spawn(x, y, z, n, color, 9, 7, 0.9); }
  smoke(x, y, z) { this.spawn(x, y, z, 3, 0x888888, 1.2, 2.2, 1.1); }
  sparks(x, y, z) { this.spawn(x, y, z, 10, 0xffcc44, 7, 5, 0.5); }
  flash(x, y, z, scale = 2) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, transparent: true, depthWrite: false }));
    m.position.set(x, y, z); m.scale.setScalar(scale);
    this.scene.add(m); this.flashes.push({ m, life: 0.12 });
  }
  addShake(a) { this.shake = Math.min(1.2, this.shake + a); }
  update(dt) {
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= 9 * dt;
        const idx = i;
        this.posAttr.setXYZ(idx,
          this.posAttr.getX(idx) + p.vx * dt,
          Math.max(0.1, this.posAttr.getY(idx) + p.vy * dt),
          this.posAttr.getZ(idx) + p.vz * dt);
        const f = Math.max(0, p.life / (p.maxLife || 1));
        this.colAttr.setXYZ(idx, p.r * f, p.g * f, p.b * f);
      } else {
        this.posAttr.setXYZ(i, 0, -10, 0);
        this.colAttr.setXYZ(i, 0, 0, 0);
      }
    }
    this.posAttr.needsUpdate = true; this.colAttr.needsUpdate = true;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]; f.life -= dt;
      if (f.life <= 0) { this.scene.remove(f.m); f.m.material.dispose(); this.flashes.splice(i, 1); }
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }
  shakeOffset() {
    if (this.shake <= 0.01) return { x: 0, y: 0 };
    const s = this.shake * 0.35;
    return { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s };
  }
}
