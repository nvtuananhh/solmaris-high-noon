// combat.js — melee punches and the pistol: ammo, tracers, hit detection
// against rivals, officers and peds, health pickups, and the rival crew
// NPCs who fight back during "The Drop" and "High Noon".
const THREE = window.THREE;
import { buildPersonMesh } from './pedestrians.js';
import { CFG, clamp, dist2d } from './config.js';

export class Combat {
  constructor(scene, state) {
    this.scene = scene; this.state = state;
    this.rivals = [];
    this.pickups = [];
    this.punchCd = 0; this.shotCd = 0;
    this.onShot = null; this.onPunch = null; this.onKill = null;
    // tracer pool: thin stretched boxes reused per shot
    this.tracers = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 3),
        new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }));
      m.visible = false; scene.add(m);
      this.tracers.push({ m, life: 0 });
    }
    this._tracerIdx = 0;
  }
  _fireTracer(from, to) {
    const t = this.tracers[this._tracerIdx]; this._tracerIdx = (this._tracerIdx + 1) % this.tracers.length;
    const mid = new THREE.Vector3((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    t.m.position.copy(mid);
    t.m.lookAt(to.x, to.y, to.z);
    t.m.visible = true; t.m.material.opacity = 0.9; t.life = 0.09;
  }
  spawnRival(x, z, hp = 70) {
    const mesh = buildPersonMesh(0x8a2a3a, 0xc98a5a);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const r = { mesh, x, z, heading: 0, hp, maxHp: hp, shootCd: 1 + Math.random(), dead: false, state: 'hunt' };
    this.rivals.push(r);
    return r;
  }
  spawnPickup(x, z, kind = 'health') {
    const color = kind === 'health' ? 0x37d67a : 0xf2c14e;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
    mesh.position.set(x, 0.7, z);
    this.scene.add(mesh);
    const p = { mesh, x, z, kind, bob: Math.random() * 6 };
    this.pickups.push(p);
    return p;
  }
  clearRivals() {
    for (const r of this.rivals) this.scene.remove(r.mesh);
    this.rivals = [];
  }
  punch(player, fx) {
    if (this.punchCd > 0 || player.car) return false;
    this.punchCd = 0.45;
    this.onPunch?.();
    const fx0 = Math.sin(player.heading), fz0 = Math.cos(player.heading);
    let hitAny = false;
    const tryHit = (x, z, dmg, kill) => {
      const dx = x - player.pos.x, dz = z - player.pos.z;
      if (dx * fx0 + dz * fz0 > 0 && dx * dx + dz * dz < 6.5) { kill(dmg); hitAny = true; }
    };
    for (const r of this.rivals) {
      if (r.dead) continue;
      tryHit(r.x, r.z, CFG.punchDamage, (d) => this._damageRival(r, d, fx));
    }
    for (const p of this.state.peds.peds) {
      if (p.dead) continue;
      tryHit(p.x, p.z, 999, () => {
        p.dead = true; p.mesh.rotation.z = Math.PI / 2; p.mesh.position.y = 0.35;
        this.state.police.addHeat(1, 'assaulted a pedestrian');
      });
    }
    if (hitAny) fx?.burst(player.pos.x + fx0 * 1.4, 1.3, player.pos.z + fz0 * 1.4, 0xffffff, 6);
    return hitAny;
  }
  shoot(player, fx) {
    if (this.shotCd > 0 || player.car) return false;
    if (player.ammo <= 0) { this.state.flash('No ammo — find an ammo box (yellow)'); return false; }
    this.shotCd = 0.28;
    player.ammo--;
    this.onShot?.();
    const ox = player.pos.x, oz = player.pos.z, oy = 1.45;
    const fx0 = Math.sin(player.heading), fz0 = Math.cos(player.heading);
    const to = { x: ox + fx0 * CFG.pistolRange, y: oy, z: oz + fz0 * CFG.pistolRange };
    this._fireTracer({ x: ox + fx0, y: oy, z: oz + fz0 }, to);
    fx?.flash(ox + fx0 * 1.2, oy, oz + fz0 * 1.2, 1.6);
    // nearest rival / officer / ped along the firing line
    let best = null, bestD = CFG.pistolRange;
    const consider = (x, z, obj, kind) => {
      const dx = x - ox, dz = z - oz;
      const along = dx * fx0 + dz * fz0;
      const side = Math.abs(dx * fz0 - dz * fx0);
      if (along > 1 && along < bestD && side < 1.4) { bestD = along; best = { obj, kind, along }; }
    };
    for (const r of this.rivals) if (!r.dead) consider(r.x, r.z, r, 'rival');
    for (const o of this.state.police.officers) consider(o.x, o.z, o, 'officer');
    for (const p of this.state.peds.peds) if (!p.dead) consider(p.x, p.z, p, 'ped');
    if (best) {
      to.x = ox + fx0 * best.along; to.z = oz + fz0 * best.along;
      this._fireTracer({ x: ox + fx0, y: oy, z: oz + fz0 }, to);
      fx?.burst(to.x, 1.2, to.z, 0xff4444, 10);
      if (best.kind === 'rival') this._damageRival(best.obj, CFG.pistolDamage, fx);
      else if (best.kind === 'officer') {
        best.obj.dead = true;
        this.scene.remove(best.obj.mesh);
        this.state.police.officers.splice(this.state.police.officers.indexOf(best.obj), 1);
        this.state.police.addHeat(2, 'shot an officer');
        this.state.kills++;
      } else {
        best.obj.dead = true; best.obj.mesh.rotation.z = Math.PI / 2; best.obj.mesh.position.y = 0.35;
        this.state.police.addHeat(1, 'shot a pedestrian');
        this.state.peds.scare(best.obj.x, best.obj.z, 30);
      }
      this.state.peds.scare(ox, oz, 30);
    }
    return true;
  }
  _damageRival(r, dmg, fx) {
    r.hp -= dmg;
    fx?.burst(r.x, 1.3, r.z, 0xff5555, 8);
    if (r.hp <= 0 && !r.dead) {
      r.dead = true;
      r.mesh.rotation.z = Math.PI / 2; r.mesh.position.y = 0.35;
      this.state.kills++;
      this.onKill?.(r);
    }
  }
  update(dt, player, fx) {
    this.punchCd = Math.max(0, this.punchCd - dt);
    this.shotCd = Math.max(0, this.shotCd - dt);
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.m.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) t.m.visible = false;
      }
    }
    for (const p of this.pickups) {
      p.bob += dt * 2;
      p.mesh.position.y = 0.7 + Math.sin(p.bob) * 0.18;
      p.mesh.rotation.y += dt * 1.5;
      const d = dist2d(p.x, p.z, player.pos.x, player.pos.z);
      if (!player.car && d < 1.6) {
        if (p.kind === 'health') { player.health = clamp(player.health + 40, 0, CFG.playerHealth); this.state.flash('Health +40'); }
        else { player.ammo += 12; this.state.flash('Ammo +12'); }
        this.scene.remove(p.mesh);
        this.pickups.splice(this.pickups.indexOf(p), 1);
        this.state.audio?.chime();
      }
    }
    // rivals hunt the player: close in, shoot when in range
    for (const r of this.rivals) {
      if (r.dead) continue;
      const d = dist2d(r.x, r.z, player.pos.x, player.pos.z);
      const want = Math.atan2(player.pos.x - r.x, player.pos.z - r.z);
      r.heading = want;
      r.mesh.rotation.y = want;
      if (d > 9) {
        r.x += Math.sin(want) * 4.4 * dt;
        r.z += Math.cos(want) * 4.4 * dt;
        const u = r.mesh.userData;
        u.phase += dt * 12;
        u.legL.rotation.x = Math.sin(u.phase) * 0.6; u.legR.rotation.x = -Math.sin(u.phase) * 0.6;
      } else {
        r.shootCd -= dt;
        if (r.shootCd <= 0) {
          r.shootCd = 1.4 + Math.random() * 0.8;
          const from = { x: r.x, y: 1.4, z: r.z };
          this._fireTracer(from, { x: player.pos.x, y: 1.3, z: player.pos.z });
          fx?.flash(r.x + Math.sin(want), 1.4, r.z + Math.cos(want), 1.4);
          this.onShot?.();
          if (Math.random() < 0.55) player.damage(9 + Math.random() * 8, 'rival gunfire');
        }
      }
      r.mesh.position.set(r.x, 0, r.z);
    }
  }
}
