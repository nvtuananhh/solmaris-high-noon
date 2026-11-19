// audio.js — everything is synthesised with WebAudio. No audio files, no network.
// Engine hum, police siren, gunshots, punches, chimes, and a light Mediterranean
// pad-and-pluck music loop. Created lazily on the first user gesture.
export class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.musicGain = null; this.sfxGain = null;
    this.volume = 0.7; this.muted = false;
    this.engineOsc = null; this.engineOsc2 = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenLfo = null;
    this.musicTimer = null; this.musicStep = 0;
    this._noiseBuf = null;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
    // engine: two detuned saws through a lowpass, gain follows speed
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 420;
    this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator(); this.engineOsc2.type = 'square'; this.engineOsc2.frequency.value = 28;
    const g2 = this.ctx.createGain(); g2.gain.value = 0.4;
    this.engineOsc.connect(filt); this.engineOsc2.connect(g2); g2.connect(filt);
    filt.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); this.engineOsc2.start();
    // siren: triangle wobbling between two tones
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 720;
    this.sirenLfo = this.ctx.createOscillator(); this.sirenLfo.type = 'square'; this.sirenLfo.frequency.value = 0.55;
    const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 190;
    this.sirenLfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start(); this.sirenLfo.start();
    this.startMusic();
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; }
  setEngine(speed01, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, t, 0.1);
    const f = 52 + speed01 * 130;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
  }
  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }
  _noise() {
    if (this._noiseBuf) return this._noiseBuf;
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf; return buf;
  }
  _burst(dur, freq, type, vol, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource(); src.buffer = this._noise();
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t + dur + 0.05);
  }
  _tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  gunshot() { this._burst(0.16, 1800, 'highpass', 0.5); this._tone(160, 0.1, 'square', 0.25, 0, 60); }
  punch() { this._tone(120, 0.09, 'sine', 0.5, 0, 55); this._burst(0.07, 500, 'lowpass', 0.3); }
  honk() { this._tone(370, 0.22, 'square', 0.12); this._tone(466, 0.22, 'square', 0.1); }
  chime() { this._tone(880, 0.25, 'sine', 0.22); this._tone(1318, 0.35, 'sine', 0.18, 0.09); }
  cash() { this._tone(1046, 0.12, 'triangle', 0.22); this._tone(1568, 0.22, 'triangle', 0.2, 0.08); }
  crash() { this._burst(0.3, 900, 'lowpass', 0.55); this._tone(70, 0.25, 'sine', 0.4, 0, 38); }
  busted() { this._tone(220, 0.5, 'sawtooth', 0.2, 0, 110); this._tone(330, 0.5, 'sawtooth', 0.15, 0.4, 165); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.28, 'triangle', 0.2, i * 0.11)); }
  click() { this._tone(700, 0.06, 'sine', 0.15); }
  // Gentle sunlit loop: A-minor-ish pad chords + a plucked melody line.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [146.8, 220, 293.7]];
    const melody = [440, 523.25, 659.25, 523.25, 587.33, 659.25, 880, 659.25, 587.33, 523.25, 440, 392];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const chord = chords[Math.floor(this.musicStep / 4) % chords.length];
      const note = melody[this.musicStep % melody.length];
      const t = this.ctx.currentTime;
      chord.forEach((f) => {
        const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + 1.9);
        o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 2);
      });
      if (this.musicStep % 2 === 0) {
        const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = note;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.8);
      }
      this.musicStep++;
    }, 480);
  }
}
