import { config } from '../data/config';
import { el, ui } from './dom';
import type { PhotoCamera, AspectKey } from '../gameplay/photo';
import type { Player } from '../gameplay/player';

export class Viewfinder {
  root: HTMLElement; canvas: HTMLCanvasElement; readout: HTMLElement; controls: HTMLElement; flash: HTMLElement;
  onShutter: (() => void) | null = null;
  constructor(private cam: PhotoCamera, private isTouch: boolean) {
    this.canvas = el('canvas');
    this.readout = el('div', { id: 'vf-readout' });
    this.controls = el('div', { id: 'vf-controls' });
    this.flash = el('div', { id: 'shutter-flash' });
    this.root = el('div', { id: 'vf' }, [this.canvas, this.readout, this.controls, this.flash]);
    ui().append(this.root);
    this.buildControls();
  }
  private buildControls() {
    const c = this.controls; c.innerHTML = '';
    const focal = el('div', { class: 'seg' });
    for (const f of config.camera.focals) {
      const b = el('button', { class: f === this.cam.focal ? 'active' : '' }, [`${f}`]);
      b.onclick = () => { this.cam.focal = f; this.buildControls(); };
      focal.append(b);
    }
    const asp = el('div', { class: 'seg' });
    for (const k of Object.keys(config.camera.aspects) as AspectKey[]) {
      const b = el('button', { class: k === this.cam.aspectKey ? 'active' : '' }, [k]);
      b.onclick = () => { this.cam.aspectKey = k; this.buildControls(); };
      asp.append(b);
    }
    const grid = el('div', { class: 'seg' });
    const gk: (keyof typeof this.cam.grid)[] = ['thirds', 'diagonals', 'center'];
    const gl = { thirds: '⅓', diagonals: '⨯', center: '+' };
    for (const k of gk) { const b = el('button', { class: this.cam.grid[k] ? 'active' : '' }, [gl[k]]); b.onclick = () => { this.cam.grid[k] = !this.cam.grid[k]; this.buildControls(); }; grid.append(b); }
    c.append(el('span', { class: 'muted' }, ['mm']), focal, asp, grid);
    if (!this.isTouch) { const sh = el('button', { class: 'primary' }, ['● Chụp (Space)']); sh.onclick = () => this.onShutter?.(); c.append(sh); }
  }
  setOn(on: boolean) { this.root.classList.toggle('on', on); if (on) this.buildControls(); }
  doFlash() { this.flash.classList.add('on'); setTimeout(() => this.flash.classList.remove('on'), 60); }
  draw(player: Player) {
    const c = this.canvas; const vw = c.clientWidth, vh = c.clientHeight;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(vw * dpr)) { c.width = Math.round(vw * dpr); c.height = Math.round(vh * dpr); }
    const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, vw, vh);
    const r = this.cam.frameRect(vw, vh);
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, vw, r.y); ctx.fillRect(0, r.y + r.h, vw, vh - r.y - r.h); ctx.fillRect(0, r.y, r.x, r.h); ctx.fillRect(r.x + r.w, r.y, vw - r.x - r.w, r.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
    const g = this.cam.grid;
    if (g.thirds) { for (const k of [1, 2]) { ctx.beginPath(); ctx.moveTo(r.x + (r.w * k) / 3, r.y); ctx.lineTo(r.x + (r.w * k) / 3, r.y + r.h); ctx.moveTo(r.x, r.y + (r.h * k) / 3); ctx.lineTo(r.x + r.w, r.y + (r.h * k) / 3); ctx.stroke(); } }
    if (g.diagonals) { ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.moveTo(r.x + r.w, r.y); ctx.lineTo(r.x, r.y + r.h); ctx.stroke(); }
    if (g.center) { const cx = r.x + r.w / 2, cy = r.y + r.h / 2; ctx.beginPath(); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.stroke(); }
    // level: horizon tilt in degrees (camera roll)
    const rollDeg = (player.roll * 180) / Math.PI; const ok = Math.abs(rollDeg) < 1;
    const lx = r.x + r.w / 2, ly = r.y + r.h - 26;
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(-player.roll); ctx.strokeStyle = ok ? '#35d07f' : '#ff3b30'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(-10, 0); ctx.moveTo(10, 0); ctx.lineTo(50, 0); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(lx - 60, ly); ctx.lineTo(lx - 54, ly); ctx.moveTo(lx + 54, ly); ctx.lineTo(lx + 60, ly); ctx.stroke();
    const h = player.mode === 'fly' ? player.alt : player.cameraHeight;
    this.readout.innerHTML = `<span>${this.cam.focal} mm</span><span>${this.cam.aspectKey}</span><span>máy ${h.toFixed(2)} m</span><span class="lvl ${ok ? 'ok' : ''}">${rollDeg >= 0 ? '+' : ''}${rollDeg.toFixed(1)}°</span>`;
  }
}
