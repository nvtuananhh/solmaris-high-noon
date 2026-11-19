// vehicles.js — stylised low-poly cars built from boxes, plus the arcade
// driving model (accelerate / brake / steer / handbrake, damage, headlights)
// and the enter/exit + steal logic shared by the player and traffic.
const THREE = window.THREE;
import { CFG, clamp } from './config.js';
import { pick } from './random.js';

export const CAR_COLORS = [0xd94f3d, 0x3a6ea8, 0xf2c14e, 0x4fa86a, 0xe8e4da, 0x2c2c34, 0x7fb2d9, 0xc96f9a];
export const CAR_NAMES = ['Vela Coupe', 'Marina Sedan', 'Sol Hatchback', 'Costa Van', 'Lumen GT', 'Palma Pickup'];

export function buildCarMesh(color, kind = 'sedan') {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2b33 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const isVan = kind === 'van', isSport = kind === 'sport';
  const len = isVan ? 5.2 : isSport ? 4.4 : 4.6, wid = 2.0, hgt = isVan ? 1.5 : 0.75;
  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, hgt, len), bodyMat);
  body.position.y = 0.65; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.86, isVan ? 1.0 : 0.62, len * (isVan ? 0.62 : 0.45)), glassMat);
  cabin.position.set(0, hgt + (isVan ? 0.5 : 0.3), isVan ? -0.3 : -0.2); cabin.castShadow = true; g.add(cabin);
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  g.userData.wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.38, wz); g.add(w);
    g.userData.wheels.push(w);
  }
  // headlights + taillights
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  const tlMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  for (const wx of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.1), hlMat);
    hl.position.set(wx, 0.72, len / 2 + 0.02); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.1), tlMat);
    tl.position.set(wx, 0.72, -len / 2 - 0.02); g.add(tl);
  }
  // headlight beams (spotlights, off by default)
  const beamL = new THREE.SpotLight(0xfff2c0, 0, 26, 0.5, 0.5, 1.2);
  beamL.position.set(-0.65, 0.8, len / 2);
  const tgtL = new THREE.Object3D(); tgtL.position.set(-0.65, 0, len / 2 + 14);
  g.add(tgtL); beamL.target = tgtL; g.add(beamL);
  const beamR = beamL.clone(); beamR.position.x = 0.65;
  const tgtR = new THREE.Object3D(); tgtR.position.set(0.65, 0, len / 2 + 14);
  g.add(tgtR); beamR.target = tgtR; g.add(beamR);
  g.userData.beams = [beamL, beamR];
  g.userData.length = len;
  return g;
}

export class Car {
  constructor(scene, x, z, heading, color, kind = 'sedan', opts = {}) {
    this.scene = scene;
    this.mesh = buildCarMesh(color, kind);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.color = color; this.kind = kind;
    this.name = opts.name || pick(Math.random, CAR_NAMES);
    this.health = 100;
    this.driver = opts.driver || null;   // 'player' | 'traffic' | 'police' | null (parked)
    this.stolen = false;
    this.isPolice = !!opts.police;
    this.dead = false;
    this.smoking = false;
    this.airY = 0; this.airVy = 0; this.airT = 0; // stunt-jump vertical state
    this.headlights = false;
    this.length = this.mesh.userData.length;
  }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  setHeadlights(on) {
    this.headlights = on;
    for (const b of this.mesh.userData.beams) b.intensity = on ? 55 : 0;
  }
  damage(amount, fx) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health < 55 && !this.smoking) { this.smoking = true; }
    if (this.health <= 0) {
      this.dead = true; this.speed = 0;
      fx?.burst(this.pos.x, 1.2, this.pos.z, 0xff7733, 40);
      fx?.flash(this.pos.x, 1.5, this.pos.z, 5);
      fx?.addShake(0.8);
    }
  }
  // Arcade step. input: {throttle -1..1, steer -1..1, handbrake bool}. dt seconds.
  drive(input, dt, collideFn, fx) {
    if (this.dead) { this.speed *= Math.max(0, 1 - 3 * dt); return; }
    const fwd = this.forward();
    const top = this.isPolice ? CFG.carMaxSpeed * 1.06 : CFG.carMaxSpeed;
    if (input.throttle > 0) this.speed += CFG.carAccel * input.throttle * dt;
    else if (input.throttle < 0) {
      if (this.speed > 0.5) this.speed -= CFG.carBrake * dt; // brake
      else this.speed = Math.max(-CFG.carMaxReverse, this.speed + CFG.carAccel * 0.6 * dt);
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 8 * dt);
    }
    if (input.handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 30 * dt);
    this.speed = clamp(this.speed, -CFG.carMaxReverse, top);
    const steerTarget = input.steer * CFG.carTurn * clamp(Math.abs(this.speed) / 12, 0.25, 1) * (this.speed < 0 ? -1 : 1);
    this.steer += (steerTarget - this.steer) * Math.min(1, 8 * dt);
    this.heading += this.steer * dt * clamp(Math.abs(this.speed) / 8, 0, 1.4);
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    // world bounds: the coast + sea block the car
    const bx = clamp(nx, -215, 200), bz = clamp(nz, -200, 196);
    const res = collideFn ? collideFn(bx, bz, 1.6) : { x: bx, z: bz, hit: false };
    if (res.hit && Math.abs(this.speed) > 6) {
      fx?.sparks(this.pos.x, 0.8, this.pos.z);
      this.damage(Math.abs(this.speed) * 0.55, fx);
      this.speed *= 0.35;
    }
    this.pos.x = res.x; this.pos.z = res.z;
    this.mesh.rotation.y = this.heading;
    // wheel spin + front-wheel steer visual
    const spin = (this.speed * dt) / 0.38;
    this.mesh.userData.wheels.forEach((w, i) => {
      w.rotation.x += spin;
      if (i < 2) w.rotation.y = this.steer * 0.4;
    });
    if (this.smoking && Math.random() < 0.35) fx?.smoke(this.pos.x, 1.4, this.pos.z);
  }
  remove() { this.scene.remove(this.mesh); }
}
