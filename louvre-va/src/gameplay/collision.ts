import type { Vec2 } from '../data/config';

export interface Circle { c: Vec2; r: number }
export interface Box3D { xMin: number; xMax: number; yMin: number; yMax: number; h: number; name?: string }
export interface PyramidVolume { corners: Vec2[]; center: Vec2; halfSize: number; rotRad: number; height: number }

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    const inter = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (inter) inside = !inside;
  }
  return inside;
}

function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const l2 = abx * abx + aby * aby || 1e-9;
  let t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / l2;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + abx * t, a[1] + aby * t];
}

/** Offset a convex polygon outward by d (works for CW or CCW). */
export function inflatePolygon(poly: Vec2[], d: number): Vec2[] {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sign = area > 0 ? 1 : -1;
  const lines: { p: Vec2; d: Vec2 }[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (dy / len) * sign, ny = (-dx / len) * sign; // outward normal
    lines.push({ p: [a[0] + nx * d, a[1] + ny * d], d: [dx, dy] });
  }
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i + n - 1) % n], l2 = lines[i];
    const det = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0];
    if (Math.abs(det) < 1e-9) { out.push(l2.p); continue; }
    const t = ((l2.p[0] - l1.p[0]) * l2.d[1] - (l2.p[1] - l1.p[1]) * l2.d[0]) / det;
    out.push([l1.p[0] + l1.d[0] * t, l1.p[1] + l1.d[1] * t]);
  }
  return out;
}

export class CollisionWorld {
  polygons: { poly: Vec2[]; name: string }[] = [];
  circles: Circle[] = [];
  boxes: Box3D[] = [];
  pyramids: PyramidVolume[] = [];
  walk = { xMin: -1e9, xMax: 1e9, yMin: -1e9, yMax: 1e9 };
  fly = { xMin: -1e9, xMax: 1e9, yMin: -1e9, yMax: 1e9, zMin: 0.3, zMax: 60 };
  /** Pool polygons, used to keep a flying camera out of the water. */
  pools: Vec2[][] = [];

  addPolygon(poly: Vec2[], name = '') { this.polygons.push({ poly, name }); }
  addCircle(c: Vec2, r: number) { this.circles.push({ c, r }); }
  addBox(b: Box3D) { this.boxes.push(b); }

  /** Push a circle at p out of every 2D obstacle. Returns the corrected position. */
  resolveWalk(p: Vec2, radius: number): Vec2 {
    let x = Math.max(this.walk.xMin, Math.min(this.walk.xMax, p[0]));
    let y = Math.max(this.walk.yMin, Math.min(this.walk.yMax, p[1]));
    for (let iter = 0; iter < 3; iter++) {
      for (const { poly } of this.polygons) {
        const inside = pointInPolygon([x, y], poly);
        let best: Vec2 | null = null; let bestD = Infinity;
        for (let i = 0; i < poly.length; i++) {
          const q = closestOnSegment([x, y], poly[i], poly[(i + 1) % poly.length]);
          const d = Math.hypot(q[0] - x, q[1] - y);
          if (d < bestD) { bestD = d; best = q; }
        }
        if (!best) continue;
        if (inside) {
          const nx = (best[0] - x) / (bestD || 1), ny = (best[1] - y) / (bestD || 1);
          x = best[0] + nx * radius; y = best[1] + ny * radius;
        } else if (bestD < radius) {
          const nx = (x - best[0]) / (bestD || 1), ny = (y - best[1]) / (bestD || 1);
          x = best[0] + nx * radius; y = best[1] + ny * radius;
        }
      }
      for (const c of this.circles) {
        const dx = x - c.c[0], dy = y - c.c[1];
        const d = Math.hypot(dx, dy);
        if (d < c.r + radius) { x = c.c[0] + (dx / (d || 1)) * (c.r + radius); y = c.c[1] + (dy / (d || 1)) * (c.r + radius); }
      }
      for (const b of this.boxes) {
        if (x > b.xMin - radius && x < b.xMax + radius && y > b.yMin - radius && y < b.yMax + radius) {
          const dl = x - (b.xMin - radius), dr = b.xMax + radius - x, db = y - (b.yMin - radius), dt = b.yMax + radius - y;
          const m = Math.min(dl, dr, db, dt);
          if (m === dl) x = b.xMin - radius; else if (m === dr) x = b.xMax + radius; else if (m === db) y = b.yMin - radius; else y = b.yMax + radius;
        }
      }
    }
    return [x, y];
  }

  /** Height of a square pyramid surface at a plan point (0 outside). */
  pyramidHeightAt(pv: PyramidVolume, p: Vec2): number {
    const dx = p[0] - pv.center[0], dy = p[1] - pv.center[1];
    const c = Math.cos(-pv.rotRad), s = Math.sin(-pv.rotRad);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    const m = Math.max(Math.abs(lx), Math.abs(ly));
    if (m > pv.halfSize) return 0;
    return pv.height * (1 - m / pv.halfSize);
  }

  /** Resolve a flying camera: [x, y, z] in plan coordinates (z up). */
  resolveFly(p: [number, number, number], radius: number): [number, number, number] {
    let [x, y, z] = p;
    x = Math.max(this.fly.xMin, Math.min(this.fly.xMax, x));
    y = Math.max(this.fly.yMin, Math.min(this.fly.yMax, y));
    z = Math.max(this.fly.zMin, Math.min(this.fly.zMax, z));
    for (const b of this.boxes) {
      if (x > b.xMin - radius && x < b.xMax + radius && y > b.yMin - radius && y < b.yMax + radius && z < b.h + radius) {
        const dl = x - (b.xMin - radius), dr = b.xMax + radius - x, db = y - (b.yMin - radius), dt = b.yMax + radius - y, dz = b.h + radius - z;
        const m = Math.min(dl, dr, db, dt, dz);
        if (m === dz) z = b.h + radius; else if (m === dl) x = b.xMin - radius; else if (m === dr) x = b.xMax + radius; else if (m === db) y = b.yMin - radius; else y = b.yMax + radius;
      }
    }
    for (const pv of this.pyramids) {
      const h = this.pyramidHeightAt(pv, [x, y]);
      if (h > 0 && z < h + radius) z = h + radius;
    }
    for (const c of this.circles) {
      const dx = x - c.c[0], dy = y - c.c[1];
      const d = Math.hypot(dx, dy);
      if (d < c.r + radius && z < 7) { x = c.c[0] + (dx / (d || 1)) * (c.r + radius); y = c.c[1] + (dy / (d || 1)) * (c.r + radius); }
    }
    for (const pool of this.pools) {
      if (z < 0.8 && pointInPolygon([x, y], pool)) z = 0.8;
    }
    return [x, y, z];
  }
}
