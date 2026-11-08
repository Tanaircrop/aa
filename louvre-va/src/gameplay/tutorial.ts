import * as THREE from 'three';
import { config, toThree, type Vec2 } from '../data/config';
import type { Player } from './player';
import type { PoolTip } from './answers';

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
  private lastHint = 0;
  private shownTips = new Set<string>();
  constructor(scene: THREE.Scene, private tips: PoolTip[], enabled: boolean) {
    this.step = enabled ? 'goto' : 'off';
    this.marker = new THREE.Group();
    const [x, z] = toThree(config.tutorial.checkpoint as Vec2);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(config.tutorial.radius - 0.4, config.tutorial.radius, 48), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.set(x, 0.08, z);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.35, 14, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    this.beam.position.set(x, 7, z);
    this.marker.add(this.ring, this.beam); this.marker.visible = enabled; scene.add(this.marker);
  }

  get active() { return this.step !== 'off' && this.step !== 'done'; }
  skip() { this.step = 'off'; this.marker.visible = false; this.onMessage?.('', '', ''); }

  private say(title: string, body: string, n: number) { this.onMessage?.(title, body, `${n}/6`); }

  /** Called every frame with the live state. */
  update(dt: number, t: number, player: Player, cameraOn: boolean, focal: number, apexInUpperThird: boolean, photos: number, annotated: number) {
    if (this.step === 'off') return;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 3) * 0.3;
    this.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.05);
    const cp = config.tutorial.checkpoint as Vec2;
    const dist = Math.hypot(player.pos[0] - cp[0], player.pos[1] - cp[1]);
    switch (this.step) {
      case 'goto':
        this.say('Nhiệm vụ đầu tiên', `Đi tới vòng tròn vàng (còn ${dist.toFixed(0)} m). WASD hoặc joystick để đi, kéo chuột / vuốt để nhìn quanh.`, 1);
        if (dist < config.tutorial.radius) { this.step = 'camera'; this.marker.visible = false; }
        break;
      case 'camera':
        this.say('Giơ máy lên', 'Bấm C, chuột phải hoặc nút 📷. Màn LCD trong tay chính là khung ngắm.', 2);
        if (cameraOn) this.step = 'zoom';
        break;
      case 'zoom':
        this.say('Chọn tiêu cự 24 mm', 'Lăn con lăn, bấm phím 2, hoặc pinch 2 ngón. 24 mm gần mắt người, 16 mm xoè chữ V mạnh hơn.', 3);
        if (!cameraOn) { this.step = 'camera'; break; }
        if (focal === 24) this.step = 'frame';
        break;
      case 'frame':
        this.say('Canh khung', 'Quay về kim tự tháp, đặt đỉnh kim tự tháp vào 1/3 trên của khung (đường lưới ngang trên).', 4);
        if (!cameraOn) { this.step = 'camera'; break; }
        if (apexInUpperThird) this.step = 'shoot';
        break;
      case 'shoot':
        this.say('Chụp', 'Space, click, hoặc nút tròn trắng. Ảnh lưu vào Thư viện, tối đa 20 ảnh.', 5);
        if (photos > 0) this.step = 'annotate';
        break;
      case 'annotate':
        this.say('Vẽ chữ A', 'Mở Thư viện (G hoặc nút 🖼), bấm ảnh, kéo một đường thẳng dọc sống kim tự tháp rồi Lưu.', 6);
        if (annotated > 0) { this.step = 'done'; this.onMessage?.('Xong hướng dẫn', 'Giờ tìm chỗ có cả V lẫn A: hồ có 21 mũi, nhưng chỉ vài mũi cho đáy kim tự tháp nằm trọn trong lòng V. Thử đứng sát mũi hồ và nhìn theo đường phân giác.', ''); setTimeout(() => this.onMessage?.('', '', ''), 9000); }
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
