import type { Composition } from './composition';
import type { PoolTip } from './answers';

export interface ShotScore { points: number; stars: 1 | 2 | 3; reasons: string[]; discovered: boolean }

/** Per-group progress: discovered standard V+A corners and total points. Stored in the browser. */
export class Progress {
  discovered = new Set<string>();
  points = 0;
  constructor(private group: string) { this.load(); }
  private key() { return `lva.progress.${this.group}`; }
  private load() { try { const d = JSON.parse(localStorage.getItem(this.key()) || '{}'); this.points = d.points || 0; this.discovered = new Set(d.discovered || []); } catch { /* fresh */ } }
  private save() { localStorage.setItem(this.key(), JSON.stringify({ points: this.points, discovered: [...this.discovered] })); }

  static tipKey(t: PoolTip) { return `${t.pool}:${t.index}`; }

  /** Score a shot. Standard tips give a discovery bonus the first time. */
  scoreShot(c: Composition, standardTotal: number): ShotScore {
    let points = 10; const reasons: string[] = ['Chụp +10'];
    if (c.hasA) { points += 20; reasons.push('Có chữ A +20'); }
    if (c.hasV) { points += 20; reasons.push('Có chữ V +20'); }
    if (c.level) { points += 5; reasons.push('Cân bằng +5'); }
    if (c.apexUpper) { points += 5; reasons.push('Đỉnh ở 1/3 trên +5'); }
    let discovered = false;
    if (c.hasA && c.hasV && c.tip) {
      if (c.tip.cls === 'standard') {
        points += 30; reasons.push('V + A chuẩn +30');
        const k = Progress.tipKey(c.tip);
        if (!this.discovered.has(k)) { this.discovered.add(k); points += 50; discovered = true; reasons.push(`Khám phá góc mới +50 (${this.discovered.size}/${standardTotal})`); }
      } else if (c.tip.cls === 'debate') { points += 15; reasons.push('Góc tranh luận +15'); }
    }
    this.points += points; this.save();
    const stars: 1 | 2 | 3 = points >= 80 ? 3 : points >= 45 ? 2 : 1;
    return { points, stars, reasons, discovered };
  }
  addAnnotationBonus() { this.points += 15; this.save(); }
}
