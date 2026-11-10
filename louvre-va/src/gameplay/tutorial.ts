import * as THREE from 'three';
import { config, toThree, type Vec2 } from '../data/config';
import type { Player } from './player';
import { orderStandard, poseForTip, type PoolTip } from './answers';
import { buildTipGuide } from '../scene/overlay';

export type TutorialStep = 'goto' | 'camera' | 'zoom' | 'frame' | 'shoot' | 'annotate' | 'done' | 'off';

/**
 * Guided first mission: a glowing checkpoint on the plaza. Standing on it, the game walks the player
 * through raising the camera, zooming, framing the apex, shooting and drawing the A. Afterwards it only
 * gives small nudges near 90-degree pool corners (never the answer itself).
 */
export class Tutorial {
  step: TutorialStep;
  marker: THREE.Group;
  private ring: THREE.Mesh;
  private beam: THREE.Mesh;
  onMessage: ((title: string, body: string, progress: string) => void) | null = null;
  onDone: (() => void) | null = null;
  private lastHint = 0;
  private shownTips = new Set<string>();
  /** the standard corner the tutorial teaches on (position 1, north inner pool) and where to stand */
  tip: PoolTip;
  checkpoint: Vec2;
  headingDeg: number;
  guide: THREE.Group;
  constructor(scene: THREE.Scene, private tips: PoolTip[], enabled: boolean) {
    this.step = enabled ? 'goto' : 'off';
    this.tip = orderStandard(tips.filter((t) => t.cls === 'standard'))[0];
    const pose = poseForTip(this.tip, 2.2);
    this.checkpoint = pose.pos; this.headingDeg = pose.headingDeg;
    this.guide = buildTipGuide(this.tip, 0x35d07f, '', { thick: 0.14, pole: false }); this.guide.visible = false; scene.add(this.guide);
    this.marker = new THREE.Group();
    const [x, z] = toThree(this.checkpoint);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(config.tutorial.radius - 0.4, config.tutorial.radius, 48), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.set(x, 0.08, z);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.35, 14, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    this.beam.position.set(x, 7, z);
    this.marker.add(this.ring, this.beam); this.marker.visible = enabled; scene.add(this.marker);
  }

  get active() { return this.step !== 'off' && this.step !== 'done'; }
  skip() { this.step = 'off'; this.marker.visible = false; this.guide.visible = false; this.onMessage?.('', '', ''); }

  private say(title: string, body: string, n: number) { this.onMessage?.(title, body, `${n}/6`); }

  /** Called every frame with the live state. */
  update(dt: number, t: number, player: Player, cameraOn: boolean, focal: number, hasA: boolean, hasV: boolean, photos: number, annotated: number) {
    if (this.step === 'off') return;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 3) * 0.3;
    this.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.05);
    // the V + A guide lines pulse while the player is learning the composition
    this.guide.visible = this.step === 'camera' || this.step === 'zoom' || this.step === 'frame' || this.step === 'shoot';
    if (this.guide.visible) this.guide.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (m && 'opacity' in m && !(o as THREE.Sprite).isSprite) m.opacity = 0.55 + Math.sin(t * 4) * 0.3; });
    const cp = this.checkpoint;
    const dist = Math.hypot(player.pos[0] - cp[0], player.pos[1] - cp[1]);
    switch (this.step) {
      case 'goto':
        this.say('Nhiệm vụ đầu tiên', `Đi tới vòng tròn vàng ở mũi hồ phía bắc (còn ${dist.toFixed(0)} m). Đó là một góc có cả V lẫn A thật. WASD hoặc joystick để đi, kéo chuột / vuốt để nhìn quanh.`, 1);
        if (dist < config.tutorial.radius) { this.step = 'camera'; this.marker.visible = false; }
        break;
      case 'camera':
        this.say('Giơ máy lên', 'Nét xanh trên sân là chữ V (hai bờ hồ) và chữ A (hai sống kim tự tháp). Bấm C, chuột phải hoặc nút 📷 để giơ máy.', 2);
        if (cameraOn) this.step = 'zoom';
        break;
      case 'zoom':
        this.say('Chọn 16 mm', 'Đứng sát mũi hồ nên cần góc rộng: lăn con lăn, bấm phím 1, hoặc pinch 2 ngón về 16 mm để lấy trọn cả đáy kim tự tháp trong lòng V.', 3);
        if (!cameraOn) { this.step = 'camera'; break; }
        if (focal <= 24) this.step = 'frame';
        break;
      case 'frame':
        this.say('Canh khung', 'Nhìn thẳng về kim tự tháp theo nét xanh, hạ máy xuống 0,5-1 m (phím Q / thanh trượt) để hai bờ hồ chụm thành V. Khi huy hiệu A và V trên khung ngắm cùng sáng xanh là đạt.', 4);
        if (!cameraOn) { this.step = 'camera'; break; }
        if (hasA && hasV) this.step = 'shoot';
        break;
      case 'shoot':
        this.say('Chụp', 'Giữ nguyên bố cục, bấm Space, click, hoặc nút tròn trắng. Ảnh có V + A được cộng điểm và tính là khám phá góc 1/5.', 5);
        if (photos > 0) this.step = 'annotate';
        break;
      case 'annotate':
        this.say('Vẽ chữ A và V', 'Mở Thư viện (G hoặc nút 🖼), bấm ảnh, kéo một đường thẳng dọc sống kim tự tháp (A), hai nét đứt theo bờ hồ (V), chấm đỏ ở đỉnh V, ghi 1 câu rồi Lưu.', 6);
        if (annotated > 0) { this.step = 'done'; this.onMessage?.('', '', ''); this.onDone?.(); }
        break;
      default:
        break;
    }
    // light nudges near 90-degree pool corners, once per corner, after the guided part
    if (this.step === 'done' && t - this.lastHint > 6) {
      for (const tip of this.tips) {
        if (Math.abs(tip.angleDeg - 90) > 6) continue;
        const key = `${tip.pool}:${tip.index}`;
        const d = Math.hypot(player.pos[0] - tip.pos[0], player.pos[1] - tip.pos[1]);
        if (d < config.tutorial.hintRadius && !this.shownTips.has(key)) {
          this.shownTips.add(key); this.lastHint = t;
          this.onMessage?.('Gợi ý nhỏ', 'Mũi hồ 90°. Đứng sát mũi, hạ máy xuống 0,5-1 m và nhìn thẳng theo đường chia đôi góc: hai bờ hồ sẽ chụm thành V. Kim tự tháp có nằm trọn trong lòng V không?', '');
          setTimeout(() => this.onMessage?.('', '', ''), 8000);
          break;
        }
      }
    }
  }
}
