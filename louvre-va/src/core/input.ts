/** Keyboard + mouse + touch input state. Touch controls are driven by the touch UI module. */
export class Input {
  keys = new Set<string>();
  lookDX = 0; lookDY = 0;
  wheel = 0;
  pointerLocked = false;
  /** Virtual joystick from the touch UI, -1..1 */
  joy = { x: 0, y: 0 };
  touch = { boost: false, up: false, down: false, camera: false, fly: false };
  private pressed = new Set<string>();
  private canvas: HTMLCanvasElement;
  onShutter: (() => void) | null = null;
  onToggleCamera: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) { this.lookDX += e.movementX; this.lookDY += e.movementY; }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) { this.onToggleCamera?.(); return; }
      if (e.button === 0) {
        if (!this.pointerLocked) { canvas.requestPointerLock?.(); }
        else this.onShutter?.();
      }
    });
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === canvas; });
  }

  /** True once per key press. */
  justPressed(code: string): boolean {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }
  down(code: string): boolean { return this.keys.has(code); }
  consumeLook(): { dx: number; dy: number } { const r = { dx: this.lookDX, dy: this.lookDY }; this.lookDX = 0; this.lookDY = 0; return r; }
  consumeWheel(): number { const w = this.wheel; this.wheel = 0; return w; }
  releasePointer() { if (this.pointerLocked) document.exitPointerLock(); }
  endFrame() { this.pressed.clear(); }
  get isCanvas() { return this.canvas; }
}
