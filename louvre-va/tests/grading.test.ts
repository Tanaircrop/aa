import { describe, it, expect } from 'vitest';
import { config } from '../src/data/config';
import { allTips, labelOf, pickTip, expectedLines, gradePhoto, gradeGroup, awards, camFromMeta, project } from '../src/gameplay/grading';
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
    const g = gradePhoto({ id: 'p', meta: m, strokes: [seg('A', e.ridges[0][0], e.ridges[0][1]), seg('V', e.edges[0][0], e.edges[0][1]), seg('V', e.edges[1][0], e.edges[1][1]), { tool: 'dot', pts: [mid] }], note: 'Đỉnh V dẫn mắt vào chân kim tự tháp.' });
    expect(g.label).toBe('Góc 2'); expect(g.standardVA).toBe(true);
    expect(g.a.status).toBe('đúng'); expect(g.v.status).toBe('đúng'); expect(g.dot.status).toBe('đúng'); expect(g.note.status).toBe('đúng');
    expect(g.complete).toBe(true);
  });
  it('rejects an A line far from any ridge and a single V line, flags a missing note', () => {
    const m = metaAt(2); const e = expectedLines(m);
    const g = gradePhoto({ id: 'p', meta: m, strokes: [seg('A', [0.1, 0.5], [0.9, 0.52]), seg('V', e.edges[0][0], e.edges[0][1])], note: '' });
    expect(g.a.status).toBe('lệch'); expect(g.v.status).toBe('lệch'); expect(g.dot.status).toBe('thiếu'); expect(g.note.status).toBe('thiếu');
    expect(g.complete).toBe(false);
  });
  it('tolerates a slightly off A line as "gần đúng"', () => {
    const m = metaAt(0); const e = expectedLines(m);
    const [a, b] = e.ridges[0]; const g = gradePhoto({ id: 'p', meta: m, strokes: [seg('A', [a[0] + 0.03, a[1]], [b[0] + 0.03, b[1]])], note: '' });
    expect(['đúng', 'gần đúng']).toContain(g.a.status);
  });
});

describe('group grading and awards', () => {
  const full = (i: number, id: string) => { const m = metaAt(i); const e = expectedLines(m); const bis = e.bisector!; return { id, meta: m, strokes: [seg('A', e.ridges[0][0], e.ridges[0][1]), seg('V', e.edges[0][0], e.edges[0][1]), seg('V', e.edges[1][0], e.edges[1][1]), { tool: 'dot' as const, pts: [[(bis[0][0] + bis[1][0]) / 2, (bis[0][1] + bis[1][1]) / 2] as [number, number]] }], note: 'V dẫn mắt vào kim tự tháp' }; };
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
    expect(w.ranking.map((g) => g.group)).toEqual(['A', 'B', 'C']);
    expect(w.first?.group).toBe('A'); expect(w.second?.group).toBe('B'); expect(w.eyes.map((g) => g.group)).toEqual(['B']);
    expect(config.finalQuestion.answer).toBe(5);
  });
});
