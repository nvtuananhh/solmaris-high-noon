// traffic.js — civilian cars that follow the city's road loops, keep distance,
// brake for the player and honk when blocked. They are stealable: walk up and
// press E and the driver gets out (and the wanted level notices).
import { Car, CAR_COLORS } from './vehicles.js';
import { makeRng, pick, range } from './random.js';
import { dist2d } from './config.js';

export class Traffic {
  constructor(scene, city, rngSeed = 7) {
    this.scene = scene; this.city = city;
    this.rng = makeRng(rngSeed);
    this.cars = [];
    this.onHonk = null;
  }
  spawn(n = 14) {
    const kinds = ['sedan', 'sedan', 'van', 'sedan', 'sport'];
    for (let i = 0; i < n; i++) {
      const route = pick(this.rng, this.city.routes);
      const wp = route[Math.floor(this.rng() * route.length)];
      const car = new Car(this.scene, wp.x + range(this.rng, -3, 3), wp.z + range(this.rng, -3, 3),
        this.rng() * Math.PI * 2, pick(this.rng, CAR_COLORS), pick(this.rng, kinds), { driver: 'traffic' });
      car.route = route;
      car.wp = Math.floor(this.rng() * route.length);
      car.cruise = range(this.rng, 9, 15);
      car.wait = 0;
      this.cars.push(car);
    }
  }
  nearestCar(x, z, maxD = 4.2) {
    let best = null, bd = maxD;
    for (const c of this.cars) {
      if (c.dead || c.driver === 'player') continue;
      const d = dist2d(x, z, c.pos.x, c.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  update(dt, player, fx) {
    for (const c of this.cars) {
      if (c.dead || c.driver === 'player') continue;
      if (c.driver === null) continue; // parked, waiting to be stolen
      const target = c.route[c.wp];
      const d = dist2d(c.pos.x, c.pos.z, target.x, target.z);
      if (d < 5) c.wp = (c.wp + 1) % c.route.length;
      // desired heading toward the waypoint
      const want = Math.atan2(target.x - c.pos.x, target.z - c.pos.z);
      let dh = want - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      // blocked? car or player ahead
      let blocked = false;
      const fx0 = Math.sin(c.heading), fz0 = Math.cos(c.heading);
      for (const o of this.cars) {
        if (o === c || o.dead) continue;
        const ox = o.pos.x - c.pos.x, oz = o.pos.z - c.pos.z;
        if (ox * fx0 + oz * fz0 > 0 && ox * ox + oz * oz < 42) { blocked = true; break; }
      }
      if (player && player.car !== c) {
        const px = player.pos.x - c.pos.x, pz = player.pos.z - c.pos.z;
        if (px * fx0 + pz * fz0 > 0 && px * px + pz * pz < 36) blocked = true;
      }
      if (blocked) {
        c.wait += dt;
        if (c.wait > 2.5 && c.wait < 2.6) this.onHonk?.();
        c.drive({ throttle: -1, steer: 0, handbrake: false }, dt, (x, z, r) => this.city.collide(x, z, r), fx);
        continue;
      }
      c.wait = 0;
      const steer = Math.max(-1, Math.min(1, dh * 1.6));
      const throttle = Math.abs(dh) > 1.2 ? 0.3 : 1;
      c.drive({ throttle, steer, handbrake: false }, dt, (x, z, r) => this.city.collide(x, z, r), fx);
      if (c.speed > c.cruise) c.speed = c.cruise;
      // simple car-vs-car separation
      for (const o of this.cars) {
        if (o === c || o.dead) continue;
        const dd = dist2d(c.pos.x, c.pos.z, o.pos.x, o.pos.z);
        if (dd < 3.4 && dd > 0.01) {
          const push = (3.4 - dd) / 2;
          const nx = (c.pos.x - o.pos.x) / dd, nz = (c.pos.z - o.pos.z) / dd;
          c.pos.x += nx * push; c.pos.z += nz * push;
          if (Math.abs(c.speed) > 4 || Math.abs(o.speed) > 4) {
            c.damage(3, fx); o.damage(3, fx);
            fx?.sparks((c.pos.x + o.pos.x) / 2, 0.9, (c.pos.z + o.pos.z) / 2);
          }
        }
      }
    }
  }
}
