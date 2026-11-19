// police.js — the wanted system. Stars 1–5 drive how many police cars and
// foot officers spawn, how aggressively they chase, ram and try to arrest
// Mara. BUSTED when an officer holds her still on foot; WASTED is health.
// Roadblocks appear at 4+ stars; heat decays when the player stays quiet
// and unseen, and a Fresh Coat respray clears it instantly.
import { Car } from './vehicles.js';
import { buildPersonMesh } from './pedestrians.js';
import { CFG, clamp, dist2d } from './config.js';
const THREE = window.THREE;

export class Police {
  constructor(scene, city, state) {
    this.scene = scene; this.city = city; this.state = state; // state: {wanted, ...}
    this.cars = [];
    this.officers = [];
    this.roadblocks = [];
    this.quietT = 0;
    this.bustedT = 0;
    this.spawnT = 0;
    this.onBusted = null;
    this.onSiren = null;
    this._sirenOn = false;
  }
  get wanted() { return this.state.wanted; }
  setWanted(n, reason) {
    const before = this.state.wanted;
    this.state.wanted = clamp(Math.round(n), 0, CFG.maxWanted);
    if (this.state.wanted > before) this.quietT = 0;
    if (this.state.wanted > 0 && reason) {
      this.state.lastCrime = reason;
      this.state.lastCrimeT = performance.now() / 1000;
    }
    this._syncSiren();
  }
  addHeat(n, reason) { this.setWanted(this.state.wanted + n, reason); }
  _syncSiren() {
    const on = this.state.wanted > 0;
    if (on !== this._sirenOn) { this._sirenOn = on; this.onSiren?.(on); }
  }
  clearAll() {
    for (const c of this.cars) c.remove();
    for (const o of this.officers) this.scene.remove(o.mesh);
    for (const b of this.roadblocks) this.scene.remove(b.mesh);
    this.cars = []; this.officers = []; this.roadblocks = [];
    this.bustedT = 0;
    this.setWanted(0);
  }
  _spawnCarNear(player) {
    const a = Math.random() * Math.PI * 2;
    const d = 55 + Math.random() * 25;
    let x = player.pos.x + Math.sin(a) * d, z = player.pos.z + Math.cos(a) * d;
    x = clamp(x, -195, 195); z = clamp(z, -195, 195);
    // snap onto a road if possible
    const car = new Car(this.scene, x, z, Math.atan2(player.pos.x - x, player.pos.z - z),
      0x1a2a3a, 'sedan', { driver: 'police', police: true, name: 'Interceptor' });
    // police livery: white doors stripe via a second thin box
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.3, 3.2),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.7; car.mesh.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.35, -0.2); car.mesh.add(bar);
    car.light = bar;
    this.cars.push(car);
    return car;
  }
  _spawnOfficerNear(player) {
    const a = Math.random() * Math.PI * 2;
    const x = player.pos.x + Math.sin(a) * 22, z = player.pos.z + Math.cos(a) * 22;
    const mesh = buildPersonMesh(0x1a2a3a, 0xe8b88a);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const o = { mesh, x, z, heading: 0, speed: 6.4, arrestT: 0 };
    this.officers.push(o);
    return o;
  }
  _spawnRoadblock(player) {
    const a = Math.random() * Math.PI * 2;
    const x = player.pos.x + Math.sin(a) * 34, z = player.pos.z + Math.cos(a) * 34;
    const group = new THREE.Group();
    for (let i = -1; i <= 1; i++) {
      const car = new Car(this.scene, 0, 0, 0, 0x1a2a3a, 'sedan', { driver: 'police', police: true });
      car.mesh.position.set(i * 4.4, 0, 0);
      group.add(car.mesh);
      this.cars.push(car); // roadblock cars count as police cars but parked
      car.roadblock = true;
    }
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(12, 1.1, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xff5522 }));
    barrier.position.y = 0.55; group.add(barrier);
    group.position.set(x, 0, z);
    group.rotation.y = Math.atan2(player.pos.x - x, player.pos.z - z) + Math.PI / 2;
    this.scene.add(group);
    this.roadblocks.push({ mesh: group, x, z, ttl: 45 });
    return group;
  }
  update(dt, player, fx) {
    const w = this.state.wanted;
    if (w <= 0) {
      // stragglers drive off / walk away
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const c = this.cars[i];
        if (c.roadblock) continue; // roadblock cars leave with their barrier group
        c.drive({ throttle: 0.6, steer: 0, handbrake: false }, dt, (x, z, r) => this.city.collide(x, z, r), fx);
        if (dist2d(c.pos.x, c.pos.z, player.pos.x, player.pos.z) > 130) { c.remove(); this.cars.splice(i, 1); }
      }
      for (let i = this.officers.length - 1; i >= 0; i--) {
        const o = this.officers[i];
        if (dist2d(o.x, o.z, player.pos.x, player.pos.z) > 60) { this.scene.remove(o.mesh); this.officers.splice(i, 1); }
      }
      this._syncSiren();
      return;
    }
    // --- spawning: more stars, more units ---
    this.spawnT -= dt;
    const wantCars = Math.min(2 + w, 7);
    const wantOfficers = w >= 3 ? Math.min(w - 1, 4) : 0;
    if (this.spawnT <= 0) {
      this.spawnT = 2.2;
      if (this.cars.filter((c) => !c.roadblock).length < wantCars) this._spawnCarNear(player);
      if (this.officers.length < wantOfficers && !player.car) this._spawnOfficerNear(player);
      if (w >= 4 && this.roadblocks.length < 2) this._spawnRoadblock(player);
    }
    // --- heat decay while quiet ---
    this.quietT += dt;
    if (this.quietT > CFG.wantedDecaySeconds && this.state.lastCrimeT + CFG.wantedDecaySeconds < performance.now() / 1000) {
      this.setWanted(w - 1);
      this.quietT = 0;
      this.state.flash('Heat dropping — stay out of sight…');
    }
    // --- police cars chase ---
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.dead) { if (Math.random() < 0.01) { c.remove(); this.cars.splice(i, 1); } continue; }
      if (c.light) c.light.material.color.setHex(Math.floor(performance.now() / 220) % 2 ? 0xff2222 : 0x2244ff);
      if (c.roadblock) continue;
      const tx = player.car ? player.car.pos.x : player.pos.x;
      const tz = player.car ? player.car.pos.z : player.pos.z;
      const d = dist2d(c.pos.x, c.pos.z, tx, tz);
      const want = Math.atan2(tx - c.pos.x, tz - c.pos.z);
      let dh = want - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = clamp(dh * 1.8, -1, 1);
      c.drive({ throttle: d > 6 ? 1 : 0.4, steer, handbrake: false }, dt, (x, z, r) => this.city.collide(x, z, r), fx);
      // ram the player's car
      if (player.car && d < 3.6) {
        player.car.damage(6 * dt * 10, fx);
        fx?.sparks(tx, 0.9, tz);
        this.state.lastCrimeT = performance.now() / 1000;
      }
      // ram the player on foot (knockdown, not insta-kill)
      if (!player.car && d < 2.4 && Math.abs(c.speed) > 4) {
        player.damage(18, 'police car');
        fx?.addShake(0.5);
        c.speed *= 0.2;
      }
      if (d > 170) { c.remove(); this.cars.splice(i, 1); }
    }
    // --- officers chase on foot and arrest ---
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i];
      const d = dist2d(o.x, o.z, player.pos.x, player.pos.z);
      if (player.car) {
        // officers can't catch a car: give up after a while
        if (d > 80) { this.scene.remove(o.mesh); this.officers.splice(i, 1); }
        continue;
      }
      const want = Math.atan2(player.pos.x - o.x, player.pos.z - o.z);
      o.heading = want;
      o.x += Math.sin(want) * o.speed * dt;
      o.z += Math.cos(want) * o.speed * dt;
      o.mesh.position.set(o.x, 0, o.z);
      o.mesh.rotation.y = want;
      const u = o.mesh.userData;
      u.phase += dt * 14;
      u.legL.rotation.x = Math.sin(u.phase) * 0.6; u.legR.rotation.x = -Math.sin(u.phase) * 0.6;
      if (d < 2.2) {
        o.arrestT += dt;
        if (o.arrestT > 1.6) { this.onBusted?.(); return; }
        if (Math.random() < dt * 2) this.state.flash('POLICE: Stop! Hands where I can see them!');
      } else o.arrestT = Math.max(0, o.arrestT - dt);
      if (d > 90) { this.scene.remove(o.mesh); this.officers.splice(i, 1); }
    }
    // --- roadblock expiry ---
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const b = this.roadblocks[i];
      b.ttl -= dt;
      if (b.ttl <= 0) { this.scene.remove(b.mesh); this.roadblocks.splice(i, 1); }
    }
  }
}
