import { config, pools, vFovDeg, type Vec2 } from '../data/config';
import { classifyTips, orderStandard, type PoolTip } from './answers';
import type { PhotoMeta, Stroke } from './gallery';

/**
 * Automatic grading for the teacher dashboard.
 * 1. Re-projects the scene (pyramid ridges, pool edges of the tip the student stood on) into the photo
 *    from the pose stored in the photo metadata, with the same camera model as the game.
 * 2. Compares the student's straight-line annotations (A solid, V dashed, subject dot) with those
 *    expected lines: angle error and offset in units of frame height.
 * 3. Rolls photos up per group: eligibility, distinct standard corners, award suggestions and tie-breaks,
 *    following design/dap-an-va-the-le.md.
 * Pure functions, no DOM, no three.js: unit-tested in tests/grading.test.ts.
 */

export type Status = 'đúng' | 'gần đúng' | 'lệch' | 'thiếu';
export type UV = [number, number];

export const allTips: PoolTip[] = classifyTips(pools, config.mainPyramid.corners as Vec2[], { coincidentTol: config.answers.coincidentCornerTolerance, angleTolDeg: config.answers.angleToleranceDeg });
const standardOrdered = orderStandard(allTips.filter((t) => t.cls === 'standard'));
const debateOrdered = allTips.filter((t) => t.cls === 'debate').sort((a, b) => b.pos[1] - a.pos[1]); // T1 north-west first

/** "Góc 1".."Góc 5", "T1", "T2" or null for a rejected tip. */
export function labelOf(tip: PoolTip | null): string | null {
  if (!tip) return null;
  const i = standardOrdered.indexOf(tip); if (i >= 0) return `Góc ${i + 1}`;
  const j = debateOrdered.indexOf(tip); if (j >= 0) return `T${j + 1}`;
  return null;
}

/** Same rule as the live viewfinder: nearest tip within 7 m, weighted by heading mismatch with its bisector. */
export function pickTip(pos: Vec2, headingDeg: number): PoolTip | null {
  let best: PoolTip | null = null; let bestScore = Infinity;
  for (const t of allTips) {
    const d = Math.hypot(pos[0] - t.pos[0], pos[1] - t.pos[1]); if (d > 7) continue;
    const diff = Math.abs((((headingDeg - t.bisectorDeg) % 360) + 540) % 360 - 180);
    const score = d + diff / 12;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best;
}

export interface Cam { pos: Vec2; alt: number; yawDeg: number; pitchDeg: number; vfovDeg: number; aspect: number }

export function camFromMeta(m: PhotoMeta): Cam {
  return { pos: m.pos, alt: m.cameraHeight, yawDeg: 90 - m.compassDeg, pitchDeg: m.pitchDeg, vfovDeg: vFovDeg(m.focal), aspect: m.width / m.height };
}

/** Project a plan-space point (x east, y north, z up) to normalised image coords. depth > 0 means in front of the camera. */
export function project(c: Cam, p: [number, number, number]): { uv: UV; depth: number } {
  const yaw = (c.yawDeg * Math.PI) / 180, pitch = (c.pitchDeg * Math.PI) / 180;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // camera basis in (east, north, up)
  const fwd = [cp * Math.cos(yaw), cp * Math.sin(yaw), sp];
  const right = [Math.sin(yaw), -Math.cos(yaw), 0];
  const up = [-sp * Math.cos(yaw), -sp * Math.sin(yaw), cp];
  const d = [p[0] - c.pos[0], p[1] - c.pos[1], p[2] - c.alt];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = dot(d, fwd), x = dot(d, right), y = dot(d, up);
  const tv = Math.tan((c.vfovDeg * Math.PI) / 360), th = tv * c.aspect;
  const zz = Math.abs(z) < 1e-6 ? 1e-6 : z;
  return { uv: [0.5 + x / zz / (2 * th), 0.5 - y / zz / (2 * tv)], depth: z };
}

export interface Expected {
  ridges: [UV, UV][];       // apex -> visible base corners
  apex: UV | null;
  tip: PoolTip | null;
  tipUV: UV | null;         // null when the tip is under or behind the camera
  edges: [UV, UV][];        // tip -> far ends of the two pool edges (tip end may be off frame)
  bisector: [UV, UV] | null;
}

const inExt = (uv: UV, s = 0.3) => uv[0] > -s && uv[0] < 1 + s && uv[1] > -s && uv[1] < 1 + s;

export function expectedLines(m: PhotoMeta): Expected {
  const c = camFromMeta(m);
  const [cx, cy] = centroid(config.mainPyramid.corners as Vec2[]);
  const apexP = project(c, [cx, cy, config.mainPyramid.height]);
  const apex = apexP.depth > 0.5 ? apexP.uv : null;
  const ridges: [UV, UV][] = [];
  if (apex) for (const k of config.mainPyramid.corners as Vec2[]) {
    const q = project(c, [k[0], k[1], 0]);
    if (q.depth > 0.5 && (inExt(q.uv) || inExt(apex))) ridges.push([apex, q.uv]);
  }
  const tip = pickTip(m.pos, c.yawDeg);
  const out: Expected = { ridges, apex, tip, tipUV: null, edges: [], bisector: null };
  if (tip) {
    const pool = pools.find((p) => p.id === tip.pool)!; const n = pool.pts.length;
    const a = pool.pts[(tip.index + 1) % n], b = pool.pts[(tip.index + n - 1) % n];
    const t = project(c, [tip.pos[0], tip.pos[1], config.poolRimHeight]);
    const fa = project(c, [a[0], a[1], config.poolRimHeight]), fb = project(c, [b[0], b[1], config.poolRimHeight]);
    // when the tip is under the camera, extend the edge line from the far end through a point 1 m along the edge
    const near = (far: Vec2): UV => { const dx = tip.pos[0] - far[0], dy = tip.pos[1] - far[1]; const L = Math.hypot(dx, dy); const s = Math.max(0, L - 1.0) / L; return project(c, [far[0] + dx * s, far[1] + dy * s, config.poolRimHeight]).uv; };
    out.tipUV = t.depth > 0.5 ? t.uv : null;
    if (fa.depth > 0.5) out.edges.push([out.tipUV ?? near(a), fa.uv]);
    if (fb.depth > 0.5) out.edges.push([out.tipUV ?? near(b), fb.uv]);
    const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const fm = project(c, [mid[0], mid[1], config.poolRimHeight]);
    if (fm.depth > 0.5) out.bisector = [out.tipUV ?? near(mid), fm.uv];
  }
  return out;
}

function centroid(pts: Vec2[]): Vec2 { return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]; }

// --- stroke geometry, in units of frame height (x scaled by aspect)
const H = (uv: UV, aspect: number): UV => [uv[0] * aspect, uv[1]];
const ends = (s: Stroke): [UV, UV] => [s.pts[0], s.pts[s.pts.length - 1]];
function angleDeg(a: UV, b: UV): number { return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI; }
function angleDiff(a: number, b: number): number { let d = Math.abs(a - b) % 180; if (d > 90) d = 180 - d; return d; }
function distToLine(p: UV, a: UV, b: UV): number { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9; return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L; }
function intersect(a: UV, b: UV, c: UV, d: UV): UV | null {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]); if (Math.abs(den) < 1e-9) return null;
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

export interface LineCheck { status: Status; angleErr: number; offset: number; target: number }

/** Compare one student segment against candidate expected segments (all in normalised uv). */
export function checkLine(stroke: Stroke, targets: [UV, UV][], aspect: number): LineCheck {
  if (!targets.length) return { status: 'lệch', angleErr: 90, offset: 1, target: -1 };
  const [p, q] = ends(stroke).map((e) => H(e, aspect)) as [UV, UV];
  let best: LineCheck = { status: 'lệch', angleErr: 90, offset: 1, target: -1 };
  targets.forEach((t, i) => {
    const [a, b] = t.map((e) => H(e, aspect)) as [UV, UV];
    const angleErr = angleDiff(angleDeg(p, q), angleDeg(a, b));
    const offset = (distToLine(p, a, b) + distToLine(q, a, b)) / 2;
    const score = angleErr / 10 + offset * 20;
    if (score < best.angleErr / 10 + best.offset * 20) best = { status: 'lệch', angleErr, offset, target: i };
  });
  best.status = best.angleErr < 7 && best.offset < 0.035 ? 'đúng' : best.angleErr < 14 && best.offset < 0.07 ? 'gần đúng' : 'lệch';
  return best;
}

export interface PhotoGrade {
  id: string;
  label: string | null;          // Góc 1..5, T1, T2 or null
  cls: PoolTip['cls'] | null;
  hasA: boolean; hasV: boolean; va: boolean; standardVA: boolean;
  mode: string; stars: number; points: number;
  expected: Expected;
  strokes: Stroke[];
  a: LineCheck & { count: number };
  v: { count: number; checks: LineCheck[]; converge: Status; status: Status };
  dot: { count: number; status: Status; offset: number };
  note: { status: Status; text: string };
  complete: boolean;
  verdict: string[];
}

const NOTE_WORDS = ['dẫn', 'mắt', 'hướng', 'nhìn', 'vào', 'tới', 'đến', 'tập trung', 'điểm', 'đỉnh'];

export function gradePhoto(p: { id: string; meta: PhotoMeta; strokes: Stroke[]; note: string }): PhotoGrade {
  const m = p.meta; const aspect = m.width / m.height;
  const exp = expectedLines(m);
  const tip = exp.tip; const label = labelOf(tip);
  const hasA = !!m.hasA, hasV = !!m.hasV; const va = hasA && hasV; const standardVA = va && tip?.cls === 'standard';
  const strokes = p.strokes || [];
  const As = strokes.filter((s) => s.tool === 'A' && s.pts.length >= 2);
  const Vs = strokes.filter((s) => s.tool === 'V' && s.pts.length >= 2);
  const dots = strokes.filter((s) => s.tool === 'dot' && s.pts.length);
  const verdict: string[] = [];

  // A: best of the student's A strokes against the visible ridges
  let a: LineCheck & { count: number } = { status: 'thiếu', angleErr: 90, offset: 1, target: -1, count: As.length };
  for (const s of As) { const c = checkLine(s, exp.ridges, aspect); if (a.status === 'thiếu' || c.angleErr / 10 + c.offset * 20 < a.angleErr / 10 + a.offset * 20) a = { ...c, count: As.length }; }
  if (!exp.ridges.length && As.length) a.status = 'lệch';
  verdict.push(a.status === 'thiếu' ? 'Chưa vẽ nét A' : a.status === 'đúng' ? `Nét A bám đúng sống kim tự tháp (lệch ${a.angleErr.toFixed(0)}°)` : a.status === 'gần đúng' ? `Nét A gần sống kim tự tháp (lệch ${a.angleErr.toFixed(0)}°, cách ${(a.offset * 100).toFixed(0)}% khung)` : 'Nét A không trùng sống kim tự tháp');

  // V: each dashed stroke against the two pool edges; two strokes should hit two different edges and converge at the tip
  const checks = Vs.map((s) => checkLine(s, exp.edges, aspect));
  const distinctEdges = new Set(checks.filter((c) => c.status !== 'lệch').map((c) => c.target)).size;
  let converge: Status = 'thiếu';
  if (Vs.length >= 2) {
    const [s1, s2] = [Vs[0], Vs[1]].map((s) => ends(s).map((e) => H(e, aspect)) as [UV, UV]);
    const x = intersect(s1[0], s1[1], s2[0], s2[1]);
    if (!x) converge = 'lệch';
    else if (exp.tipUV) { const d = Math.hypot(x[0] - exp.tipUV[0] * aspect, x[1] - exp.tipUV[1]); converge = d < 0.08 ? 'đúng' : d < 0.16 ? 'gần đúng' : 'lệch'; }
    else converge = x[1] > 0.55 ? 'đúng' : 'lệch'; // tip under the camera: the lines must meet below the middle of the frame
  }
  const vStatus: Status = !Vs.length ? 'thiếu' : distinctEdges >= 2 && checks.every((c) => c.status === 'đúng') && converge !== 'lệch' ? 'đúng' : distinctEdges >= 2 && converge !== 'lệch' ? 'gần đúng' : 'lệch';
  verdict.push(!Vs.length ? 'Chưa vẽ nét V' : Vs.length < 2 ? 'Chỉ có một nét V, cần hai bờ hồ' : vStatus === 'đúng' ? 'Hai nét V bám đúng hai bờ hồ và chụm về mũi hồ' : vStatus === 'gần đúng' ? 'Hai nét V theo hai bờ hồ, còn lệch nhẹ' : distinctEdges < 2 ? 'Hai nét V không bám hai bờ hồ khác nhau' : 'Hai nét V không chụm về mũi hồ');

  // dot: inside the V wedge and close to the bisector
  let dot = { count: dots.length, status: 'thiếu' as Status, offset: 1 };
  if (dots.length) {
    const d = H(dots[dots.length - 1].pts[0], aspect);
    if (exp.bisector && exp.edges.length === 2) {
      const [b0, b1] = exp.bisector.map((e) => H(e, aspect)) as [UV, UV];
      const off = distToLine(d, b0, b1);
      const e0 = exp.edges[0].map((e) => H(e, aspect)) as [UV, UV], e1 = exp.edges[1].map((e) => H(e, aspect)) as [UV, UV];
      const side = (pt: UV, l: [UV, UV]) => Math.sign((l[1][0] - l[0][0]) * (pt[1] - l[0][1]) - (l[1][1] - l[0][1]) * (pt[0] - l[0][0]));
      const inside = side(d, e0) === side(b1, e0) && side(d, e1) === side(b1, e1);
      dot = { count: dots.length, offset: off, status: inside && off < 0.08 ? 'đúng' : inside ? 'gần đúng' : 'lệch' };
    } else dot = { count: dots.length, offset: 0, status: 'gần đúng' };
  }
  verdict.push(dot.status === 'thiếu' ? 'Chưa đặt chấm chủ thể' : dot.status === 'đúng' ? 'Chấm chủ thể nằm trên trục dẫn mắt của V' : dot.status === 'gần đúng' ? 'Chấm chủ thể trong lòng V nhưng lệch trục' : 'Chấm chủ thể nằm ngoài lòng V');

  // note
  const text = (p.note || '').trim();
  const noteStatus: Status = !text ? 'thiếu' : text.length >= 12 && NOTE_WORDS.some((w) => text.toLowerCase().includes(w)) ? 'đúng' : 'gần đúng';
  verdict.push(noteStatus === 'thiếu' ? 'Chưa ghi câu giải thích' : noteStatus === 'đúng' ? 'Có câu giải thích đỉnh V dẫn mắt' : 'Ghi chú quá ngắn hoặc chưa nói V dẫn mắt vào đâu');

  const ok = (s: Status) => s === 'đúng' || s === 'gần đúng';
  const complete = ok(a.status) && ok(vStatus) && dot.status !== 'thiếu' && noteStatus !== 'thiếu';
  return { id: p.id, label, cls: tip?.cls ?? null, hasA, hasV, va, standardVA, mode: m.mode, stars: m.stars ?? 1, points: m.points ?? 0, expected: exp, strokes, a, v: { count: Vs.length, checks, converge, status: vStatus }, dot, note: { status: noteStatus, text }, complete, verdict };
}

export interface GroupInput {
  device_id: string; group_name: string;
  photos: { id: string; meta: PhotoMeta; strokes: Stroke[]; note: string; created_at?: string }[];
  points: number; discovered: number; eggs: string[]; hint_used: boolean; answer: number | null; answer_correct: boolean | null; finished_at: string | null;
}

export interface GroupGrade {
  device_id: string; group: string;
  photos: PhotoGrade[];
  vaPhotos: number; standardVA: number; corners: string[]; completeVA: PhotoGrade[]; cornersComplete: string[];
  threeStars: number; dronePhotos: PhotoGrade[]; debatePhotos: PhotoGrade[];
  points: number; eggs: string[]; hint: boolean; answer: number | null; answerCorrect: boolean; finished: string | null;
  eligible: boolean; missing: string[];
}

export function gradeGroup(g: GroupInput): GroupGrade {
  const photos = g.photos.map(gradePhoto);
  const va = photos.filter((p) => p.va);
  const std = photos.filter((p) => p.standardVA);
  const corners = [...new Set(std.map((p) => p.label!))];
  const completeVA = std.filter((p) => p.complete);
  const cornersComplete = [...new Set(completeVA.map((p) => p.label!))];
  const missing: string[] = [];
  if (std.length < 2) missing.push(`mới ${std.length}/2 ảnh V+A ở góc chuẩn`);
  else if (corners.length < 2) missing.push('2 ảnh V+A nhưng cùng một góc');
  if (std.length >= 2 && completeVA.length < 2) missing.push(`mới ${completeVA.length}/2 ảnh V+A vẽ đủ A, V, chấm và ghi chú`);
  else if (completeVA.length >= 2 && cornersComplete.length < 2) missing.push('ảnh vẽ đủ chưa ở 2 góc khác nhau');
  return {
    device_id: g.device_id, group: g.group_name || g.device_id.slice(0, 6), photos,
    vaPhotos: va.length, standardVA: std.length, corners, completeVA, cornersComplete,
    threeStars: photos.filter((p) => p.stars >= 3).length,
    dronePhotos: va.filter((p) => p.mode === 'fly'), debatePhotos: photos.filter((p) => p.va && p.cls === 'debate'),
    points: g.points, eggs: g.eggs || [], hint: !!g.hint_used, answer: g.answer, answerCorrect: !!g.answer_correct, finished: g.finished_at,
    eligible: missing.length === 0, missing,
  };
}

/** Tie-break from the rules: no hint first, then more 3-star photos, then earlier finish. */
export function tieBreak(a: GroupGrade, b: GroupGrade): number {
  if (a.hint !== b.hint) return a.hint ? 1 : -1;
  if (a.threeStars !== b.threeStars) return b.threeStars - a.threeStars;
  const ta = a.finished ? Date.parse(a.finished) : Infinity, tb = b.finished ? Date.parse(b.finished) : Infinity;
  return ta - tb;
}

export interface Awards {
  first: GroupGrade | null; second: GroupGrade | null;
  eyes: GroupGrade[]; storyteller: { group: GroupGrade; photo: PhotoGrade }[]; debate: GroupGrade[]; drone: { group: GroupGrade; photo: PhotoGrade }[];
  ranking: GroupGrade[];
}

export function awards(groups: GroupGrade[]): Awards {
  const ranking = [...groups].sort((a, b) => (a.eligible !== b.eligible ? (a.eligible ? -1 : 1) : b.points - a.points || tieBreak(a, b)));
  const eligible = ranking.filter((g) => g.eligible);
  const first = eligible[0] ?? null;
  const second = eligible.filter((g) => g !== first && !g.hint).sort((a, b) => b.cornersComplete.length - a.cornersComplete.length || tieBreak(a, b))[0] ?? null;
  const eyes = groups.filter((g) => g.eggs.includes('X') && g.eggs.includes('C'));
  const storyteller = groups.flatMap((g) => g.completeVA.filter((p) => p.note.status === 'đúng').map((p) => ({ group: g, photo: p }))).sort((a, b) => b.photo.note.text.length - a.photo.note.text.length).slice(0, 8);
  const debate = groups.filter((g) => g.debatePhotos.some((p) => p.complete));
  const drone = groups.flatMap((g) => g.dronePhotos.map((p) => ({ group: g, photo: p })));
  return { first, second, eyes, storyteller, debate, drone, ranking };
}

export function toCSV(groups: GroupGrade[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Nhóm', 'Thiết bị', 'Điểm', 'Ảnh', 'Ảnh V+A', 'V+A góc chuẩn', 'Góc', 'Ảnh vẽ đủ', 'Góc vẽ đủ', 'Ảnh 3 sao', 'Egg', 'Gợi ý', 'Câu hỏi', 'Đủ điều kiện', 'Còn thiếu', 'Nộp lúc'];
  const rows = groups.map((g) => [g.group, g.device_id, g.points, g.photos.length, g.vaPhotos, g.standardVA, g.corners.join(' '), g.completeVA.length, g.cornersComplete.join(' '), g.threeStars, g.eggs.join(' '), g.hint ? 'có' : 'không', g.answer == null ? '' : `${g.answer}${g.answerCorrect ? ' đúng' : ' sai'}`, g.eligible ? 'có' : 'không', g.missing.join('; '), g.finished ?? ''].map(esc).join(','));
  return [head.map(esc).join(','), ...rows].join('\n');
}
