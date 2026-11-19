// pedestrians.js — sidewalk walkers built from boxes, with a walk cycle,
// idle chatter spots, and a flee response to gunfire, explosions and cars
// bearing down on them. Getting hit by a car hurts them (and your wanted level).
const THREE = window.THREE;
import { makeRng, pick, range } from './random.js';
import { dist2d } from './config.js';

const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a34, 0xf0c8a0];
const SHIRTS = [0xe86a5a, 0x4fa8d8, 0xf2c14e, 0x7fc96a, 0xffffff, 0x9a6ad4, 0x333333];

export function buildPersonMesh(shirt, skin) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x33404f });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.34), shirtMat);
  body.position.y = 1.12; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skinMat);
  head.position.y = 1.78; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.44),
    new THREE.MeshLambertMaterial({ color: 0x2a2018 }));
  hair.position.y = 2.02; g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.26), pantsMat);
  legL.position.set(-0.16, 0.38, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), shirtMat);
  armL.position.set(-0.42, 1.15, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  g.userData = { legL, legR, armL, armR, phase: Math.random() * 6 };
  return g;
}

export class Pedestrians {
  constructor(scene, city, seed = 11) {
    this.scene = scene; this.city = city;
    this.rng = makeRng(seed);
    this.peds = [];
    this.onFlee = null;
  }
  spawn(n = 26) {
    for (let i = 0; i < n; i++) {
      const x = range(this.rng, -170, 170), z = range(this.rng, -170, 170);
      const mesh = buildPersonMesh(pick(this.rng, SHIRTS), pick(this.rng, SKINS));
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      this.peds.push({
        mesh, x, z, heading: this.rng() * Math.PI * 2,
        speed: range(this.rng, 1.1, 2.0), state: 'walk',
        tx: x + range(this.rng, -40, 40), tz: z + range(this.rng, -40, 40),
        fleeT: 0, dead: false, isFare: false, fareId: -1,
      });
    }
  }
  // A fare client: a ped who waves at the kerb and waits for a taxi ride.
  spawnFare(x, z, id) {
    const mesh = buildPersonMesh(0xf2c14e, pick(this.rng, SKINS));
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const p = { mesh, x, z, heading: 0, speed: 0, state: 'fare', tx: x, tz: z, fleeT: 0, dead: false, isFare: true, fareId: id };
    this.peds.push(p);
    return p;
  }
  scare(x, z, radius = 26) {
    for (const p of this.peds) {
      if (p.dead) continue;
      if (dist2d(p.x, p.z, x, z) < radius) {
        p.state = 'flee'; p.fleeT = 3 + Math.random() * 2;
        const a = Math.atan2(p.x - x, p.z - z);
        p.tx = p.x + Math.sin(a) * 40; p.tz = p.z + Math.cos(a) * 40;
      }
    }
    this.onFlee?.();
  }
  nearest(x, z, maxD = 3.5) {
    let best = null, bd = maxD;
    for (const p of this.peds) {
      if (p.dead) continue;
      const d = dist2d(x, z, p.x, p.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  update(dt, playerCar) {
    for (const p of this.peds) {
      if (p.dead) continue;
      if (p.state === 'fare') { // wave: arm up, slow bob
        const u = p.mesh.userData;
        u.armR.rotation.x = -2.4 + Math.sin(performance.now() * 0.008) * 0.35;
        continue;
      }
      if (p.fleeT > 0) { p.fleeT -= dt; if (p.fleeT <= 0) p.state = 'walk'; }
      const speed = p.state === 'flee' ? 5.2 : p.speed;
      const d = dist2d(p.x, p.z, p.tx, p.tz);
      if (d < 2) {
        p.tx = p.x + range(this.rng, -50, 50);
        p.tz = p.z + range(this.rng, -50, 50);
        p.tx = Math.max(-175, Math.min(175, p.tx));
        p.tz = Math.max(-175, Math.min(175, p.tz));
      }
      const want = Math.atan2(p.tx - p.x, p.tz - p.z);
      let dh = want - p.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      p.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
      const nx = p.x + Math.sin(p.heading) * speed * dt;
      const nz = p.z + Math.cos(p.heading) * speed * dt;
      const res = this.city.collide(nx, nz, 0.5);
      p.x = res.x; p.z = res.z;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      // walk-cycle swing
      const u = p.mesh.userData;
      u.phase += dt * speed * 3.4;
      const sw = Math.sin(u.phase) * 0.55;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
      // hit by a fast car?
      if (playerCar && !playerCar.dead && Math.abs(playerCar.speed) > 5) {
        if (dist2d(p.x, p.z, playerCar.pos.x, playerCar.pos.z) < 2.1) {
          p.dead = true;
          p.mesh.rotation.z = Math.PI / 2; p.mesh.position.y = 0.35;
          this.onPedHit?.(p);
        }
      }
    }
  }
  remove(p) {
    this.scene.remove(p.mesh);
    this.peds.splice(this.peds.indexOf(p), 1);
  }
}
