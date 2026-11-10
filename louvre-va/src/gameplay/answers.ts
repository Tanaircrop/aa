import type { Pool, Vec2 } from '../data/config';

export type TipClass = 'standard' | 'debate' | 'rejected';

export interface PoolTip {
  pool: string;
  index: number;
  pos: Vec2;
  /** Interior angle at the tip, degrees (45 or 90 on this plan). */
  angleDeg: number;
  /** Direction (math angle, degrees, CCW from +x east) of the bisector pointing into the pool. */
  bisectorDeg: number;
  cls: TipClass;
  cornersInside: number;
  cornersTotal: number;
  reason: string;
}

function norm(a: number): number { let x = a % 360; if (x > 180) x -= 360; if (x <= -180) x += 360; return x; }
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Rule from the spec: the V is the two pool edges meeting at a tip, the A is the main pyramid.
 * Standing on the tip, looking along the bisector, the whole pyramid base must lie inside the V.
 */
export function classifyTips(
  pools: Pool[],
  pyramidCorners: Vec2[],
  opts: { coincidentTol?: number; angleTolDeg?: number } = {},
): PoolTip[] {
  const coincidentTol = opts.coincidentTol ?? 1.0;
  const tol = opts.angleTolDeg ?? 1.5;
  const out: PoolTip[] = [];
  for (const pool of pools) {
    const n = pool.pts.length;
    for (let i = 0; i < n; i++) {
      const p = pool.pts[i];
      const a = pool.pts[(i + 1) % n];
      const b = pool.pts[(i + n - 1) % n];
      const da = deg(Math.atan2(a[1] - p[1], a[0] - p[0]));
      const db = deg(Math.atan2(b[1] - p[1], b[0] - p[0]));
      const diff = norm(db - da);
      const angle = Math.abs(diff);
      const bis = norm(da + diff / 2);
      const half = angle / 2;
      let inside = 0, total = 0, coincident = 0;
      for (const c of pyramidCorners) {
        const dx = c[0] - p[0], dy = c[1] - p[1];
        if (Math.hypot(dx, dy) < coincidentTol) { coincident++; continue; }
        total++;
        const rel = Math.abs(norm(deg(Math.atan2(dy, dx)) - bis));
        if (rel <= half + tol) inside++;
      }
      let cls: TipClass;
      let reason: string;
      if (coincident === 0 && inside === total) {
        cls = 'standard';
        reason = 'Cả đáy kim tự tháp nằm trọn trong lòng V';
      } else if (coincident > 0) {
        cls = 'rejected';
        reason = 'Mũi hồ chạm góc đáy kim tự tháp: kim tự tháp thành một cạnh của V';
      } else if (inside >= 2) {
        cls = 'debate';
        reason = 'Kim tự tháp chỉ nằm một nửa trong lòng V (góc kim tự tháp nằm trên một cạnh V)';
      } else {
        cls = 'rejected';
        reason = inside === 0 && angle < 60
          ? 'V mở sang ngang hoặc ra ngoài, không chứa kim tự tháp'
          : 'Kim tự tháp ở sau lưng hoặc ngoài lòng V';
      }
      out.push({ pool: pool.id, index: i, pos: p, angleDeg: Math.round(angle), bisectorDeg: bis, cls, cornersInside: inside, cornersTotal: total, reason });
    }
  }
  return out;
}

export function summarize(tips: PoolTip[]) {
  return {
    standard: tips.filter((t) => t.cls === 'standard'),
    debate: tips.filter((t) => t.cls === 'debate'),
    rejected: tips.filter((t) => t.cls === 'rejected'),
  };
}

/** Order standard tips as in the spec table: N, E, S inner, then NE, SE corners. */
export function orderStandard(tips: PoolTip[]): PoolTip[] {
  const order = ['N_inner', 'E_inner', 'S_inner', 'NE_corner', 'SE_corner'];
  return [...tips].sort((a, b) => order.indexOf(a.pool) - order.indexOf(b.pool));
}

/** A camera pose standing just behind a tip, looking along its bisector. */
export function poseForTip(tip: PoolTip, standBack = 1.2): { pos: Vec2; headingDeg: number } {
  const r = (tip.bisectorDeg * Math.PI) / 180;
  const pos: Vec2 = [tip.pos[0] - Math.cos(r) * standBack, tip.pos[1] - Math.sin(r) * standBack];
  return { pos, headingDeg: tip.bisectorDeg };
}
