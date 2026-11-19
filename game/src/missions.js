// missions.js — the 5-mission story chain for Mara Voss, plus the side
// activities: taxi fares, 3 checkpoint street races, stunt jumps and the
// 12 sun-token collectibles. Missions start on demand (M key / HUD button)
// so free roam and side activities stay available between jobs.
const THREE = window.THREE;
import { CFG, clamp, dist2d, fmtClock } from './config.js';
import { Car, CAR_COLORS } from './vehicles.js';
import { buildPersonMesh } from './pedestrians.js';

const M = CFG.missions;
export class Missions {
  constructor(scene, state) {
    this.scene = scene; this.state = state;
    this.active = false;
    this.index = -1;          // mission index 0..4 while active
    this.stage = 0;
    this.timer = 0;           // countdown for timed stages (0 = none)
    this.surviveT = 0;
    this.npc = null;          // mission NPC ped (Dario / Fixer)
    this.npcInCar = false;
    this.repoCar = null;
    this.race = null;
    this.fare = null; this.farePed = null; this.fareT = 0;
    this.tokens = [];
    this._betweenT = 0;
    this._failT = 0;
    // mission beacon: tall light pillar + ground ring
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 42, 12, 1, true), beamMat);
    this.beacon.visible = false; scene.add(this.beacon);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.1, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; scene.add(this.ring);
    // sun tokens
    const tokenGeo = new THREE.SphereGeometry(0.55, 10, 8);
    const tokenMat = new THREE.MeshBasicMaterial({ color: 0xffd23c });
    for (let i = 0; i < state.city.tokenSpots.length; i++) {
      const [x, z] = state.city.tokenSpots[i];
      const mesh = new THREE.Mesh(tokenGeo, tokenMat);
      mesh.position.set(x, 1.6, z);
      scene.add(mesh);
      this.tokens.push({ mesh, x, z, i, taken: state.tokensCollected.has(i) });
      if (this.tokens[i].taken) mesh.visible = false;
    }
    // race start pads
    this.racePads = [
      { x: 0, z: 176, name: 'Boulevard Sprint', checkpoints: [[-60, 176], [-120, 120], [-60, 60], [0, 120], [0, 176]] },
      { x: -194, z: -120, name: 'Coast Climb', checkpoints: [[-194, -60], [-194, 0], [-194, 60], [-194, 120], [-194, 176]] },
      { x: -60, z: -60, name: 'Old Town Loop', checkpoints: [[0, -60], [60, -60], [60, 0], [0, 0], [-60, -60]] },
    ];
    for (const p of this.racePads) {
      const pad = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.6, 24),
        new THREE.MeshBasicMaterial({ color: 0x37d67a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      pad.rotation.x = -Math.PI / 2; pad.position.set(p.x, 0.12, p.z);
      scene.add(pad); p.padMesh = pad;
    }
  }
  setMarker(x, z) {
    this.state.marker = { x, z };
    this.beacon.position.set(x, 21, z); this.beacon.visible = true;
    this.ring.position.set(x, 0.15, z); this.ring.visible = true;
  }
  clearMarker() { this.state.marker = null; this.beacon.visible = false; this.ring.visible = false; }
  setObjective(text) { this.state.objective = text; }
  startMission(i) {
    if (this.active || i >= M.length) return false;
    this.active = true; this.index = i; this.stage = 0; this.timer = 0; this.npcInCar = false;
    this.state.missionIndex = i;
    const st = this.state;
    st.audio?.missionDone();
    if (i === 0) {
      this._spawnNpc(10, 8, 0x4fa8d8, 'Dario');
      this.setObjective('First Fare: meet Dario at the Old Town square');
      this.setMarker(10, 8);
      st.flash('Mission 1 — First Fare: Dario is waiting by the fountain.');
    } else if (i === 1) {
      this.setObjective('Repo Run: get to the marina lot');
      this.setMarker(150, 150);
      st.flash('Mission 2 — Repo Run: the coral sports car is in the marina lot.');
    } else if (i === 2) {
      this.timer = 170;
      this.setObjective('The Drop: pick up the package in Downtown (2:50)');
      this.setMarker(0, -90);
      st.flash('Mission 3 — The Drop: 2:50 on the clock. Move!');
    } else if (i === 3) {
      this.state.police.setWanted(4, 'dragnet');
      this.surviveT = 90;
      this.setObjective('Heat Wave: survive the dragnet — 90s');
      this.setMarker(-150, 30);
      st.flash('Mission 4 — Heat Wave: 4 stars! Reach the safehouse when the heat breaks.');
    } else if (i === 4) {
      this._spawnNpc(0, -58, 0x2c2c34, 'Fixer');
      this.setObjective('High Noon: pick up the Fixer in Downtown');
      this.setMarker(0, -58);
      st.flash('Mission 5 — High Noon: the Fixer is waiting. Get him to the lighthouse.');
    }
    return true;
  }
  _spawnNpc(x, z, shirt, name) {
    if (this.npc) this.scene.remove(this.npc.mesh);
    const mesh = buildPersonMesh(shirt, 0xe8b88a);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.npc = { mesh, x, z, name };
  }
  _npcBoardsCar() {
    if (!this.npc) return;
    this.scene.remove(this.npc.mesh);
    this.npc = null; this.npcInCar = true;
    this.state.flash('Passenger aboard — go!');
  }
  complete(pay) {
    const st = this.state;
    const name = M[this.index].name;
    st.cash += pay;
    st.missionsDone.push(this.index + 1);
    st.audio?.missionDone(); st.audio?.cash();
    st.banner(`MISSION COMPLETE — ${name}  +$${pay}`);
    st.flash(`${name} complete. +$${pay}. Press M for the next job, or enjoy free roam.`);
    this.clearMarker();
    this.active = false; this.index = -1; this.stage = 0; this.timer = 0;
    st.save?.();
    if (st.missionIndex >= 4 && st.missionsDone.length >= 5) {
      st.banner('HIGH NOON — Mara owns this city now. Free roam: fares, races, tokens.');
    }
  }
  fail(reason) {
    const st = this.state;
    st.banner(`MISSION FAILED — ${reason}`);
    st.flash(`${reason} — the job restarts in a moment.`);
    this._failT = 4;
    this.active = false;
    if (this.npc) { this.scene.remove(this.npc.mesh); this.npc = null; }
    this.state.combat?.clearRivals();
    this.clearMarker();
    if (this.index === 3) this.state.police.clearAll();
    this.index = -1; this.stage = 0; this.timer = 0;
  }
  // --- side activities ---
  _spawnFare() {
    if (this.farePed || this.active) return;
    const st = this.state;
    const a = Math.random() * Math.PI * 2;
    const x = st.player.pos.x + Math.sin(a) * 18, z = st.player.pos.z + Math.cos(a) * 18;
    const cx = clamp(x, -170, 170), cz = clamp(z, -170, 170);
    this.farePed = st.peds.spawnFare(cx, cz, Date.now());
    const dests = [[150, 150], [0, -120], [-90, 120], [-150, 30], [0, 176], [-120, -120]];
    const d = dests[Math.floor(Math.random() * dests.length)];
    this.fare = { dest: d, paid: CFG.taxiFare };
    st.flash('A fare is waving nearby — pull up in a car and press E.');
  }
  _startRace(pad) {
    this.race = { pad, cp: 0, t: 0 };
    this.setMarker(pad.checkpoints[0][0], pad.checkpoints[0][1]);
    this.setObjective(`${pad.name}: hit the checkpoints!`);
    this.state.flash(`${pad.name} — GO! ${pad.checkpoints.length} checkpoints.`);
    this.state.audio?.chime();
  }
  _finishRace() {
    const pay = this.race.pad.name === 'Coast Climb' ? 300 : this.race.pad.name === 'Old Town Loop' ? 350 : 250;
    this.state.cash += pay;
    this.state.racesWon++;
    this.state.banner(`RACE WON — ${this.race.pad.name}  +$${pay}`);
    this.state.audio?.missionDone();
    this.race = null; this.clearMarker();
    this.setObjective(this.active ? this.state.objective : 'Free roam — press M for the next mission');
  }
  update(dt) {
    const st = this.state, p = st.player;
    // token spin + pickup
    for (const t of this.tokens) {
      if (t.taken) continue;
      t.mesh.rotation.y += dt * 2;
      t.mesh.position.y = 1.6 + Math.sin(performance.now() * 0.002 + t.i) * 0.25;
      if (dist2d(p.pos.x, p.pos.z, t.x, t.z) < 2.4) {
        t.taken = true; t.mesh.visible = false;
        st.tokensCollected.add(t.i);
        st.cash += CFG.tokenValue;
        st.banner(`SUN TOKEN ${st.tokensCollected.size}/12  +$${CFG.tokenValue}`);
        st.audio?.chime();
        st.save?.();
      }
    }
    // fail-restart timer
    if (this._failT > 0) {
      this._failT -= dt;
      if (this._failT <= 0) this.startMission(st.missionIndex);
      return;
    }
    // race timer + checkpoints
    if (this.race) {
      this.race.t += dt;
      const cp = this.race.pad.checkpoints[this.race.cp];
      if (p.car && dist2d(p.car.pos.x, p.car.pos.z, cp[0], cp[1]) < 7) {
        this.race.cp++;
        st.audio?.chime();
        if (this.race.cp >= this.race.pad.checkpoints.length) { this._finishRace(); return; }
        const n = this.race.pad.checkpoints[this.race.cp];
        this.setMarker(n[0], n[1]);
        st.flash(`Checkpoint ${this.race.cp}/${this.race.pad.checkpoints.length}`);
      }
      if (this.race.t > 240) { st.flash('Race abandoned — time up.'); this.race = null; this.clearMarker(); }
      return;
    }
    // fare spawn / pickup / delivery (free roam only)
    if (!this.active) {
      this.fareT -= dt;
      if (!this.farePed && this.fareT <= 0) { this.fareT = 20; this._spawnFare(); }
      if (this.farePed && p.car && dist2d(p.car.pos.x, p.car.pos.z, this.farePed.x, this.farePed.z) < 5) {
        st.flash('Press E to pick up the fare');
        if (st.input.wasPressed('KeyE') && this.fare) {
          st.peds.remove(this.farePed); this.farePed = null;
          this.setMarker(this.fare.dest[0], this.fare.dest[1]);
          this.setObjective(`Taxi fare: take your passenger to the marker`);
          st.flash('Fare aboard — drive to the marker.');
        }
      } else if (this.fare && !this.farePed && p.car && dist2d(p.car.pos.x, p.car.pos.z, this.fare.dest[0], this.fare.dest[1]) < 7) {
        st.cash += this.fare.paid; st.faresDone++;
        st.banner(`FARE DELIVERED  +$${this.fare.paid}`);
        st.audio?.cash();
        this.fare = null; this.clearMarker();
        this.setObjective('Free roam — press M for the next mission');
      }
      // race pads: drive through to start
      if (p.car) {
        for (const pad of this.racePads) {
          if (dist2d(p.car.pos.x, p.car.pos.z, pad.x, pad.z) < 4.5 && Math.abs(p.car.speed) > 3) {
            this._startRace(pad); break;
          }
        }
      }
    }
    if (!this.active) return;
    // --- mission logic ---
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.fail('Out of time'); return; }
      this.setObjective(`${M[this.index].name}: ${this._stageText()} — ${Math.ceil(this.timer / 60)}:${String(Math.ceil(this.timer % 60)).padStart(2, '0')}`);
    }
    const i = this.index;
    if (i === 0) {
      if (this.stage === 0) {
        if (!this.npcInCar && dist2d(p.pos.x, p.pos.z, 10, 8) < 3.5) {
          this.stage = 1;
          this.setObjective('First Fare: get in a car — Dario will follow');
          this.setMarker(18, 0);
          st.flash('Dario is ready. Grab the sedan by the square (E) and drive.');
          if (!st._tutorialCar) {
            st._tutorialCar = new Car(this.scene, 18, 0, Math.PI / 2, 0x3a6ea8, 'sedan', { driver: null, name: 'Vela Coupe' });
            st.traffic.cars.push(st._tutorialCar);
          }
        }
      } else if (this.stage === 1) {
        if (p.car && this.npc && dist2d(p.car.pos.x, p.car.pos.z, 10, 8) < 6) this._npcBoardsCar();
        if (this.npcInCar) {
          this.stage = 2;
          this.setObjective('First Fare: drive Dario to the Marina');
          this.setMarker(150, 150);
        } else if (!p.car) {
          this.setObjective('First Fare: get in a car (E) near Dario');
        }
      } else if (this.stage === 2) {
        if (p.car && dist2d(p.car.pos.x, p.car.pos.z, 150, 150) < 8) this.complete(M[0].pay);
      }
    } else if (i === 1) {
      if (this.stage === 0) {
        if (dist2d(p.pos.x, p.pos.z, 150, 150) < 10) {
          this.stage = 1;
          if (!this.repoCar) {
            this.repoCar = new Car(this.scene, 152, 142, -Math.PI / 2, 0xd94f3d, 'sport', { driver: null, name: 'Lumen GT' });
            st.traffic.cars.push(this.repoCar);
          }
          this.setObjective('Repo Run: steal the coral Lumen GT (E)');
          this.setMarker(152, 142);
          st.flash('There it is — the coral Lumen GT. Take it!');
        }
      } else if (this.stage === 1) {
        if (p.car === this.repoCar) {
          this.stage = 2;
          st.police.setWanted(2, 'stole the repo car');
          this.setObjective('Repo Run: lose the police tail, then reach the garage');
          this.setMarker(-90, 120);
          st.flash('2 stars! Lose the tail — then bring the GT to the Fresh Coat garage.');
        }
      } else if (this.stage === 2) {
        if (st.police.wanted === 0) {
          this.stage = 3;
          st.flash('Tail lost. Now deliver the GT to the garage.');
        }
      } else if (this.stage === 3) {
        if (p.car === this.repoCar && dist2d(p.car.pos.x, p.car.pos.z, -90, 120) < 9) this.complete(M[1].pay);
      }
    } else if (i === 2) {
      if (this.stage === 0) {
        if (p.car && dist2d(p.car.pos.x, p.car.pos.z, 0, -90) < 8) {
          this.stage = 1;
          st.flash('Package collected — but the rival crew is here!');
          for (const [rx, rz] of [[-8, -98], [8, -84], [0, -102]]) st.combat.spawnRival(rx, rz);
          this.setObjective('The Drop: deal with the ambush, then deliver to the Marina');
          this.setMarker(150, 150);
          st.combat.onKill = () => {
            if (this.active && this.index === 2 && this.stage === 1 && st.combat.rivals.every((r) => r.dead)) {
              st.flash('Ambush cleared — deliver the package!');
            }
          };
        }
      } else if (this.stage === 1) {
        const cleared = st.combat.rivals.every((r) => r.dead);
        if (p.car && dist2d(p.car.pos.x, p.car.pos.z, 150, 150) < 8) {
          if (cleared) this.complete(M[2].pay);
          else st.flash('The rivals are still on you — finish them or lose them first!');
        }
      }
    } else if (i === 3) {
      this.surviveT -= dt;
      if (this.surviveT <= 0) {
        this.setObjective('Heat Wave: heat breaking — get to the safehouse!');
        this.state.police.setWanted(Math.max(0, st.police.wanted - 2));
        if (dist2d(p.pos.x, p.pos.z, -150, 30) < 8) this.complete(M[3].pay);
      } else {
        this.setObjective(`Heat Wave: survive the dragnet — ${Math.ceil(this.surviveT)}s`);
      }
    } else if (i === 4) {
      if (this.stage === 0) {
        if (!this.npcInCar && dist2d(p.pos.x, p.pos.z, 0, -58) < 3.5) {
          this.stage = 1;
          this.setObjective('High Noon: get in a car — the Fixer will follow');
          this.setMarker(6, -58);
          st.flash('The Fixer is ready. Get a car and he will ride with you.');
        }
      } else if (this.stage === 1) {
        if (p.car && this.npc && dist2d(p.car.pos.x, p.car.pos.z, 0, -58) < 6) {
          this._npcBoardsCar();
          st.police.setWanted(3, 'finale pursuit');
          st.combat.spawnRival(-12, -50); st.combat.spawnRival(12, -66);
          this.stage = 2;
          this.setObjective('High Noon: drive the Fixer to the lighthouse!');
          this.setMarker(-198, 198);
          st.flash('They are coming for you both — drive to the lighthouse, noon sharp!');
        }
      } else if (this.stage === 2) {
        if (p.car && dist2d(p.car.pos.x, p.car.pos.z, -198, 198) < 10) this.complete(M[4].pay);
      }
    }
  }
  _stageText() {
    if (this.index === 2) return this.stage === 0 ? 'pick up the package in Downtown' : 'deliver to the Marina';
    return M[this.index]?.name || '';
  }
}
