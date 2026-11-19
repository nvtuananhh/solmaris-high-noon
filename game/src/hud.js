// hud.js — all DOM UI: health/cash/stars/clock, objective banner, message
// feed, start screen, pause menu, settings, BUSTED/WASTED screens and the
// mission button. Pure DOM over the WebGL canvas; no assets.
import { CFG, fmtClock, districtAt } from './config.js';
import { hasSave } from './save.js';

export class HUD {
  constructor(state) {
    this.state = state;
    const root = document.getElementById('hud');
    root.innerHTML = `
    <div id="hud-top-left">
      <div id="health-wrap"><div id="health-bar"></div><span id="health-num">100</span></div>
      <div id="cash">$<span id="cash-num">120</span></div>
      <div id="district">Old Town</div>
    </div>
    <div id="hud-top-right">
      <div id="stars"></div>
      <div id="clock">11:48</div>
      <div id="weapon">Fists [1] · Pistol [2] · Ammo <span id="ammo-num">24</span></div>
    </div>
    <div id="objective"></div>
    <div id="banner"></div>
    <div id="messages"></div>
    <div id="hint">WASD move · Shift run · Space jump · E enter car · F punch · Click shoot · M mission · Esc pause</div>
    <div id="prompt"></div>
    <canvas id="minimap" width="190" height="190"></canvas>
    <div id="center-screen"></div>
    <div id="start-screen">
      <div class="panel">
        <h1>SOLMARIS</h1><h2>— HIGH NOON —</h2>
        <p class="tag">A sun-soaked open-world crime story. Mara Voss, ex-stunt driver,
        runs a courier service on the coast — and the whole city wants a piece of her.</p>
        <p class="story">Five jobs. One lighthouse. High noon.</p>
        <div class="buttons">
          <button id="btn-start">START ENGINE</button>
          <button id="btn-load" ${hasSave() ? '' : 'disabled'}>CONTINUE (SAVE)</button>
          <button id="btn-how">HOW TO PLAY</button>
        </div>
        <div id="howto" hidden>
          <p><b>WASD</b> walk / drive · <b>Mouse</b> camera · <b>Shift</b> run · <b>Space</b> jump / handbrake ·
          <b>E</b> enter / exit car · <b>F</b> punch · <b>1 / 2</b> fists / pistol · <b>Click</b> shoot ·
          <b>L</b> headlights · <b>M</b> next mission · <b>Esc</b> pause · <b>G</b> respray at the garage.</p>
          <p>Steal cars, take fares, win races, grab the 12 sun tokens. Wanted stars bring the police —
          lose them, or pay $50 for a Fresh Coat at the blue garage.</p>
        </div>
        <p class="foot">An original game. No Rockstar content. Sound is synthesised live — no audio files.</p>
      </div>
    </div>
    <div id="pause-screen" hidden>
      <div class="panel">
        <h2>PAUSED</h2>
        <label>Volume <input id="set-volume" type="range" min="0" max="1" step="0.05" value="0.7"></label>
        <label>Mouse sensitivity <input id="set-sens" type="range" min="0.3" max="2.5" step="0.1" value="1"></label>
        <div class="buttons">
          <button id="btn-resume">RESUME</button>
          <button id="btn-save">SAVE GAME</button>
          <button id="btn-restart">RESTART DAY</button>
        </div>
        <p class="foot">Progress: <span id="pause-progress"></span></p>
      </div>
    </div>
    <div id="end-screen" hidden>
      <div class="panel"><h2 id="end-title">BUSTED</h2><p id="end-text"></p>
      <div class="buttons"><button id="btn-retry">BACK ON THE STREET</button></div></div>
    </div>`;
    this.el = {};
    for (const id of ['health-bar', 'health-num', 'cash-num', 'district', 'stars', 'clock', 'ammo-num', 'objective', 'banner', 'messages', 'hint', 'prompt', 'center-screen', 'start-screen', 'pause-screen', 'end-screen', 'end-title', 'end-text', 'pause-progress', 'howto', 'weapon']) {
      this.el[id] = document.getElementById(id);
    }
    this._bannerT = 0;
    document.getElementById('btn-how').onclick = () => { this.el.howto.hidden = !this.el.howto.hidden; };
  }
  bind(callbacks) {
    document.getElementById('btn-start').onclick = () => callbacks.start(false);
    document.getElementById('btn-load').onclick = () => callbacks.start(true);
    document.getElementById('btn-resume').onclick = () => callbacks.resume();
    document.getElementById('btn-save').onclick = () => callbacks.save();
    document.getElementById('btn-restart').onclick = () => callbacks.restart();
    document.getElementById('btn-retry').onclick = () => callbacks.retry();
    document.getElementById('set-volume').oninput = (e) => callbacks.volume(+e.target.value);
    document.getElementById('set-sens').oninput = (e) => callbacks.sensitivity(+e.target.value);
  }
  showStart() { this.el['start-screen'].hidden = false; }
  hideStart() { this.el['start-screen'].hidden = true; }
  showPause(progress) {
    this.el['pause-screen'].hidden = false;
    this.el['pause-progress'].textContent = progress;
  }
  hidePause() { this.el['pause-screen'].hidden = true; }
  showEnd(title, text) {
    this.el['end-title'].textContent = title;
    this.el['end-text'].textContent = text;
    this.el['end-screen'].hidden = false;
  }
  hideEnd() { this.el['end-screen'].hidden = true; }
  banner(text) {
    this.el.banner.textContent = text;
    this.el.banner.style.opacity = '1';
    this._bannerT = 4;
  }
  flash(text) {
    const div = document.createElement('div');
    div.className = 'msg'; div.textContent = text;
    this.el.messages.appendChild(div);
    while (this.el.messages.children.length > 5) this.el.messages.removeChild(this.el.messages.firstChild);
    setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 600); }, 5200);
  }
  prompt(text) { this.el.prompt.textContent = text || ''; }
  update(dt) {
    const st = this.state, p = st.player;
    if (this._bannerT > 0) {
      this._bannerT -= dt;
      if (this._bannerT <= 0) this.el.banner.style.opacity = '0';
    }
    this.el['health-bar'].style.width = Math.max(0, p.health) + '%';
    this.el['health-bar'].style.background = p.health > 50 ? '#37d67a' : p.health > 25 ? '#f2c14e' : '#e84a3a';
    this.el['health-num'].textContent = Math.ceil(Math.max(0, p.health));
    this.el['cash-num'].textContent = st.cash.toLocaleString('en-US');
    this.el['district'].textContent = districtAt(p.pos.x, p.pos.z);
    this.el.clock.textContent = fmtClock(st.minutes);
    this.el['ammo-num'].textContent = p.ammo;
    this.el.weapon.style.opacity = p.car ? '0.35' : '1';
    let stars = '';
    for (let i = 0; i < CFG.maxWanted; i++) stars += i < st.wanted ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.style.color = st.wanted > 0 ? '#ffd23c' : 'rgba(255,255,255,0.55)';
    this.el.objective.textContent = st.objective || '';
    this.el['center-screen'].textContent = st.centerText || '';
  }
}
