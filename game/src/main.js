// main.js — Solmaris boot + game loop + the on-foot / driving player.
// Wires every system together: city, vehicles, traffic, pedestrians, police,
// combat, missions, HUD, minimap, audio, save and the screenshot modes.
const THREE = window.THREE;
import { CFG, clamp, dist2d, fmtClock } from './config.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { City } from './city.js';
import { Car, CAR_COLORS } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Pedestrians, buildPersonMesh } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { Minimap } from './minimap.js';
import { Effects } from './effects.js';
import { saveGame, loadGame, hasSave, loadSettings, saveSettings } from './save.js';
import { applyShot, SHOT_MODES } from './shots.js';

const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '1', 10) || 1;
const SHOT = params.get('shot');

function buildMaraMesh() {
  // Mara Voss, 28: red courier jacket, dark hair, jeans — unmistakable at a glance.
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xc22a2a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2e4a6a });
  const hairM = new THREE.MeshLambertMaterial({ color: 0x20140c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.88, 0.36), jacket);
  body.position.y = 1.12; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.42), skin);
  head.position.y = 1.8; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.2, 0.46), hairM);
  hair.position.y = 2.04; g.add(hair);
  const ponytail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.16), hairM);
  ponytail.position.set(0, 1.8, -0.3); g.add(ponytail);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.78, 0.27), jeans);
  legL.position.set(-0.17, 0.39, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.17; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.72, 0.21), jacket);
  armL.position.set(-0.44, 1.15, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.44; g.add(armR);
  g.userData = { legL, legR, armL, armR, phase: 0 };
  return g;
}

function init() {
  const settings = loadSettings();
  // --- renderer / scene / camera ---
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.getElementById('app').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
  camera.position.set(20, 12, 40);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // --- state (the one object every system reads) ---
  const state = {
    cash: CFG.startCash, wanted: 0, minutes: CFG.startMinutes,
    objective: 'Welcome to Solmaris — press M to start your first job',
    marker: null, centerText: '',
    missionIndex: 0, missionsDone: [], tokensCollected: new Set(),
    racesWon: 0, faresDone: 0, kills: 0,
    lastCrime: '', lastCrimeT: 0,
    started: false, paused: false, over: false,
    shotMode: null, cameraMode: null, shotCam: null,
    _tutorialCar: null,
  };
  const hud = new HUD(state);
  state.flash = (t) => hud.flash(t);
  state.banner = (t) => hud.banner(t);
  state.hud = hud;
  const audio = new AudioEngine();
  audio.setVolume(settings.volume);
  state.audio = audio;
  const input = new Input(renderer.domElement);
  state.input = input;
  input.onFirstGesture = () => audio.ensure();
  const fx = new Effects(scene);
  const city = new City(scene, SEED);
  state.city = city;

  // --- player: Mara on foot ---
  const playerMesh = buildMaraMesh();
  scene.add(playerMesh);
  const player = {
    mesh: playerMesh,
    pos: new THREE.Vector3(0, 0, 16),
    heading: Math.PI * 0.85,
    vy: 0, grounded: true,
    health: CFG.playerHealth, ammo: CFG.pistolAmmoStart,
    weapon: 'fists', car: null, airY: 0, airVy: 0, airT: 0,
    damage(amount, source) {
      if (state.over || !state.started) return;
      this.health -= amount;
      fx.addShake(0.45);
      hud.flash(`-${Math.round(amount)} HP (${source})`);
      if (this.health <= 0) { this.health = 0; wasted(); }
    },
  };
  state.player = player;
  playerMesh.position.copy(player.pos);

  // --- systems ---
  const traffic = new Traffic(scene, city);
  state.traffic = traffic;
  traffic.onHonk = () => audio.honk();
  const peds = new Pedestrians(scene, city);
  state.peds = peds;
  peds.onPedHit = () => {
    state.police.addHeat(1, 'hit a pedestrian');
    state.flash('You hit a pedestrian! The police noticed.');
  };
  const police = new Police(scene, city, state);
  state.police = police;
  police.onSiren = (on) => audio.setSiren(on);
  police.onBusted = () => busted();
  const combat = new Combat(scene, state);
  state.combat = combat;
  combat.onShot = () => audio.gunshot();
  combat.onPunch = () => audio.punch();
  combat.onKill = () => { state.flash('Rival down.'); };
  const missions = new Missions(scene, state);
  state.missions = missions;
  const minimap = new Minimap(state);
  state.minimap = minimap;
  state.scene = scene;

  state.save = () => { if (saveGame(state)) hud.flash('Game saved.'); };
  function applySave(d) {
    state.cash = d.cash; player.health = d.health; player.ammo = d.ammo;
    state.missionsDone = d.missionsDone || [];
    state.missionIndex = d.missionIndex || state.missionsDone.length;
    state.tokensCollected = new Set(d.tokens || []);
    state.racesWon = d.racesWon || 0; state.faresDone = d.faresDone || 0; state.kills = d.kills || 0;
    state.minutes = d.minutes || CFG.startMinutes;
    player.pos.set(d.px || 0, 0, d.pz || 16);
    playerMesh.position.copy(player.pos);
    for (const t of missions.tokens) if (state.tokensCollected.has(t.i)) t.mesh.visible = false;
    state.objective = state.missionsDone.length >= 5
      ? 'Free roam — all five jobs done. Fares, races and tokens remain.'
      : 'Free roam — press M for the next mission';
  }

  // --- world population ---
  traffic.spawn(14);
  // parked cars to steal, scattered near roads
  const parkedSpots = [
    [24, 6, 0.4, 0xe8e4da, 'sedan'], [-24, -54, 1.6, 0x4fa86a, 'sedan'],
    [66, 30, 0, 0xf2c14e, 'van'], [-66, 96, 2.2, 0x2c2c34, 'sedan'],
    [126, 60, 1.2, 0x7fb2d9, 'sport'], [-126, -120, 0.8, 0xc96f9a, 'sedan'],
    [30, -126, 2.8, 0x3a6ea8, 'sedan'], [96, -60, 1.9, 0xd94f3d, 'sport'],
  ];
  for (const [x, z, h, c, k] of parkedSpots) {
    traffic.cars.push(new Car(scene, x, z, h, c, k, { driver: null }));
  }
  peds.spawn(26);
  combat.spawnPickup(6, 24, 'health');
  combat.spawnPickup(-12, -6, 'ammo');
  combat.spawnPickup(120, 130, 'ammo');

  // --- enter / exit car ---
  function enterCar(car) {
    if (car.driver === 'traffic') {
      // the driver bails out and runs
      const d = peds.spawnFare(car.pos.x + 2, car.pos.z + 2, -1);
      peds.remove(d);
      const flee = buildPersonMesh(0x4fa8d8, 0xc98a5a);
      flee.position.set(car.pos.x + 2, 0, car.pos.z + 2);
      scene.add(flee);
      peds.peds.push({ mesh: flee, x: car.pos.x + 2, z: car.pos.z + 2, heading: 0, speed: 5, state: 'flee', tx: car.pos.x + 30, tz: car.pos.z + 30, fleeT: 6, dead: false, isFare: false, fareId: -1 });
      car.stolen = true;
      police.addHeat(1, 'stole a car');
      state.flash('Car stolen! +1 star.');
    }
    car.driver = 'player';
    player.car = car;
    playerMesh.visible = false;
    audio.ensure();
    state.flash(`Driving the ${car.name} — W/S drive, Space handbrake, E to get out.`);
  }
  state.enterCar = enterCar;
  function exitCar() {
    const car = player.car;
    if (!car) return;
    car.driver = null;
    player.car = null;
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    player.pos.set(car.pos.x + side.x * 2.2, 0, car.pos.z + side.z * 2.2);
    const res = city.collide(player.pos.x, player.pos.z, 0.6);
    player.pos.x = res.x; player.pos.z = res.z;
    player.heading = car.heading;
    playerMesh.position.copy(player.pos);
    playerMesh.visible = true;
  }

  // --- BUSTED / WASTED ---
  function busted() {
    if (state.over) return;
    state.over = true;
    audio.busted(); audio.setSiren(false); audio.setEngine(0, false);
    const fine = Math.min(state.cash, 100);
    state.cash -= fine;
    hud.showEnd('BUSTED', `The Solmaris police caught up with you. Bail and fines: $${fine}. Your car was impounded — but the city is still yours.`);
    if (player.car) { player.car.driver = null; player.car = null; }
    police.clearAll();
  }
  function wasted() {
    if (state.over) return;
    state.over = true;
    audio.busted(); audio.setSiren(false); audio.setEngine(0, false);
    const bill = Math.min(state.cash, 150);
    state.cash -= bill;
    hud.showEnd('WASTED', `Mara went down in the midday sun. Hospital bill: $${bill}. The jobs are still waiting.`);
    if (player.car) { player.car.driver = null; player.car = null; }
    police.clearAll();
    combat.clearRivals();
  }
  function respawn() {
    state.over = false;
    hud.hideEnd();
    player.health = CFG.playerHealth;
    player.pos.set(0, 0, 16);
    player.heading = Math.PI * 0.85;
    playerMesh.position.copy(player.pos);
    playerMesh.visible = true;
    player.car = null;
    state.minutes = CFG.startMinutes;
    state.objective = 'Free roam — press M for the next mission';
  }

  // --- HUD buttons ---
  hud.bind({
    start: (load) => {
      audio.ensure(); audio.click();
      if (load) { const d = loadGame(); if (d) applySave(d); }
      hud.hideStart();
      state.started = true;
      state.flash(state.missionsDone.length ? 'Welcome back to Solmaris.' : 'Welcome to Solmaris, Mara. Press M for your first job.');
      renderer.domElement.requestPointerLock?.();
    },
    resume: () => { state.paused = false; hud.hidePause(); audio.click(); },
    save: () => state.save(),
    restart: () => {
      state.paused = false; hud.hidePause();
      state.cash = CFG.startCash; state.missionsDone = []; state.missionIndex = 0;
      state.tokensCollected = new Set(); state.minutes = CFG.startMinutes;
      respawn();
    },
    retry: () => { audio.click(); respawn(); },
    volume: (v) => { audio.setVolume(v); saveSettings({ ...loadSettings(), volume: v }); },
    sensitivity: (v) => { saveSettings({ ...loadSettings(), sensitivity: v }); },
  });

  // --- camera rig ---
  let camYaw = Math.PI * 0.85, camPitch = 0.32;
  const camTarget = new THREE.Vector3();
  function updateCamera(dt) {
    const sens = loadSettings().sensitivity;
    const m = input.consumeMouse();
    camYaw -= m.dx * 0.0026 * sens;
    camPitch = clamp(camPitch + m.dy * 0.0022 * sens, -0.15, 1.1);
    if (state.shotCam) {
      const s = state.shotCam;
      camera.position.set(s.x, s.y, s.z);
      camera.lookAt(s.lookX, s.lookY, s.lookZ);
      return;
    }
    if (!state.started) {
      // slow orbit over the city behind the start screen
      const t = performance.now() * 0.00004;
      camera.position.set(Math.sin(t) * 150, 85, Math.cos(t) * 150);
      camera.lookAt(0, 0, 0);
      return;
    }
    const focus = player.car ? player.car.pos : player.pos;
    const heading = player.car ? player.car.heading : camYaw;
    const dist = player.car ? 11.5 : 7.5;
    const h = player.car ? 4.6 : 3.4;
    const cx = focus.x - Math.sin(heading) * Math.cos(camPitch) * dist;
    const cz = focus.z - Math.cos(heading) * Math.cos(camPitch) * dist;
    const cy = (player.car ? 1.2 : 1.6) + Math.sin(camPitch) * dist + (h - 3.4);
    camTarget.set(
      focus.x + Math.sin(heading) * 4,
      player.car ? 1.4 : 1.5,
      focus.z + Math.cos(heading) * 4);
    camera.position.lerp(new THREE.Vector3(cx, Math.max(1.6, cy), cz), Math.min(1, dt * 7));
    camera.lookAt(camTarget);
    const sh = fx.shakeOffset();
    camera.position.x += sh.x; camera.position.y += sh.y;
  }

  // --- contextual prompt ---
  function updatePrompt() {
    let t = '';
    if (state.over || !state.started) { hud.prompt(''); return; }
    if (player.car) {
      const g = city.garage;
      if (dist2d(player.car.pos.x, player.car.pos.z, g.x, g.z) < 11 && state.cash >= CFG.resprayCost)
        t = 'Press G — Fresh Coat respray $50 (clears wanted, new paint)';
      else if (missions.farePed && dist2d(player.car.pos.x, player.car.pos.z, missions.farePed.x, missions.farePed.z) < 5)
        t = 'Press E to pick up the fare';
      else if (missions.fare) t = 'Fare aboard — follow the yellow marker';
    } else {
      const car = traffic.nearestCar(player.pos.x, player.pos.z, 4.2);
      if (car) t = car.driver === 'traffic' ? `Press E to steal the ${car.name} (+1 ★)` : `Press E to enter the ${car.name}`;
      else if (missions.farePed) t = 'A fare is waving — get a car and pull up';
      else if (missions.npc && dist2d(player.pos.x, player.pos.z, missions.npc.x, missions.npc.z) < 4)
        t = `Talk to ${missions.npc.name} — get close, then get in a car`;
    }
    hud.prompt(t);
  }

  // --- input actions (edge-triggered) ---
  function handleActions(dt) {
    if (input.wasPressed('KeyM')) {
      if (!missions.active && !state.over) {
        const next = state.missionsDone.length;
        if (next < CFG.missions.length) {
          if (missions.startMission(next)) audio.chime();
        } else state.flash('All five jobs done — free roam!');
      }
    }
    if (input.wasPressed('Digit1')) { player.weapon = 'fists'; state.flash('Fists'); }
    if (input.wasPressed('Digit2')) { player.weapon = 'pistol'; state.flash('Pistol — click to shoot'); }
    if (input.wasPressed('KeyL') && player.car) {
      player.car.setHeadlights(!player.car.headlights);
      state.flash(player.car.headlights ? 'Headlights on' : 'Headlights off');
    }
    if (input.wasPressed('KeyG') && player.car) {
      const g = city.garage;
      if (dist2d(player.car.pos.x, player.car.pos.z, g.x, g.z) < 11) {
        if (state.cash >= CFG.resprayCost) {
          state.cash -= CFG.resprayCost;
          police.clearAll();
          const nc = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
          player.car.mesh.children[0].material = new THREE.MeshLambertMaterial({ color: nc });
          player.car.color = nc;
          state.flash('Fresh Coat — clean paint, clean slate. Wanted cleared.');
          audio.chime();
        } else state.flash('Respray costs $50 — you are short.');
      }
    }
    if (input.wasPressed('KeyE')) {
      if (player.car) {
        // fare pickup takes priority over exiting
        if (!(missions.farePed && dist2d(player.car.pos.x, player.car.pos.z, missions.farePed.x, missions.farePed.z) < 5)) {
          exitCar();
        }
      } else {
        const car = traffic.nearestCar(player.pos.x, player.pos.z, 4.2);
        if (car) enterCar(car);
      }
    }
    if (input.wasPressed('KeyF') && !player.car) combat.punch(player, fx);
    if ((input.mousePressed || input.mouseDown) && !player.car && player.weapon === 'pistol' && state.started && !state.paused) {
      combat.shoot(player, fx);
    }
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) {
      if (state.started && !state.over) {
        state.paused = !state.paused;
        if (state.paused) {
          document.exitPointerLock?.();
          hud.showPause(`$${state.cash} · ${state.missionsDone.length}/5 jobs · ${state.tokensCollected.size}/12 sun tokens · ${state.faresDone} fares`);
        } else hud.hidePause();
      }
    }
  }

  // --- per-frame player update ---
  function updatePlayer(dt) {
    const axes = input.moveAxes();
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    if (player.car) {
      const car = player.car;
      const throttle = axes.y;
      const steer = -axes.x;
      car.drive({ throttle, steer, handbrake: input.isDown('Space') }, dt, (x, z, r) => city.collide(x, z, r), fx);
      // stunt ramps: launch off a wedge
      if (car.airY <= 0) {
        for (const r of city.ramps) {
          if (dist2d(car.pos.x, car.pos.z, r.x, r.z) < 4.5 && Math.abs(car.speed) > 17) {
            car.airVy = 8.5; car.airT = 0;
            state.flash('Airborne!');
            break;
          }
        }
      }
      if (car.airVy !== 0 || car.airY > 0) {
        car.airT += dt;
        car.airY += car.airVy * dt;
        car.airVy -= CFG.gravity * dt;
        if (car.airY <= 0) {
          car.airY = 0; car.airVy = 0;
          if (car.airT > 0.75) {
            state.cash += 50;
            state.banner(`STUNT JUMP!  +$50  (${car.airT.toFixed(1)}s air)`);
            audio.chime();
            fx.burst(car.pos.x, 1, car.pos.z, 0xffd23c, 20);
          }
          car.airT = 0;
        }
      }
      car.mesh.position.y = car.airY;
      // running over peds is handled in pedestrians.update
      audio.setEngine(Math.abs(car.speed) / CFG.carMaxSpeed, true);
      player.pos.set(car.pos.x, car.airY, car.pos.z);
      player.heading = car.heading;
      return;
    }
    audio.setEngine(0, false);
    // on foot: camera-relative movement
    const speed = running ? CFG.runSpeed : CFG.walkSpeed;
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    const mx = (sin * axes.y - cos * axes.x) * speed;
    const mz = (cos * axes.y + sin * axes.x) * speed;
    let nx = player.pos.x + mx * dt;
    let nz = player.pos.z + mz * dt;
    const res = city.collide(nx, nz, 0.6);
    nx = res.x; nz = res.z;
    // push out of cars
    for (const c of traffic.cars) {
      if (c.dead) continue;
      const d = dist2d(nx, nz, c.pos.x, c.pos.z);
      if (d < 2.0 && d > 0.01) {
        nx = c.pos.x + ((nx - c.pos.x) / d) * 2.0;
        nz = c.pos.z + ((nz - c.pos.z) / d) * 2.0;
      }
    }
    const moving = Math.abs(mx) + Math.abs(mz) > 0.1;
    if (moving) player.heading = Math.atan2(mx, mz);
    player.pos.x = clamp(nx, -215, 200);
    player.pos.z = clamp(nz, -200, 200);
    // jump + gravity
    if (player.grounded && input.wasPressed('Space')) { player.vy = CFG.jumpSpeed; player.grounded = false; }
    if (!player.grounded) {
      player.vy -= CFG.gravity * dt;
      player.pos.y += player.vy * dt;
      if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.grounded = true; }
    }
    playerMesh.position.copy(player.pos);
    playerMesh.rotation.y = player.heading;
    // walk-cycle swing
    const u = playerMesh.userData;
    u.phase += dt * (moving ? (running ? 13 : 9) : 0);
    const sw = moving ? Math.sin(u.phase) * 0.6 : 0;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
    // sea: don't let Mara walk into the water
    if (player.pos.z > 196 || player.pos.x < -208) {
      player.pos.z = Math.min(player.pos.z, 196);
      player.pos.x = Math.max(player.pos.x, -208);
    }
  }

  // --- main loop ---
  const clock = new THREE.Clock();
  let firstFrame = true;
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (state.started && !state.paused && !state.over) {
      state.minutes += dt * CFG.minutesPerSecond;
      handleActions(dt);
      updatePlayer(dt);
      traffic.update(dt, player, fx);
      peds.update(dt, player.car);
      police.update(dt, player, fx);
      combat.update(dt, player, fx);
      missions.update(dt);
      fx.update(dt);
      hud.update(dt);
      minimap.draw();
      updatePrompt();
    } else if (state.started && state.over) {
      fx.update(dt);
      hud.update(dt);
    }
    updateCamera(dt);
    renderer.render(scene, camera);
    input.endFrame();
    if (firstFrame) {
      firstFrame = false;
      if (SHOT && SHOT_MODES.includes(SHOT)) applyShot(state, SHOT);
      window.__game = state;
      window.__ready = true;
    }
  }
  loop();
  // expose a tiny debug hook for headless playtests
  window.__solmaris = { state, enterCar, exitCar, respawn };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
