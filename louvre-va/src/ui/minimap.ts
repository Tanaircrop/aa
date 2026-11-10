import { config, pools, smallPyramids, wings, vFovDeg } from '../data/config';
import { el, ui } from './dom';
import type { Player } from '../gameplay/player';

export class Minimap {
  canvas: HTMLCanvasElement; info: HTMLElement; visible = true;
  private scale = 1; // px per metre
  constructor() {
    this.canvas = el('canvas', { id: 'minimap' });
    this.info = el('div', { id: 'minimap-info' });
    ui().append(this.canvas, this.info);
  }
  toggle() { this.visible = !this.visible; this.canvas.classList.toggle('hidden', !this.visible); this.info.classList.toggle('hidden', !this.visible); }
  draw(player: Player, focal: number, aspect: number, cameraOn: boolean) {
    if (!this.visible) return;
    const c = this.canvas; const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w * 2) { c.width = w * 2; c.height = h * 2; }
    const ctx = c.getContext('2d')!; ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.scale = w / 260; const cx = w / 2 + 40 * this.scale, cy = h / 2; // centred slightly west of the pyramid
    const X = (x: number) => cx + x * this.scale, Y = (y: number) => cy - y * this.scale;
    // wings
    ctx.fillStyle = 'rgba(220,200,160,0.35)';
    for (const wg of wings) {
      if (wg.side === 'north') ctx.fillRect(X(wg.xFrom!), Y(wg.facadeY! + wg.depth), (wg.xTo! - wg.xFrom!) * this.scale, wg.depth * this.scale);
      else if (wg.side === 'south') ctx.fillRect(X(wg.xFrom!), Y(wg.facadeY!), (wg.xTo! - wg.xFrom!) * this.scale, wg.depth * this.scale);
      else ctx.fillRect(X(wg.facadeX!), Y(wg.yTo!), wg.depth * this.scale, (wg.yTo! - wg.yFrom!) * this.scale);
    }
    // pools
    ctx.fillStyle = 'rgba(80,150,200,0.6)'; ctx.strokeStyle = 'rgba(160,200,230,0.9)'; ctx.lineWidth = 1;
    for (const p of pools) { ctx.beginPath(); p.pts.forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])))); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    // pyramids
    ctx.strokeStyle = '#e8c07a'; ctx.lineWidth = 1.5; ctx.beginPath();
    (config.mainPyramid.corners as [number, number][]).forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])))); ctx.closePath(); ctx.stroke();
    for (const sp of smallPyramids) { ctx.save(); ctx.translate(X(sp.center[0]), Y(sp.center[1])); ctx.rotate(-(sp.rotationDeg * Math.PI) / 180); ctx.strokeRect((-sp.side / 2) * this.scale, (-sp.side / 2) * this.scale, sp.side * this.scale, sp.side * this.scale); ctx.restore(); }
    // Place du Carrousel roundabout
    const cr = config.carrousel; ctx.strokeStyle = 'rgba(200,200,200,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(X(cr.center[0]), Y(cr.center[1]), cr.ringOuter * this.scale, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(95,138,58,0.7)'; ctx.beginPath(); ctx.ellipse(X(cr.center[0]), Y(cr.center[1]), (cr.lawn[0] / 2) * this.scale, (cr.lawn[1] / 2) * this.scale, 0, 0, Math.PI * 2); ctx.fill();
    // statue + arc hint
    ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.arc(X(config.statueLouisXIV.pos[0]), Y(config.statueLouisXIV.pos[1]), 2, 0, Math.PI * 2); ctx.fill();
    // view cone
    const px = X(player.pos[0]), py = Y(player.pos[1]);
    const vf = (vFovDeg(focal) * Math.PI) / 180; const hf = cameraOn ? 2 * Math.atan(Math.tan(vf / 2) * aspect) : (75 * Math.PI) / 180;
    ctx.fillStyle = 'rgba(232,192,122,0.25)'; ctx.beginPath(); ctx.moveTo(px, py);
    ctx.arc(px, py, 60, -player.yaw - hf / 2, -player.yaw + hf / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(player.yaw) * 10, py - Math.sin(player.yaw) * 10); ctx.stroke();
    // north arrow (plan north = up)
    ctx.fillStyle = '#aaa'; ctx.font = '10px sans-serif'; ctx.fillText('N', 6, 12);
    this.info.textContent = `x ${player.pos[0].toFixed(0)} m, y ${player.pos[1].toFixed(0)} m · hướng ${player.compassDeg.toFixed(0)}° · cao ${player.alt.toFixed(1)} m`;
  }
}
