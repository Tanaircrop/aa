import { config } from '../data/config';
import { el, ui } from './dom';
import type { PhotoCamera, AspectKey } from '../gameplay/photo';
import type { Player } from '../gameplay/player';

interface Rect { x: number; y: number; w: number; h: number }
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * First-person camera overlay: hands holding a mirrorless body whose LCD is the viewfinder.
 * Camera off: the camera hangs low at the bottom right. Camera on: it rises and the LCD fills the frame.
 */
export class Viewfinder {
  root: HTMLElement; canvas: HTMLCanvasElement; readout: HTMLElement; controls: HTMLElement; flash: HTMLElement;
  onShutter: (() => void) | null = null;
  private t = 0; // 0 = lowered, 1 = raised
  badges = { a: false, v: false, both: false, eggs: [] as string[] };
  private badgePulse = 0;
  private bob = 0;
  constructor(private cam: PhotoCamera, private isTouch: boolean) {
    this.canvas = el('canvas');
    this.readout = el('div', { id: 'vf-readout', class: 'hidden' });
    this.controls = el('div', { id: 'vf-controls', class: 'hidden' });
    this.flash = el('div', { id: 'shutter-flash' });
    this.root = el('div', { id: 'vf', class: 'on' }, [this.canvas, this.readout, this.controls, this.flash]);
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
    if (!this.isTouch) { const sh = el('button', { class: 'primary' }, ['● Chụp (Space)']); sh.onclick = () => this.onShutter?.(); c.append(sh); c.append(el('span', { class: 'muted', style: 'font-size:11px' }, ['con lăn / 1-5: zoom · T: tỷ lệ · L: lưới · Esc: thả chuột để bấm nút'])); }
  }
  cycleAspect() { const keys = Object.keys(config.camera.aspects) as AspectKey[]; this.cam.aspectKey = keys[(keys.indexOf(this.cam.aspectKey) + 1) % keys.length]; this.buildControls(); }
  cycleGrid() {
    const g = this.cam.grid;
    if (g.thirds && !g.diagonals) { g.thirds = false; g.diagonals = true; }
    else if (g.diagonals) { g.diagonals = false; g.center = true; }
    else if (g.center) { g.center = false; }
    else g.thirds = true;
    this.buildControls();
  }
  setOn(on: boolean) { this.controls.classList.toggle('hidden', !on); this.readout.classList.toggle('hidden', !on); if (on) this.buildControls(); }
  doFlash() { this.flash.classList.add('on'); setTimeout(() => this.flash.classList.remove('on'), 60); }

  private lastFocal = 0; private lastAspect = '';
  draw(player: Player, cameraOn: boolean, dt: number) {
    if (cameraOn && (this.cam.focal !== this.lastFocal || this.cam.aspectKey !== this.lastAspect)) { this.lastFocal = this.cam.focal; this.lastAspect = this.cam.aspectKey; this.buildControls(); }
    this.t = Math.max(0, Math.min(1, this.t + (cameraOn ? 1 : -1) * dt * 4.5));
    this.bob += dt;
    const c = this.canvas; const vw = c.clientWidth, vh = c.clientHeight;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(vw * dpr)) { c.width = Math.round(vw * dpr); c.height = Math.round(vh * dpr); }
    const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, vw, vh);
    const k = ease(this.t);
    const full = this.cam.frameRect(vw, vh);
    const idleW = Math.min(vw * 0.3, 360); const idleH = idleW / 1.5;
    const sway = Math.sin(this.bob * 1.8) * 4;
    const idle: Rect = { x: vw - idleW * 0.78 + sway, y: vh - idleH * 0.55 + Math.cos(this.bob * 2.3) * 3, w: idleW, h: idleH };
    const r: Rect = { x: lerp(idle.x, full.x, k), y: lerp(idle.y, full.y, k), w: lerp(idle.w, full.w, k), h: lerp(idle.h, full.h, k) };
    // darken outside the LCD once raised
    if (k > 0.02) {
      ctx.fillStyle = `rgba(0,0,0,${0.78 * k})`;
      ctx.fillRect(0, 0, vw, r.y); ctx.fillRect(0, r.y + r.h, vw, vh - r.y - r.h); ctx.fillRect(0, r.y, r.x, r.h); ctx.fillRect(r.x + r.w, r.y, vw - r.x - r.w, r.h);
    }
    this.drawCameraAndHands(ctx, r, k, vw, vh);
    if (k > 0.85) this.drawViewfinder(ctx, r, player, (k - 0.85) / 0.15);
    if (!cameraOn) this.readout.innerHTML = '';
  }

  private drawCameraAndHands(ctx: CanvasRenderingContext2D, r: Rect, k: number, vw: number, vh: number) {
    const pad = Math.max(10, Math.min(26, r.w * 0.045));
    const body: Rect = { x: r.x - pad, y: r.y - pad * 1.6, w: r.w + pad * 2.6, h: r.h + pad * 2.8 };
    const rr = (x: number, y: number, w: number, h: number, rad: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); };
    const skin = '#c9906b', skinDark = '#a66e4e', skinLight = '#e0ab85', sleeve = '#2b2e35';
    // left hand: supports the lens from below-left; fingers curl up the left edge
    const lx = body.x + pad * 0.4, ly = body.y + body.h * 0.55;
    ctx.fillStyle = sleeve; rr(lx - body.w * 0.22 - 60, ly + body.h * 0.1, body.w * 0.26 + 60, vh, 40); ctx.fill();
    ctx.fillStyle = skin; rr(lx - body.w * 0.14, ly - body.h * 0.05, body.w * 0.2, body.h * 0.6, pad * 2); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const fy = body.y + body.h * (0.28 + i * 0.13); const fw = pad * 2.4 + i * 2, fh = pad * 1.5;
      ctx.fillStyle = i % 2 ? skin : skinLight; rr(lx - fw * 0.45, fy, fw, fh, fh / 2); ctx.fill();
      ctx.fillStyle = skinDark; rr(lx - fw * 0.45, fy + fh * 0.7, fw, fh * 0.3, fh / 2); ctx.fill();
    }
    // right hand: grips the right side; thumb rests on the back, index finger on the shutter
    const gx = body.x + body.w, gy = body.y + body.h * 0.5;
    ctx.fillStyle = sleeve; rr(gx - pad * 1.2, gy + body.h * 0.15, body.w * 0.3 + 80, vh, 40); ctx.fill();
    ctx.fillStyle = skin; rr(gx - pad * 1.6, gy - body.h * 0.12, pad * 4.5, body.h * 0.62, pad * 2.2); ctx.fill();
    ctx.fillStyle = skinDark; rr(gx - pad * 1.6, gy + body.h * 0.3, pad * 4.5, body.h * 0.2, pad * 2); ctx.fill();
    // camera body (back view): dark magnesium shell, grip on the right, hump on top
    const shell = ctx.createLinearGradient(body.x, body.y, body.x, body.y + body.h);
    shell.addColorStop(0, '#2a2d31'); shell.addColorStop(0.5, '#1b1d20'); shell.addColorStop(1, '#121315');
    ctx.fillStyle = shell; rr(body.x, body.y, body.w, body.h, pad * 0.9); ctx.fill();
    ctx.fillStyle = '#26292d'; rr(body.x + body.w * 0.38, body.y - pad * 0.9, body.w * 0.14, pad * 1.2, pad * 0.3); ctx.fill(); // viewfinder hump
    ctx.fillStyle = '#0a0b0c'; rr(body.x + body.w * 0.42, body.y - pad * 0.6, body.w * 0.06, pad * 0.6, pad * 0.15); ctx.fill(); // eyepiece
    ctx.fillStyle = '#2f3237'; ctx.beginPath(); ctx.arc(body.x + body.w * 0.86, body.y + pad * 0.05, pad * 0.75, 0, Math.PI * 2); ctx.fill(); // mode dial
    ctx.fillStyle = '#e8c07a'; ctx.beginPath(); ctx.arc(body.x + body.w * 0.78, body.y - pad * 0.1, pad * 0.35, 0, Math.PI * 2); ctx.fill(); // shutter release
    // thumb on the back right, index over the top
    ctx.fillStyle = skin; rr(body.x + body.w - pad * 1.9, body.y + pad * 1.4, pad * 1.6, body.h * 0.34, pad * 0.8); ctx.fill();
    ctx.fillStyle = skinLight; rr(body.x + body.w * 0.72, body.y - pad * 1.1, pad * 2.6, pad * 1.4, pad * 0.7); ctx.fill();
    // rear controls to the right of the LCD
    ctx.fillStyle = '#3a3d42';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(body.x + body.w - pad * 1.1, r.y + r.h * (0.5 + i * 0.12), pad * 0.3, 0, Math.PI * 2); ctx.fill(); }
    // LCD: cut the screen out of the shell so the 3D view shows through, then bezel
    ctx.clearRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#0b0c0d'; ctx.lineWidth = Math.max(2, pad * 0.25); rr(r.x - pad * 0.2, r.y - pad * 0.2, r.w + pad * 0.4, r.h + pad * 0.4, pad * 0.3); ctx.stroke();
    if (k < 1) { ctx.fillStyle = `rgba(14,16,18,${1 - k})`; ctx.fillRect(r.x, r.y, r.w, r.h); }
    if (k < 0.5) { ctx.fillStyle = `rgba(53,208,127,${1 - k * 2})`; ctx.beginPath(); ctx.arc(r.x + r.w - pad, r.y + pad, Math.max(2, pad * 0.25), 0, Math.PI * 2); ctx.fill(); }
    // brand-free top plate label
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = `${Math.max(8, pad * 0.7)}px sans-serif`; ctx.textAlign = 'left'; ctx.fillText('FF 36×24', body.x + pad, body.y + pad * 1.1);
    void vw;
  }

  private drawViewfinder(ctx: CanvasRenderingContext2D, r: Rect, player: Player, a: number) {
    ctx.save(); ctx.globalAlpha = a;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
    const g = this.cam.grid;
    if (g.thirds) { for (const k of [1, 2]) { ctx.beginPath(); ctx.moveTo(r.x + (r.w * k) / 3, r.y); ctx.lineTo(r.x + (r.w * k) / 3, r.y + r.h); ctx.moveTo(r.x, r.y + (r.h * k) / 3); ctx.lineTo(r.x + r.w, r.y + (r.h * k) / 3); ctx.stroke(); } }
    if (g.diagonals) { ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.moveTo(r.x + r.w, r.y); ctx.lineTo(r.x, r.y + r.h); ctx.stroke(); }
    if (g.center) { const cx = r.x + r.w / 2, cy = r.y + r.h / 2; ctx.beginPath(); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.stroke(); }
    const rollDeg = (player.roll * 180) / Math.PI; const ok = Math.abs(rollDeg) < 1;
    const lx = r.x + r.w / 2, ly = r.y + r.h - 26;
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(-player.roll); ctx.strokeStyle = ok ? '#35d07f' : '#ff3b30'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(-10, 0); ctx.moveTo(10, 0); ctx.lineTo(50, 0); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(lx - 60, ly); ctx.lineTo(lx - 54, ly); ctx.moveTo(lx + 54, ly); ctx.lineTo(lx + 60, ly); ctx.stroke();
    // focal / exposure readout inside the LCD, top-left and bottom-right like a real camera
    ctx.fillStyle = '#fff'; ctx.font = '600 13px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left'; ctx.shadowColor = '#000'; ctx.shadowBlur = 3;
    const h = player.mode === 'fly' ? player.alt : player.cameraHeight;
    ctx.fillText(`${this.cam.focal}mm  ${this.cam.aspectKey}  H ${h.toFixed(2)}m`, r.x + 10, r.y + 20);
    ctx.textAlign = 'right'; ctx.fillStyle = ok ? '#35d07f' : '#ff3b30'; ctx.fillText(`${rollDeg >= 0 ? '+' : ''}${rollDeg.toFixed(1)}°`, r.x + r.w - 10, r.y + 20);
    ctx.fillStyle = '#ff3b30'; ctx.textAlign = 'right'; ctx.fillText('● REC', r.x + r.w - 10, r.y + r.h - 12);
    // composition badges: A (pyramid ridge) and V (pool edges). Both lit = the shot the exercise asks for.
    this.badgePulse += 0.08;
    const bw = 44, bh = 26; const bx = r.x + 10 + bw * 2 + 6, by = r.y + r.h - bh - 34;
    const badge = (x: number, label: string, on: boolean) => {
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = on ? (this.badges.both ? `rgba(53,208,127,${0.75 + Math.sin(this.badgePulse) * 0.2})` : 'rgba(53,208,127,0.85)') : 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.roundRect(x - bw, by, bw, bh, 7); ctx.fill();
      ctx.strokeStyle = on ? '#35d07f' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = on ? '#0b1f14' : 'rgba(255,255,255,0.55)'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x - bw / 2, by + bh / 2 + 1);
      ctx.restore();
    };
    badge(bx, 'V', this.badges.v); badge(bx - bw - 6, 'A', this.badges.a);
    this.badges.eggs.forEach((id, i) => {
      ctx.save(); ctx.globalAlpha = a; const x = bx + 6 + (i + 1) * (bw + 6);
      ctx.fillStyle = `rgba(255,210,63,${0.75 + Math.sin(this.badgePulse * 1.5) * 0.2})`; ctx.beginPath(); ctx.roundRect(x - bw, by, bw, bh, 7); ctx.fill();
      ctx.fillStyle = '#2a2000'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(id, x - bw / 2, by + bh / 2 + 1); ctx.restore();
    });
    if (this.badges.both) { ctx.fillStyle = '#35d07f'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('V + A  chụp đi!', r.x + 10, by + bh + 18); }
    ctx.restore();
    this.readout.innerHTML = '';
  }
}
