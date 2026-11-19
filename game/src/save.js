// save.js — save / load through localStorage. One slot, plain JSON, versioned
// so a future build never misreads an old save.
const KEY = 'solmaris-high-noon-save-v1';
export function saveGame(state) {
  try {
    const data = {
      version: 1, savedAt: new Date().toISOString(),
      cash: state.cash, health: state.player.health, ammo: state.player.ammo,
      missionIndex: state.missionIndex, missionsDone: state.missionsDone,
      tokens: Array.from(state.tokensCollected), racesWon: state.racesWon,
      faresDone: state.faresDone, kills: state.kills,
      minutes: state.minutes,
      px: state.player.pos.x, pz: state.player.pos.z,
      wanted: 0, // never save mid-chase heat
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}
export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.version !== 1) return null;
    return d;
  } catch { return null; }
}
export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}
export function loadSettings() {
  try {
    const d = JSON.parse(localStorage.getItem('solmaris-high-noon-settings') || '{}');
    return { volume: typeof d.volume === 'number' ? d.volume : 0.7, sensitivity: typeof d.sensitivity === 'number' ? d.sensitivity : 1 };
  } catch { return { volume: 0.7, sensitivity: 1 }; }
}
export function saveSettings(s) {
  try { localStorage.setItem('solmaris-high-noon-settings', JSON.stringify(s)); } catch { /* ignore */ }
}
