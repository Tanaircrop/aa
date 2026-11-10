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
  a: LineCheck & { count: number; matched: number };
  v: { count: number; checks: LineCheck[]; matched: number; status: Status };
  dot: { count: number; status: Status; offset: number };
  note: { status: Status; text: string };
  /** A and V traced on the real ridges and banks. The subject dot and the sentence are not required for this. */
  drawnOk: boolean;
  /** drawnOk plus the subject dot and one explanatory sentence, as the brief asks. */
  complete: boolean;
  verdict: string[];
}

const NOTE_WORDS = ['dẫn', 'mắt', 'hướng', 'nhìn', 'vào', 'tới', 'đến', 'tập trung', 'điểm', 'đỉnh'];
const ok = (s: Status) => s === 'đúng' || s === 'gần đúng';
const rank = (s: Status) => (s === 'đúng' ? 0 : s === 'gần đúng' ? 1 : s === 'lệch' ? 2 : 3);
const worst = (a: Status, b: Status): Status => (rank(a) >= rank(b) ? a : b);
const lineScore = (c: LineCheck) => c.angleErr / 10 + c.offset * 20;

/** One-to-one greedy matching of the student's strokes to expected segments, best fit first. Stray strokes are ignored. */
function assign(strokes: Stroke[], targets: [UV, UV][], aspect: number, max: number): { si: number; ti: number; check: LineCheck }[] {
  const pairs: { si: number; ti: number; check: LineCheck; sc: number }[] = [];
  strokes.forEach((s, si) => targets.forEach((t, ti) => { const c = checkLine(s, [t], aspect); pairs.push({ si, ti, check: { ...c, target: ti }, sc: lineScore(c) }); }));
  pairs.sort((a, b) => a.sc - b.sc);
  const us = new Set<number>(), ut = new Set<number>(); const out: { si: number; ti: number; check: LineCheck }[] = [];
  for (const q of pairs) { if (us.has(q.si) || ut.has(q.ti)) continue; us.add(q.si); ut.add(q.ti); out.push(q); if (out.length >= max) break; }
  return out;
}

/** Status from the best matched lines: both lines good -> the worse of the two; only one good line -> "gần đúng" at best. */
function lineStatus(pairs: { check: LineCheck }[]): { status: Status; matched: number } {
  const good = pairs.filter((q) => ok(q.check.status));
  if (good.length >= 2) return { status: worst(good[0].check.status, good[1].check.status), matched: 2 };
  if (good.length === 1) return { status: 'gần đúng', matched: 1 };
  return { status: 'lệch', matched: 0 };
}

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
  const maxErr = (pairs: { check: LineCheck }[]) => Math.max(0, ...pairs.filter((q) => ok(q.check.status)).map((q) => q.check.angleErr));

  // A: two strokes on two different ridges
  const aPairs = assign(As, exp.ridges, aspect, 2);
  const aRes = As.length && exp.ridges.length ? lineStatus(aPairs) : { status: (As.length ? 'lệch' : 'thiếu') as Status, matched: 0 };
  const a: PhotoGrade['a'] = { status: aRes.status, angleErr: aPairs[0]?.check.angleErr ?? 90, offset: aPairs[0]?.check.offset ?? 1, target: aPairs[0]?.ti ?? -1, count: As.length, matched: aRes.matched };
  verdict.push(a.status === 'thiếu' ? 'Chưa vẽ nét A'
    : a.matched === 2 ? `Hai nét A ${a.status === 'đúng' ? 'bám đúng' : 'gần'} hai sống kim tự tháp (lệch tối đa ${maxErr(aPairs).toFixed(0)}°)`
    : a.matched === 1 ? 'Một nét A bám sống kim tự tháp, nét còn lại lệch hoặc chưa vẽ'
    : 'Nét A không trùng sống kim tự tháp');

  // V: two strokes on the two pool banks that meet at the tip
  const vPairs = assign(Vs, exp.edges, aspect, 2);
  const vRes = Vs.length && exp.edges.length ? lineStatus(vPairs) : { status: (Vs.length ? 'lệch' : 'thiếu') as Status, matched: 0 };
  verdict.push(!Vs.length ? 'Chưa vẽ nét V'
    : !exp.tip ? 'Ảnh chụp xa mũi hồ, chưa có chữ V để so nét'
    : vRes.matched === 2 ? `Hai nét V ${vRes.status === 'đúng' ? 'bám đúng' : 'gần'} hai bờ hồ (lệch tối đa ${maxErr(vPairs).toFixed(0)}°)`
    : vRes.matched === 1 ? 'Một nét V bám bờ hồ, nét còn lại lệch hoặc chưa vẽ'
    : 'Nét V không bám hai bờ hồ');

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

  const drawnOk = ok(a.status) && ok(vRes.status);
  const complete = drawnOk && dot.status !== 'thiếu' && noteStatus !== 'thiếu';
  return { id: p.id, label, cls: tip?.cls ?? null, hasA, hasV, va, standardVA, mode: m.mode, stars: m.stars ?? 1, points: m.points ?? 0, expected: exp, strokes, a, v: { count: Vs.length, checks: vPairs.map((q) => q.check), matched: vRes.matched, status: vRes.status }, dot, note: { status: noteStatus, text }, drawnOk, complete, verdict };
}

// ---- groups: merge devices, re-score without the spam-able in-game counter

/** "Nhóm 10", "nhóm 10", "10", "Nhom 10" -> "10". Default or empty names ("Nhóm", "nhóm?") -> null (cannot be attributed). */
export function groupKey(raw: string): string | null {
  const s = (raw || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^nhom/, '');
  return s.length ? s : null;
}

export interface GroupInput {
  device_id: string; group_name: string;
  photos: { id: string; meta: PhotoMeta; strokes: Stroke[]; note: string; created_at?: string }[];
  points: number; discovered: number; eggs: string[]; hint_used: boolean; answer: number | null; answer_correct: boolean | null; finished_at: string | null;
  /** true when the device sent a final result (hint_used is only known then) */
  hint_known?: boolean;
  /** how many physical devices were merged into this input */
  devices?: number;
  ids?: string[];
}

/** Merge several devices of one group. Unnamed devices stay separate unless the teacher assigned them a name (alias). */
export function mergeDevices(inputs: GroupInput[], alias: Record<string, string> = {}): GroupInput[] {
  const by = new Map<string, GroupInput[]>();
  for (const g of inputs) {
    const named = alias[g.device_id]?.trim() || g.group_name;
    const k = groupKey(named);
    const key = k ? `g:${k}` : `d:${g.device_id}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key)!.push({ ...g, group_name: named });
  }
  return [...by.entries()].map(([key, list]) => {
    const k = key.startsWith('g:') ? key.slice(2) : null;
    const name = k && /^\d+$/.test(k) ? `Nhóm ${k}` : list[0].group_name || `Chưa đặt tên · ${list[0].device_id.slice(2, 8)}`;
    const answered = list.filter((g) => g.answer != null);
    const pick = answered.find((g) => g.answer_correct) ?? answered[0];
    const fin = list.map((g) => g.finished_at).filter(Boolean).sort() as string[];
    return {
      device_id: list[0].device_id, ids: list.map((g) => g.device_id), devices: list.length, group_name: name,
      photos: list.flatMap((g) => g.photos), points: Math.max(...list.map((g) => g.points)), discovered: Math.max(...list.map((g) => g.discovered)),
      eggs: [...new Set(list.flatMap((g) => g.eggs || []))], hint_used: list.some((g) => g.hint_used), hint_known: list.some((g) => g.hint_known),
      answer: pick?.answer ?? null, answer_correct: pick ? pick.answer_correct : null, finished_at: fin.length ? fin[fin.length - 1] : null,
    };
  });
}

export interface Fair { total: number; corners: number; debate: number; quality: number; explain: number; eggs: number; answer: number }

export interface GroupGrade {
  device_id: string; ids: string[]; devices: number; group: string; unnamed: boolean;
  photos: PhotoGrade[];
  vaPhotos: number; standardVA: number; corners: string[]; debateCorners: string[]; completeVA: PhotoGrade[]; cornersComplete: string[];
  threeStars: number; dronePhotos: PhotoGrade[]; debatePhotos: PhotoGrade[];
  /** score re-computed from distinct corners and drawing quality; repeated shots at one corner add nothing */
  fair: Fair;
  /** counter kept in the game, repeated shots inflate it; for reference only */
  points: number; eggs: string[]; hint: boolean; hintKnown: boolean; answer: number | null; answerCorrect: boolean; finished: string | null;
  eligible: boolean; missing: string[]; flags: string[];
}

export interface GradeOptions {
  /** true: a photo counts as drawn only with A, V, the subject dot and a sentence (the brief). false: A and V traced correctly is enough. */
  strict?: boolean;
}

const qLine = (s: Status) => (s === 'đúng' ? 15 : s === 'gần đúng' ? 8 : 0);
const qDot = (s: Status) => (s === 'đúng' ? 5 : s === 'gần đúng' ? 3 : 0);
const qNote = (s: Status) => (s === 'đúng' ? 10 : s === 'gần đúng' ? 5 : 0);

export function gradeGroup(g: GroupInput, opts: GradeOptions = {}): GroupGrade {
  const strict = !!opts.strict;
  const photos = g.photos.map(gradePhoto);
  const va = photos.filter((p) => p.va);
  const std = photos.filter((p) => p.standardVA);
  const readyOf = (p: PhotoGrade) => (strict ? p.complete : p.drawnOk);
  const corners = [...new Set(std.map((p) => p.label!))].sort();
  const debateCorners = [...new Set(photos.filter((p) => p.va && p.cls === 'debate' && p.label).map((p) => p.label!))].sort();
  const completeVA = std.filter(readyOf);
  const cornersComplete = [...new Set(completeVA.map((p) => p.label!))].sort();
  const missing: string[] = [];
  const need = strict ? 'vẽ đủ A, V, chấm và ghi chú' : 'vẽ đúng nét A và V';
  if (std.length < 2) missing.push(`mới ${std.length}/2 ảnh V+A ở góc chuẩn`);
  else if (corners.length < 2) missing.push('2 ảnh V+A nhưng cùng một góc');
  if (std.length >= 2 && cornersComplete.length < 2) missing.push(`mới ${cornersComplete.length}/2 góc chuẩn có ảnh ${need}`);

  // fair score: per distinct corner, best photo counts
  const bestAt = (label: string) => photos.filter((p) => p.va && p.label === label).sort((a, b) => (qLine(b.a.status) + qLine(b.v.status) + qDot(b.dot.status) + qNote(b.note.status)) - (qLine(a.a.status) + qLine(a.v.status) + qDot(a.dot.status) + qNote(a.note.status)))[0];
  let quality = 0, explain = 0;
  for (const label of [...corners, ...debateCorners]) { const b = bestAt(label); if (!b) continue; quality += qLine(b.a.status) + qLine(b.v.status); explain += qDot(b.dot.status) + qNote(b.note.status); }
  const eggs = [...new Set(g.eggs || [])];
  const fair: Fair = { corners: 100 * corners.length, debate: 30 * debateCorners.length, quality, explain, eggs: 40 * Math.min(2, eggs.length), answer: g.answer_correct ? config.finalQuestion.bonus : 0, total: 0 };
  fair.total = fair.corners + fair.debate + fair.quality + fair.explain + fair.eggs + fair.answer;

  const flags: string[] = [];
  if (photos.length >= 40 && va.length / photos.length < 0.2) flags.push(`${photos.length} ảnh nhưng chỉ ${va.length} ảnh có V+A: nghi chụp hàng loạt để cộng điểm`);
  if (g.points >= 500 && g.points > fair.total * 3) flags.push(`Điểm game ${g.points} cao gấp hơn 3 lần điểm chấm lại ${fair.total}: chụp lặp một góc hoặc chụp bừa`);
  if (va.length >= 10 && corners.length <= 2) flags.push(`${va.length} ảnh V+A nhưng chỉ ${corners.length} góc khác nhau`);
  return {
    device_id: g.device_id, ids: g.ids ?? [g.device_id], devices: g.devices ?? 1, group: g.group_name || `Chưa đặt tên · ${g.device_id.slice(2, 8)}`, unnamed: !groupKey(g.group_name),
    photos, vaPhotos: va.length, standardVA: std.length, corners, debateCorners, completeVA, cornersComplete,
    threeStars: photos.filter((p) => p.stars >= 3).length,
    dronePhotos: va.filter((p) => p.mode === 'fly'), debatePhotos: photos.filter((p) => p.va && p.cls === 'debate'),
    fair, points: g.points, eggs, hint: !!g.hint_used, hintKnown: !!g.hint_known, answer: g.answer, answerCorrect: !!g.answer_correct, finished: g.finished_at,
    eligible: missing.length === 0, missing, flags,
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
  const ranking = [...groups].sort((a, b) => (a.eligible !== b.eligible ? (a.eligible ? -1 : 1) : b.fair.total - a.fair.total || tieBreak(a, b)));
  const eligible = ranking.filter((g) => g.eligible);
  const first = eligible[0] ?? null;
  const second = eligible.filter((g) => g !== first && !g.hint).sort((a, b) => b.cornersComplete.length - a.cornersComplete.length || b.fair.total - a.fair.total || tieBreak(a, b))[0] ?? null;
  const eyes = groups.filter((g) => g.eggs.includes('X') && g.eggs.includes('C'));
  const storyteller = groups.flatMap((g) => g.photos.filter((p) => p.va && p.note.status === 'đúng' && p.drawnOk).map((p) => ({ group: g, photo: p }))).sort((a, b) => b.photo.note.text.length - a.photo.note.text.length).slice(0, 8);
  const debate = groups.filter((g) => g.debatePhotos.some((p) => p.drawnOk));
  const drone = groups.flatMap((g) => g.dronePhotos.map((p) => ({ group: g, photo: p })));
  return { first, second, eyes, storyteller, debate, drone, ranking };
}

export function toCSV(groups: GroupGrade[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Nhóm', 'Số máy', 'Điểm chấm lại', 'Điểm game (tham khảo)', 'Ảnh', 'Ảnh V+A', 'Góc chuẩn có V+A', 'Số góc chuẩn', 'Góc tranh luận', 'Góc chuẩn vẽ đúng', 'Egg', 'Gợi ý', 'Câu hỏi', 'Đủ điều kiện', 'Còn thiếu', 'Cảnh báo', 'Nộp lúc', 'Mã thiết bị'];
  const rows = groups.map((g) => [g.group, g.devices, g.fair.total, g.points, g.photos.length, g.vaPhotos, g.corners.join(' '), g.corners.length, g.debateCorners.join(' '), g.cornersComplete.join(' '), g.eggs.join(' '), g.hintKnown ? (g.hint ? 'có' : 'không') : 'chưa rõ', g.answer == null ? '' : `${g.answer}${g.answerCorrect ? ' đúng' : ' sai'}`, g.eligible ? 'có' : 'không', g.missing.join('; '), g.flags.join('; '), g.finished ?? '', g.ids.join(' ')].map(esc).join(','));
  return [head.map(esc).join(','), ...rows].join('\n');
}
