import { el, ui } from './dom';
import type { Input } from '../core/input';
import type { Player } from '../gameplay/player';
import { config } from '../data/config';

export class TouchControls {
  root: HTMLElement; btnFly: HTMLButtonElement; btnCam: HTMLButtonElement; btnShot: HTMLButtonElement; btnMap: HTMLButtonElement; btnBoost: HTMLButtonElement; btnUp: HTMLButtonElement; btnDown: HTMLButtonElement; height: HTMLElement; heightInput: HTMLInputElement;
  onCamera: (() => void) | null = null; onShutter: (() => void) | null = null; onMap: (() => void) | null = null; onZoom: ((dir: 1 | -1) => void) | null = null;
  constructor(private input: Input, private player: Player) {
    const joy = el('div', { id: 'joy' }, [el('div', { class: 'knob' })]);
    const look = el('div', { id: 'look' });
    this.btnFly = el('button', {}, ['BAY']); this.btnCam = el('button', {}, ['📷']); this.btnShot = el('button', { class: 'big hidden' }, ['']);
    this.btnMap = el('button', {}, ['MAP']); this.btnBoost = el('button', {}, ['⚡']); this.btnUp = el('button', { class: 'hidden' }, ['▲']); this.btnDown = el('button', { class: 'hidden' }, ['▼']);
    this.heightInput = el('input', { type: 'range', min: `${config.player.cameraHeightMin}`, max: `${config.player.cameraHeightMax}`, step: '0.05', value: `${config.player.eyeHeight}` });
    this.height = el('div', { id: 'height-slider' }, [el('span', {}, ['2.0']), this.heightInput, el('span', {}, ['0.3'])]);
    const right = el('div', { id: 'touch-right' }, [this.btnMap, this.btnFly, this.btnUp, this.btnDown, this.btnBoost, this.btnCam, this.btnShot]);
    this.root = el('div', { id: 'touch' }, [look, joy, this.height, right]);
    ui().append(this.root);
    // joystick
    const knob = joy.firstElementChild as HTMLElement; let jid = -1; const R = 45;
    joy.addEventListener('pointerdown', (e) => { jid = e.pointerId; joy.setPointerCapture(e.pointerId); });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== jid) return; const r = joy.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const d = Math.hypot(dx, dy); if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`; input.joy.x = dx / R; input.joy.y = dy / R;
    });
    const end = (e: PointerEvent) => { if (e.pointerId !== jid) return; jid = -1; knob.style.transform = ''; input.joy.x = 0; input.joy.y = 0; };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
    // look: drag on the right half
    // one finger: look. Two fingers: pinch to zoom (steps through the focal presets)
    let lid = -1, lx = 0, ly = 0; const pts = new Map<number, [number, number]>(); let pinchD = 0;
    const dist = () => { const v = [...pts.values()]; return v.length < 2 ? 0 : Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); };
    look.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); look.setPointerCapture(e.pointerId); if (pts.size === 1) { lid = e.pointerId; lx = e.clientX; ly = e.clientY; } else { lid = -1; pinchD = dist(); } });
    look.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size >= 2) { const d = dist(); if (Math.abs(d - pinchD) > 45) { this.onZoom?.(d > pinchD ? 1 : -1); pinchD = d; } return; }
      if (e.pointerId !== lid) return; player.touchLook.dx += (e.clientX - lx) * 1.6; player.touchLook.dy += (e.clientY - ly) * 1.6; lx = e.clientX; ly = e.clientY;
    });
    const lend = (e: PointerEvent) => { pts.delete(e.pointerId); if (e.pointerId === lid) lid = -1; if (pts.size === 1) { const [id, p] = [...pts.entries()][0]; lid = id; lx = p[0]; ly = p[1]; } };
    look.addEventListener('pointerup', lend); look.addEventListener('pointercancel', lend);
    const hold = (b: HTMLButtonElement, key: keyof typeof input.touch) => { b.addEventListener('pointerdown', (e) => { e.preventDefault(); input.touch[key] = true; b.classList.add('on'); }); const off = () => { input.touch[key] = false; b.classList.remove('on'); }; b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); };
    hold(this.btnBoost, 'boost'); hold(this.btnUp, 'up'); hold(this.btnDown, 'down');
    this.btnFly.onclick = () => { input.touch.fly = true; };
    this.btnCam.onclick = () => this.onCamera?.();
    this.btnShot.onclick = () => this.onShutter?.();
    this.btnMap.onclick = () => this.onMap?.();
    this.heightInput.oninput = () => { player.cameraHeight = parseFloat(this.heightInput.value); };
  }
  setVisible(on: boolean) { this.root.classList.toggle('on', on); }
  update(cameraOn: boolean) {
    const fly = this.player.mode === 'fly';
    this.btnUp.classList.toggle('hidden', !fly); this.btnDown.classList.toggle('hidden', !fly);
    this.height.classList.toggle('hidden', fly);
    this.btnFly.classList.toggle('on', fly); this.btnFly.classList.toggle('hidden', !this.player.flyEnabled);
    this.btnShot.classList.toggle('hidden', !cameraOn); this.btnCam.classList.toggle('on', cameraOn);
    if (!fly && Math.abs(parseFloat(this.heightInput.value) - this.player.cameraHeight) > 0.01) this.heightInput.value = this.player.cameraHeight.toFixed(2);
  }
}
