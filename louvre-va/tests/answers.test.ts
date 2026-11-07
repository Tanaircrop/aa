import { describe, it, expect } from 'vitest';
import { config, pools } from '../src/data/config';
import { classifyTips, summarize, orderStandard } from '../src/gameplay/answers';

const corners = config.mainPyramid.corners as [number, number][];

describe('V + A answer key computed from scene.config.json', () => {
  const tips = classifyTips(pools, corners, {
    coincidentTol: config.answers.coincidentCornerTolerance,
    angleTolDeg: config.answers.angleToleranceDeg,
  });
  const s = summarize(tips);

  it('has 21 pool tips (7 triangular pools)', () => {
    expect(tips.length).toBe(21);
  });

  it('yields exactly 5 standard, 2 debate, 14 rejected', () => {
    expect(s.standard.length).toBe(5);
    expect(s.debate.length).toBe(2);
    expect(s.rejected.length).toBe(14);
  });

  it('standard tips match the spec table (pool and position within 1 m)', () => {
    const ordered = orderStandard(s.standard);
    config.answers.expectedStandard.forEach((exp, i) => {
      const t = ordered[i];
      expect(t.pool).toBe(exp.pool);
      expect(Math.abs(t.angleDeg - 90)).toBeLessThan(5);
      const d = Math.hypot(t.pos[0] - exp.approx[0], t.pos[1] - exp.approx[1]);
      expect(d).toBeLessThan(1.0);
      // look direction within 5 deg of the spec
      const diff = Math.abs((((t.bisectorDeg - exp.lookDeg) % 360) + 540) % 360 - 180);
      expect(diff).toBeLessThan(5);
    });
  });

  it('debate tips are the outer 45 deg corners of the two half pools', () => {
    for (const exp of config.answers.expectedDebate) {
      const t = s.debate.find((x) => x.pool === exp.pool);
      expect(t).toBeDefined();
      expect(Math.abs(t!.angleDeg - 45)).toBeLessThan(5);
      const d = Math.hypot(t!.pos[0] - exp.approx[0], t!.pos[1] - exp.approx[1]);
      expect(d).toBeLessThan(1.5);
    }
  });

  it('rejected tips split 6 + 6 + 2 as described in the spec', () => {
    const touching = s.rejected.filter((t) => t.reason.startsWith('Mũi hồ chạm'));
    const halfRight = s.rejected.filter((t) => Math.abs(t.angleDeg - 90) < 5);
    expect(touching.length).toBe(6);
    expect(halfRight.length).toBe(2);
    expect(s.rejected.length - touching.length - halfRight.length).toBe(6);
  });
});
