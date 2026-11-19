// input.js — keyboard + mouse input with pointer lock, plus a tiny queue of
// "pressed this frame" edge events so gameplay code can ask wasPressed('KeyE').
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();       // keys currently held (event.code)
    this.pressed = new Set();    // keys pressed since last endFrame()
    this.mouseDX = 0; this.mouseDY = 0;
    this.mouseDown = false; this.mousePressed = false;
    this.locked = false;
    this.onFirstGesture = null;  // called once on the first key/click (audio unlock)
    this._gestured = false;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      this._gesture();
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.mousePressed = true; }
      this._gesture();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    canvas.addEventListener('click', () => {
      if (!this.locked && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    });
  }
  _gesture() {
    if (!this._gestured) { this._gestured = true; this.onFirstGesture?.(); }
  }
  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  consumeMouse() { const d = { dx: this.mouseDX, dy: this.mouseDY }; this.mouseDX = 0; this.mouseDY = 0; return d; }
  endFrame() { this.pressed.clear(); this.mousePressed = false; }
  // WASD / arrows as a -1..1 pair, camera-relative (handled by caller).
  moveAxes() {
    let x = 0, y = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y -= 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    return { x, y };
  }
}
