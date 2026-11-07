import * as THREE from 'three';
import { config, pools, toThree, wings, type Vec2 } from '../data/config';
import { classifyTips, summarize, orderStandard, poseForTip, type PoolTip } from '../gameplay/answers';

export interface AnswerEntry { key: string; label: string; tip?: PoolTip; pose: { pos: Vec2; headingDeg: number; alt?: number; pitchDeg?: number }; kind: 'standard' | 'debate'; note: string; focal: number }

/** Teacher overlay: green V/A/dot for the 5 standard positions, yellow for T1, T2 and the perspective V toward the Arc. */
export class AnswerOverlay {
  group = new THREE.Group();
  entries: AnswerEntry[] = [];
  constructor(scene: THREE.Scene) {
    this.group.name = 'answers'; this.group.visible = false; scene.add(this.group);
    const tips = classifyTips(pools, config.mainPyramid.corners as Vec2[], { coincidentTol: config.answers.coincidentCornerTolerance, angleTolDeg: config.answers.angleToleranceDeg });
    const s = summarize(tips);
    const green = 0x35d07f, yellow = 0xffd23f;
    const H = config.mainPyramid.height; const c = config.mainPyramid.corners as Vec2[];
    const cx = c.reduce((a, p) => a + p[0], 0) / 4, cy = c.reduce((a, p) => a + p[1], 0) / 4;
    const [px, pz] = toThree([cx, cy]); const apex = new THREE.Vector3(px, H, pz);
    const drawTip = (tip: PoolTip, color: number, label: string) => {
      const pool = pools.find((p) => p.id === tip.pool)!; const n = pool.pts.length;
      const a = pool.pts[(tip.index + 1) % n], b = pool.pts[(tip.index + n - 1) % n];
      const y = config.poolRimHeight + 0.15;
      const seg = (p: Vec2, q: Vec2, dashed: boolean) => {
        const [x1, z1] = toThree(p), [x2, z2] = toThree(q);
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y, z2)]);
        const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 1.2, gapSize: 0.7, linewidth: 2 }) : new THREE.LineBasicMaterial({ color });
        const l = new THREE.Line(g, m); if (dashed) l.computeLineDistances(); this.group.add(l);
      };
      seg(tip.pos, a, true); seg(tip.pos, b, true);
      // thick V tubes for visibility
      for (const q of [a, b]) {
        const [x1, z1] = toThree(tip.pos), [x2, z2] = toThree(q);
        const path = new THREE.LineCurve3(new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y, z2));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(path, 1, 0.12, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
        this.group.add(tube);
      }
      // subject dot at the tip + marker pole
      const [tx, tz] = toThree(tip.pos);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color })); dot.position.set(tx, y + 0.2, tz); this.group.add(dot);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), new THREE.MeshBasicMaterial({ color })); pole.position.set(tx, y + 2, tz); this.group.add(pole);
      this.group.add(makeLabel(label, color, new THREE.Vector3(tx, y + 4.4, tz)));
      // A: the pyramid ridge facing the tip (apex to the nearest base corner line is drawn as the two visible edges)
      const near = [...c].sort((p, q) => Math.hypot(p[0] - tip.pos[0], p[1] - tip.pos[1]) - Math.hypot(q[0] - tip.pos[0], q[1] - tip.pos[1]));
      for (const corner of near.slice(0, 2)) {
        const [kx, kz] = toThree(corner);
        const path = new THREE.LineCurve3(new THREE.Vector3(kx, 0.2, kz), apex.clone());
        const tube = new THREE.Mesh(new THREE.TubeGeometry(path, 1, 0.1, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }));
        this.group.add(tube);
      }
    };
    orderStandard(s.standard).forEach((tip, i) => {
      const exp = config.answers.expectedStandard[i];
      drawTip(tip, green, `${i + 1}`);
      const pose = poseForTip(tip, tip.pool.endsWith('inner') ? 2.0 : 1.2);
      this.entries.push({ key: `${i + 1}`, label: `Vị trí ${i + 1}: ${exp.note}`, tip, pose: { ...pose, alt: 1.2 }, kind: 'standard', note: `${exp.focal} · ${tip.reason}`, focal: parseInt(exp.focal) });
    });
    s.debate.forEach((tip) => {
      const exp = config.answers.expectedDebate.find((d) => d.pool === tip.pool)!;
      drawTip(tip, yellow, exp.id);
      this.entries.push({ key: exp.id, label: `${exp.id}: góc ngoài hồ nửa ${tip.pool}`, tip, pose: { ...poseForTip(tip, 1.2), alt: 1.2 }, kind: 'debate', note: tip.reason, focal: 24 });
    });
    // perspective V of the two wings converging toward the Arc du Carrousel (yellow, "to debate")
    const arc = config.arcDuCarrousel.pos as Vec2;
    for (const w of wings) {
      if (w.side === 'east') continue;
      const yF = w.facadeY as number; const from: Vec2 = [w.xTo as number, yF]; const to: Vec2 = [w.xFrom as number, yF];
      const [x1, z1] = toThree(from), [x2, z2] = toThree(to), [ax, az] = toThree(arc);
      const pts = [new THREE.Vector3(x1, config.facade.corniceHeight, z1), new THREE.Vector3(x2, config.facade.corniceHeight, z2), new THREE.Vector3(ax, 18, az)];
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: yellow, dashSize: 3, gapSize: 2 })); l.computeLineDistances(); this.group.add(l);
    }
    const [ax, az] = toThree(arc); this.group.add(makeLabel('V phối cảnh', yellow, new THREE.Vector3(ax, 24, az)));
    this.entries.push({ key: 'VP', label: 'V phối cảnh: hai dãy nhà hội tụ về Arc du Carrousel', pose: { pos: [-20, -2], headingDeg: 180, alt: 1.6 }, kind: 'debate', note: 'Có V nhưng không phải V của hồ', focal: 24 });
  }
  setVisible(v: boolean) { this.group.visible = v; }
}

function makeLabel(text: string, color: number, pos: THREE.Vector3): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect(8, 16, 240, 96, 20); ctx.fill();
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0'); ctx.font = 'bold 60px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(4, 2, 1); s.position.copy(pos); s.renderOrder = 50;
  return s;
}
