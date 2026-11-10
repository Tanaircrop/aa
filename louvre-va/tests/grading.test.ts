import { describe, it, expect } from 'vitest';
import { config } from '../src/data/config';
import { allTips, labelOf, pickTip, expectedLines, gradePhoto, gradeGroup, awards, camFromMeta, project, groupKey, mergeDevices, type GroupInput } from '../src/gameplay/grading';
import { orderStandard, poseForTip } from '../src/gameplay/answers';
import type { PhotoMeta, Stroke } from '../src/gameplay/gallery';

const standard = orderStandard(allTips.filter((t) => t.cls === 'standard'));

function metaAt(cornerIndex: number, over: Partial<PhotoMeta> = {}): PhotoMeta {
  const tip = standard[cornerIndex]; const pose = poseForTip(tip, 1.2);
  return { group: 'T', pos: pose.pos, altitude: 0.8, cameraHeight: 0.8, compassDeg: Math.round((90 - pose.headingDeg + 720) % 360), pitchDeg: -4, focal: 16, aspect: '3:2', mode: 'walk', label: 'chụp được ngoài đời', preset: 'day', takenAt: '', width: 1800, height: 1200, hasA: true, hasV: true, stars: 3, points: 130, ...over };
}
const seg = (tool: Stroke['tool'], a: [number, number], b: [number, number]): Stroke => ({ tool, pts: [a, b] });

describe('re-projection of the scene into a photo', () => {
  it('puts the pyramid apex near the horizontal centre when standing on a standard tip looking along the bisector', () => {
    const m = metaAt(0); const e = expectedLines(m);
    expect(e.apex).not.toBeNull();
    expect(Math.abs(e.apex![0] - 0.5)).toBeLessThan(0.08);
    expect(e.apex![1]).toBeGreaterThan(0); expect(e.apex![1]).toBeLessThan(0.5);
    expect(e.ridges.length).toBeGreaterThanOrEqual(2);
    expect(labelOf(e.tip)).toBe('Góc 1');
    expect(e.edges.length).toBe(2);
  });
  it('labels all five standard tips and both debate tips', () => {
    expect(standard.map(labelOf)).toEqual(['Góc 1', 'Góc 2', 'Góc 3', 'Góc 4', 'Góc 5']);
    expect(allTips.filter((t) => t.cls === 'debate').map(labelOf).sort()).toEqual(['T1', 'T2']);
    expect(pickTip([0, 0], 0)).toBeNull();
  });
  it('projects a point straight ahead to the frame centre', () => {
    const c = camFromMeta(metaAt(0, { pitchDeg: 0 }));
    const yaw = (c.yawDeg * Math.PI) / 180;
    const p = project(c, [c.pos[0] + Math.cos(yaw) * 10, c.pos[1] + Math.sin(yaw) * 10, c.alt]);
    expect(p.uv[0]).toBeCloseTo(0.5, 3); expect(p.uv[1]).toBeCloseTo(0.5, 3); expect(p.depth).toBeCloseTo(10, 3);
  });
});

describe('student annotation analysis', () => {
  it('accepts lines drawn on the ridges and pool edges, a dot on the bisector and a sentence', () => {
    const m = metaAt(1); const e = expectedLines(m);
    const bis = e.bisector!; const mid: [number, number] = [(bis[0][0] + bis[1][0]) / 2, (bis[0][1] + bis[1][1]) / 2];
    const g = gradePhoto({ id: 'p', meta: m, strokes: [seg('A', e.ridges[0][0], e.ridges[0][1]), seg('A', e.ridges[1][0], e.ridges[1][1]), seg('V', e.edges[0][0], e.edges[0][1]), seg('V', e.edges[1][0], e.edges[1][1]), { tool: 'dot', pts: [mid] }], note: 'Đỉnh V dẫn mắt vào chân kim tự tháp.' });
    expect(g.label).toBe('Góc 2'); expect(g.standardVA).toBe(true);
    expect(g.a.status).toBe('đúng'); expect(g.v.status).toBe('đúng'); expect(g.dot.status).toBe('đúng'); expect(g.note.status).toBe('đúng');
    expect(g.complete).toBe(true); expect(g.drawnOk).toBe(true);
  });
  it('rejects an A line far from any ridge, gives a lone correct V line only partial credit, flags a missing note', () => {
    const m = metaAt(2); const e = expectedLines(m);
    const g = gradePhoto({ id: 'p', meta: m, strokes: [seg('A', [0.1, 0.5], [0.9, 0.52]), seg('V', e.edges[0][0], e.edges[0][1])], note: '' });
    expect(g.a.status).toBe('lệch'); expect(g.v.status).toBe('gần đúng'); expect(g.v.matched).toBe(1); expect(g.dot.status).toBe('thiếu'); expect(g.note.status).toBe('thiếu');
    expect(g.complete).toBe(false);
  });
  it('tolerates a slightly off A line as "gần đúng"', () => {
    const m = metaAt(0); const e = expectedLines(m);
    const [a, b] = e.ridges[0]; const g = gradePhoto({ id: 'p', meta: m, strokes: [seg('A', [a[0] + 0.03, a[1]], [b[0] + 0.03, b[1]])], note: '' });
    expect(['đúng', 'gần đúng']).toContain(g.a.status);
  });
  it('a single A stroke is at best "gần đúng" and says the other ridge is off or missing', () => {
    const m = metaAt(0); const e = expectedLines(m);
    const g = gradePhoto({ id: 'p', meta: m, strokes: [seg('A', e.ridges[0][0], e.ridges[0][1])], note: '' });
    expect(g.a.status).toBe('gần đúng'); expect(g.a.matched).toBe(1); expect(g.verdict[0]).toContain('nét còn lại');
  });
  it('ignores a stray extra V stroke when two strokes already sit on the two banks', () => {
    const m = metaAt(1); const e = expectedLines(m);
    const g = gradePhoto({ id: 'p', meta: m, strokes: [seg('A', e.ridges[0][0], e.ridges[0][1]), seg('A', e.ridges[1][0], e.ridges[1][1]), seg('V', e.edges[0][0], e.edges[0][1]), seg('V', e.edges[1][0], e.edges[1][1]), seg('V', [0.1, 0.2], [0.2, 0.4])], note: '' });
    expect(g.v.status).toBe('đúng'); expect(g.drawnOk).toBe(true); expect(g.complete).toBe(false);
  });
});

describe('group grading and awards', () => {
  const full = (i: number, id: string) => { const m = metaAt(i); const e = expectedLines(m); const bis = e.bisector!; return { id, meta: m, strokes: [seg('A', e.ridges[0][0], e.ridges[0][1]), seg('A', e.ridges[1][0], e.ridges[1][1]), seg('V', e.edges[0][0], e.edges[0][1]), seg('V', e.edges[1][0], e.edges[1][1]), { tool: 'dot' as const, pts: [[(bis[0][0] + bis[1][0]) / 2, (bis[0][1] + bis[1][1]) / 2] as [number, number]] }], note: 'V dẫn mắt vào kim tự tháp' }; };
  const base = { eggs: [] as string[], hint_used: false, answer: 5, answer_correct: true, finished_at: '2026-11-09T08:00:00Z' };
  it('requires two complete V+A photos at two different standard corners', () => {
    const one = gradeGroup({ device_id: 'd1', group_name: 'A', photos: [full(0, 'x'), full(0, 'y')], points: 300, discovered: 1, ...base });
    expect(one.eligible).toBe(false); expect(one.missing[0]).toContain('cùng một góc');
    const two = gradeGroup({ device_id: 'd2', group_name: 'B', photos: [full(0, 'x'), full(3, 'y')], points: 200, discovered: 2, ...base });
    expect(two.eligible).toBe(true); expect(two.cornersComplete).toEqual(['Góc 1', 'Góc 4']);
  });
  it('ranks eligible groups first, applies the no-hint rule for the corner hunter award', () => {
    const a = gradeGroup({ device_id: 'd1', group_name: 'A', photos: [full(0, 'x'), full(1, 'y')], points: 400, discovered: 2, ...base, hint_used: true });
    const b = gradeGroup({ device_id: 'd2', group_name: 'B', photos: [full(0, 'x'), full(1, 'y'), full(2, 'z')], points: 350, discovered: 3, ...base, eggs: ['X', 'C'] });
    const c = gradeGroup({ device_id: 'd3', group_name: 'C', photos: [full(0, 'x')], points: 900, discovered: 1, ...base });
    const w = awards([a, b, c]);
    // ranked by the re-computed score (distinct corners), not by the game counter: C has the most game points but is not eligible
    expect(w.ranking.map((g) => g.group)).toEqual(['B', 'A', 'C']);
    expect(w.first?.group).toBe('B'); expect(w.second).toBeNull(); expect(w.eyes.map((g) => g.group)).toEqual(['B']);
    expect(config.finalQuestion.answer).toBe(5);
  });
});


describe('merging devices and the re-computed score', () => {
  const full = (i: number, id: string) => { const m = metaAt(i); const e = expectedLines(m); return { id, meta: m, strokes: [seg('A', e.ridges[0][0], e.ridges[0][1]), seg('A', e.ridges[1][0], e.ridges[1][1]), seg('V', e.edges[0][0], e.edges[0][1]), seg('V', e.edges[1][0], e.edges[1][1])], note: '' }; };
  const raw = (i: number, id: string) => ({ id, meta: metaAt(i), strokes: [], note: '' });
  const dev = (id: string, name: string, photos: GroupInput['photos'], over: Partial<GroupInput> = {}): GroupInput => ({ device_id: id, group_name: name, photos, points: 100, discovered: 0, eggs: [], hint_used: false, answer: null, answer_correct: null, finished_at: null, ...over });

  it('normalises group names and refuses to attribute default names', () => {
    expect(['Nhóm 10', 'nhóm 10', 'Nhom 10', '10', ' NHÓM  10 '].map(groupKey)).toEqual(['10', '10', '10', '10', '10']);
    expect(['Nhóm', 'nhóm?', '', 'nhóm'].map(groupKey)).toEqual([null, null, null, null]);
    expect(groupKey('Nhóm2')).toBe('2');
  });
  it('merges devices of one group, keeps unnamed devices apart, applies the teacher alias', () => {
    const a = dev('d_aaaaaa1', 'Nhóm 10', [raw(0, 'a')], { eggs: ['X'] }), b = dev('d_bbbbbb2', 'nhóm 10', [raw(1, 'b')], { eggs: ['C'], hint_used: true, hint_known: true });
    const u1 = dev('d_cccccc3', 'Nhóm', [raw(2, 'c')]), u2 = dev('d_dddddd4', 'Nhóm', [raw(3, 'd')]);
    const merged = mergeDevices([a, b, u1, u2]);
    expect(merged.length).toBe(3);
    const g10 = merged.find((g) => g.group_name === 'Nhóm 10')!;
    expect(g10.devices).toBe(2); expect(g10.photos.length).toBe(2); expect(g10.eggs.sort()).toEqual(['C', 'X']); expect(g10.hint_used).toBe(true);
    const aliased = mergeDevices([a, b, u1, u2], { d_cccccc3: 'Nhóm 10' });
    expect(aliased.length).toBe(2); expect(aliased.find((g) => g.group_name === 'Nhóm 10')!.photos.length).toBe(3);
  });
  it('shooting the same corner many times adds nothing to the re-computed score', () => {
    const spam = gradeGroup(dev('d1', 'Nhóm 7', Array.from({ length: 26 }, (_, i) => raw(0, `s${i}`)), { points: 2560 }));
    const wide = gradeGroup(dev('d2', 'Nhóm 3', [raw(0, 'a'), raw(1, 'b'), raw(2, 'c'), raw(3, 'd'), raw(4, 'e')], { points: 400 }));
    expect(spam.fair.corners).toBe(100); expect(wide.fair.corners).toBe(500);
    expect(wide.fair.total).toBeGreaterThan(spam.fair.total);
    expect(spam.flags.join(' ')).toContain('cao gấp');
  });
  it('flags bulk shooting with almost no V+A', () => {
    const bulk = gradeGroup(dev('d3', 'Nhóm', Array.from({ length: 60 }, (_, i) => ({ id: `x${i}`, meta: metaAt(0, { hasA: false, hasV: false, pos: [10, 10] }), strokes: [], note: '' }))));
    expect(bulk.flags.join(' ')).toContain('chụp hàng loạt'); expect(bulk.fair.total).toBe(0);
  });
  it('lenient mode needs only correct A and V; strict mode also needs the dot and a sentence', () => {
    const photos = [full(0, 'p1'), full(3, 'p2')];
    const lenient = gradeGroup(dev('d4', 'Nhóm 5', photos)); const strict = gradeGroup(dev('d4', 'Nhóm 5', photos), { strict: true });
    expect(lenient.eligible).toBe(true); expect(lenient.cornersComplete).toEqual(['Góc 1', 'Góc 4']);
    expect(strict.eligible).toBe(false); expect(strict.missing.join(' ')).toContain('ghi chú');
    expect(lenient.fair.quality).toBeGreaterThan(0);
  });
});
