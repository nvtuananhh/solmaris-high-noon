// config.js — every tunable number and named constant for Solmaris, in one place.
// Nothing here imports anything; every other module reads from this single object.
export const CFG = {
  title: 'Solmaris — High Noon',
  version: '1.0.0',
  // --- world ---
  cityHalf: 180,          // city blocks span x,z in [-180, 180]
  roadSpacing: 60,        // distance between road centrelines
  roadWidth: 11,
  seaLevel: 0.4,          // sea plane height (ground is y=0)
  beachZ: 186,            // sand strip starts here (south edge)
  gravity: 26,
  // --- player on foot ---
  walkSpeed: 6,
  runSpeed: 10.5,
  jumpSpeed: 9.5,
  playerHealth: 100,
  // --- driving ---
  carAccel: 26,
  carBrake: 42,
  carMaxSpeed: 46,        // ~165 km/h arcade units
  carMaxReverse: 12,
  carTurn: 1.9,
  carGrip: 6.5,
  // --- wanted ---
  wantedDecaySeconds: 26, // quiet seconds to drop one star
  maxWanted: 5,
  // --- combat ---
  pistolDamage: 34,
  punchDamage: 12,
  pistolAmmoStart: 24,
  pistolRange: 55,
  // --- economy ---
  startCash: 120,
  resprayCost: 50,
  taxiFare: 90,
  racePrize: 250,
  tokenValue: 25,
  // --- day clock (bright midday: game starts 11:48, one game minute per real second) ---
  startMinutes: 11 * 60 + 48,
  minutesPerSecond: 1,
  // --- colours: sun-soaked Mediterranean palette ---
  colors: {
    sky: 0x7ec8f2, sun: 0xfff2cf, sea: 0x1e6fb8, deepSea: 0x14568f,
    sand: 0xe8d9a8, road: 0x3d4148, sidewalk: 0xcfc6b4,
    wallWhite: 0xf5efe2, wallCream: 0xead9b8, wallTerra: 0xd98a5f,
    wallBlue: 0x7fb2d9, roofTerra: 0xc96f3f, roofSlate: 0x5a6b7d,
    glass: 0x9fd4e8, palm: 0x3f7a3a, trunk: 0x8a6a4a,
  },
  // --- districts (name, centre, half-size) for HUD location text ---
  districts: [
    { name: 'Old Town', x: -90, z: -60, r: 85 },
    { name: 'Marina', x: 135, z: 135, r: 70 },
    { name: 'Downtown', x: 0, z: -90, r: 80 },
    { name: 'Beachfront', x: 0, z: 165, r: 120 },
    { name: 'Hillside Villas', x: -135, z: 60, r: 80 },
    { name: 'Lighthouse Point', x: -195, z: 195, r: 45 },
    { name: 'Coast Highway', x: -195, z: 0, r: 60 },
  ],
  // --- mission chain (story beats; logic lives in missions.js) ---
  missions: [
    { id: 1, name: 'First Fare', giver: 'Dario', pay: 150,
      brief: 'Drive your first client across town. Pick up Dario at the Old Town square and take him to the Marina.' },
    { id: 2, name: 'Repo Run', giver: 'Lena', pay: 300,
      brief: 'Repossess the coral sports car from the guarded marina lot, then lose the 2-star police tail and bring it to the garage.' },
    { id: 3, name: 'The Drop', giver: 'Lena', pay: 450,
      brief: 'Timed delivery to Downtown. A rival crew will try to stop you — fight through or outrun them.' },
    { id: 4, name: 'Heat Wave', giver: 'Fixer', pay: 600,
      brief: 'A 4-star dragnet is closing in. Break through the roadblocks and reach the Hillside safehouse.' },
    { id: 5, name: 'High Noon', giver: 'Fixer', pay: 1000,
      brief: 'Drive the Fixer to the lighthouse at noon, with police and rivals in pursuit. End this.' },
  ],
  // --- collectibles / activities ---
  sunTokens: 12,
  races: [
    { name: 'Boulevard Sprint', pay: 250 },
    { name: 'Coast Climb', pay: 300 },
    { name: 'Old Town Loop', pay: 350 },
  ],
};
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export function districtAt(x, z) {
  for (const d of CFG.districts) if (dist2d(x, z, d.x, d.z) < d.r) return d.name;
  return 'Solmaris';
}
export function fmtClock(minutes) {
  const h = Math.floor(minutes / 60) % 24, m = Math.floor(minutes % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
