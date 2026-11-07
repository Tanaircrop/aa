import * as THREE from 'three';
import { config, vFovDeg, referencePhotos } from '../data/config';
import type { Engine } from '../core/engine';
import type { Player } from './player';
import type { PhotoMeta } from './gallery';

export type AspectKey = keyof typeof config.camera.aspects;

export class PhotoCamera {
  on = false;
  focal = config.camera.defaultFocal;
  aspectKey: AspectKey = config.camera.defaultAspect as AspectKey;
  grid = { thirds: true, diagonals: false, center: false };
  private captureCam = new THREE.PerspectiveCamera(50, 1.5, 0.1, 6000);

  constructor(private engine: Engine) { this.captureCam.rotation.order = 'YXZ'; }

  get aspect(): number { return config.camera.aspects[this.aspectKey]; }
  get vfov(): number { return vFovDeg(this.focal); }

  /** Frame rectangle (CSS px) inside the viewport for the current aspect. */
  frameRect(vw: number, vh: number): { x: number; y: number; w: number; h: number } {
    const margin = 0.9; let w = vw * margin, h = w / this.aspect;
    if (h > vh * margin) { h = vh * margin; w = h * this.aspect; }
    return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
  }

  /** Main camera fov such that the frame region shows exactly the chosen vertical fov. */
  applyToMainCamera(cam: THREE.PerspectiveCamera, vw: number, vh: number) {
    if (!this.on) { cam.fov = 70; cam.updateProjectionMatrix(); return; }
    const r = this.frameRect(vw, vh);
    const half = Math.tan((this.vfov * Math.PI) / 360) * (vh / r.h);
    cam.fov = (Math.atan(half) * 360) / Math.PI;
    cam.updateProjectionMatrix();
  }

  cycleFocal(dir: 1 | -1) {
    const f = config.camera.focals; const i = f.indexOf(this.focal);
    this.focal = f[(i + dir + f.length) % f.length];
  }

  /** Render the photo at full resolution and build its metadata. */
  capture(player: Player, group: string, presetId: string): { canvas: HTMLCanvasElement; meta: PhotoMeta } {
    const long = config.camera.photoLongEdge;
    const w = this.aspect >= 1 ? long : Math.round(long * this.aspect);
    const h = this.aspect >= 1 ? Math.round(long / this.aspect) : long;
    const cam = this.captureCam;
    cam.fov = this.vfov; cam.aspect = w / h;
    player.applyTo(cam);
    cam.updateProjectionMatrix();
    const canvas = this.engine.capture(cam, w, h);
    const nearWindow = config.windows.find((win) => Math.hypot(win.pos[0] - player.pos[0], win.pos[1] - player.pos[1]) < 4 && Math.abs(win.height - player.alt) < 3);
    const label = player.mode === 'fly' && !nearWindow ? `drone, độ cao ${player.alt.toFixed(1)} m` : nearWindow ? `chụp được ngoài đời (${nearWindow.name})` : 'chụp được ngoài đời';
    const meta: PhotoMeta = {
      group, pos: [Math.round(player.pos[0] * 10) / 10, Math.round(player.pos[1] * 10) / 10], altitude: Math.round(player.alt * 100) / 100,
      cameraHeight: Math.round((player.mode === 'fly' ? player.alt : player.cameraHeight) * 100) / 100,
      compassDeg: Math.round(player.compassDeg), pitchDeg: Math.round((player.pitch * 180) / Math.PI), focal: this.focal, aspect: this.aspectKey,
      mode: player.mode, label, preset: presetId, takenAt: new Date().toISOString(), width: w, height: h,
    };
    return { canvas, meta };
  }

  static referenceById(id: string) { return referencePhotos.find((r) => r.id === id); }
}

/** Short shutter click synthesised with WebAudio. */
let audio: AudioContext | null = null;
export function shutterSound() {
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const ctx = audio; const t = ctx.currentTime;
    const mk = (at: number, freq: number, dur: number, gain: number) => {
      const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(at + dur);
    };
    const noise = ctx.createBufferSource(); const buf = ctx.createBuffer(1, 2200, ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 400);
    noise.buffer = buf; const ng = ctx.createGain(); ng.gain.value = 0.35; noise.connect(ng); ng.connect(ctx.destination); noise.start(t);
    mk(t, 1800, 0.03, 0.08); mk(t + 0.07, 900, 0.05, 0.1);
  } catch { /* audio not available */ }
}
