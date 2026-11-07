import { config } from '../data/config';

export type SessionPhase = 'intro' | 'preview' | 'playing' | 'grace' | 'ended';

export interface TeacherSettings { durationMinutes: number; crowd: boolean; flyEnabled: boolean; preset: string; overlay: boolean }

const KEY = 'lva.teacher';
export function loadTeacherSettings(): TeacherSettings {
  const def: TeacherSettings = { durationMinutes: config.session.durationMinutes, crowd: true, flyEnabled: true, preset: config.lighting.default, overlay: false };
  try { return { ...def, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return def; }
}
export function saveTeacherSettings(s: TeacherSettings) { localStorage.setItem(KEY, JSON.stringify(s)); }

export class Session {
  phase: SessionPhase = 'intro';
  group = '';
  durationSec: number;
  remaining = 0;
  graceRemaining = 0;
  private fired = new Set<number>();
  onReminder: ((msg: string) => void) | null = null;
  onPhase: ((p: SessionPhase) => void) | null = null;
  photosTaken = 0;
  photosAnnotated = 0;

  constructor(durationMinutes: number) { this.durationSec = durationMinutes * 60; }

  start(group: string) {
    this.group = group; this.phase = 'playing'; this.remaining = this.durationSec; this.fired.clear();
    this.onPhase?.(this.phase);
  }

  get captureLocked(): boolean { return this.phase === 'grace' || this.phase === 'ended'; }

  update(dt: number) {
    if (this.phase === 'playing') {
      this.remaining = Math.max(0, this.remaining - dt);
      const elapsedMin = (this.durationSec - this.remaining) / 60;
      // reminders scale with duration: 60% ("switch to drawing") and 80% ("prepare to present")
      const marks = config.session.reminders.map((m) => (m / config.session.durationMinutes) * (this.durationSec / 60));
      marks.forEach((m, i) => { if (elapsedMin >= m && !this.fired.has(i)) { this.fired.add(i); this.onReminder?.(i === 0 ? 'Chuyển sang vẽ A, V lên ảnh' : 'Chuẩn bị trình bày: xuất trang tổng hợp'); } });
      if (this.remaining <= 0) { this.phase = 'grace'; this.graceRemaining = config.session.exportGraceSeconds; this.onPhase?.(this.phase); this.onReminder?.('Hết giờ. Khoá chụp. Còn 1 phút để xuất bài.'); }
    } else if (this.phase === 'grace') {
      this.graceRemaining = Math.max(0, this.graceRemaining - dt);
      if (this.graceRemaining <= 0) { this.phase = 'ended'; this.onPhase?.(this.phase); }
    }
  }

  format(sec: number): string { const m = Math.floor(sec / 60); const s = Math.floor(sec % 60); return `${m}:${s.toString().padStart(2, '0')}`; }
}
