// shots.js — deterministic screenshot modes for the 4 submission images.
// ?shot=chase|foot|drive|combat&seed=1 stages a fixed scene (player, cars,
// police, rivals, wanted level, mission state) and a fixed camera, then sets
// window.__shotReady so the capture tool knows the frame is settled.
// The game itself is unchanged by these modes — they only pose it.
import { Car } from './vehicles.js';

export const SHOT_MODES = ['chase', 'foot', 'drive', 'combat'];

export function applyShot(state, mode) {
  const st = state, p = st.player;
  st.shotMode = mode;
  st.started = true;
  st.hud.hideStart();
  st.audio?.ensure();
  st.audio?.setVolume(0);
  // clear the everyday traffic/peds clutter for a composed frame, then restage
  const park = (x, z, heading, color, kind) => {
    const c = new Car(st.scene, x, z, heading, color, kind, { driver: null });
    st.traffic.cars.push(c);
    return c;
  };
  if (mode === 'chase') {
    // COVER: police chase on the beachfront boulevard at noon.
    const car = park(-20, 176, Math.PI / 2, 0xd94f3d, 'sport');
    st.enterCar(car);
    car.speed = 22;
    st.police.setWanted(3, 'shot setup');
    st.police._spawnCarNear(p); st.police._spawnCarNear(p);
    // line the interceptors up behind the getaway car, on the boulevard
    const pc = st.police.cars;
    if (pc[0]) { pc[0].pos.set(-40, 0, 174); pc[0].heading = Math.PI / 2; pc[0].mesh.rotation.y = Math.PI / 2; }
    if (pc[1]) { pc[1].pos.set(-56, 0, 180); pc[1].heading = Math.PI / 2; pc[1].mesh.rotation.y = Math.PI / 2; }
    park(6, 172, Math.PI / 2, 0x3a6ea8, 'sedan');
    park(-46, 180, Math.PI / 2, 0xf2c14e, 'van');
    park(28, 180, Math.PI / 2, 0xe8e4da, 'sedan');
    st.missions.setObjective('Heat Wave: survive the dragnet — reach the safehouse!');
    st.missions.setMarker(-150, 30);
    st.cash = 1240;
    st.cameraMode = 'chase-wide';
    // camera just north of the boulevard, looking south-east down the chase:
    // the stunt ramp stays out of the sightline, sea and beach on the right
    st.shotCam = { x: -64, y: 12, z: 167, lookX: -8, lookY: 1.5, lookZ: 179 };
  } else if (mode === 'foot') {
    // On foot in the Old Town square: peds, stalls, fountain, whitewashed walls.
    p.pos.set(6, 0, 16); p.heading = Math.PI * 0.9; p.car = null;
    p.mesh.position.copy(p.pos); p.mesh.visible = true;
    st.missions.setObjective('First Fare: meet Dario at the Old Town square');
    st.missions.setMarker(10, 8);
    st.cash = 120;
    st.cameraMode = 'foot-wide';
    st.shotCam = { x: -16, y: 7, z: 34, lookX: 4, lookY: 1.6, lookZ: 4 };
  } else if (mode === 'drive') {
    // Driving the cliffside coast highway with the sea and skyline behind.
    const car = park(-198, -40, 0, 0x3a6ea8, 'sedan');
    st.enterCar(car);
    car.speed = 26;
    park(-198, -78, 0, 0xf2c14e, 'van');
    park(-198, -8, 0, 0xd94f3d, 'sport');
    park(-192, 30, Math.PI, 0xe8e4da, 'sedan');
    st.missions.setObjective('Free roam — press M for the next mission');
    st.cash = 640;
    st.cameraMode = 'drive-wide';
    // camera east of the highway looking south down it: road centre, sea on
    // the right, the lighthouse far ahead, skyline on the left
    st.shotCam = { x: -186, y: 9, z: -92, lookX: -198, lookY: 1.5, lookZ: -20 };
  } else if (mode === 'combat') {
    // "The Drop" ambush: Mara on foot, pistol out, three rivals closing in.
    p.pos.set(0, 0, -78); p.heading = Math.PI; p.car = null;
    p.mesh.position.copy(p.pos); p.mesh.visible = true;
    p.weapon = 'pistol'; p.ammo = 24;
    st.combat.spawnRival(-6, -92); st.combat.spawnRival(7, -96); st.combat.spawnRival(0, -104);
    st.combat.spawnPickup(-4, -84, 'health');
    st.police.setWanted(2, 'shot setup');
    st.missions.setObjective('The Drop: deal with the ambush, then deliver to the Marina');
    st.missions.setMarker(150, 150);
    st.cash = 870;
    st.cameraMode = 'combat-wide';
    // pulled back and raised: Mara centre-frame, purple rivals beyond her
    st.shotCam = { x: -10, y: 8, z: -58, lookX: 0, lookY: 1.2, lookZ: -95 };
  }
  // Signal the capture tool after 2 rendered frames of the staged scene
  // (frame-based, not time-based: software rendering is slow headless).
  let shotFrames = 0;
  const waitFrames = () => {
    if (++shotFrames >= 2) window.__shotReady = true;
    else requestAnimationFrame(waitFrames);
  };
  requestAnimationFrame(waitFrames);
}
