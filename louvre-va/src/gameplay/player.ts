import * as THREE from 'three';
import { config, fromThree, type Vec2 } from '../data/config';
import type { Input } from '../core/input';
import type { CollisionWorld } from './collision';

export type MoveMode = 'walk' | 'fly';

export class Player {
  mode: MoveMode = 'walk';
  /** plan position (x east, y north) and altitude of the camera above ground */
  pos: Vec2;
  alt: number;
  yaw: number; // radians, 0 = looking east (+x), positive = counter-clockwise (toward north)
  pitch = 0;
  roll = 0;
  cameraHeight: number;
  flySpeed: number;
  flyEnabled = true;
  private vel = new THREE.Vector3();
  private lookSensitivity = 0.0022;
  touchLook = { dx: 0, dy: 0 };
  frozen = false;

  constructor(private input: Input, private collision: CollisionWorld) {
    const p = config.player;
    this.pos = [config.spawn.pos[0], config.spawn.pos[1]];
    this.yaw = (config.spawn.headingDeg * Math.PI) / 180;
    this.cameraHeight = p.eyeHeight;
    this.alt = p.eyeHeight;
    this.flySpeed = p.flySpeedDefault;
  }

  teleport(pos: Vec2, headingDeg: number, alt?: number, pitchDeg = 0) {
    this.pos = [pos[0], pos[1]];
    this.yaw = (headingDeg * Math.PI) / 180;
    this.pitch = (pitchDeg * Math.PI) / 180;
    this.roll = 0;
    if (alt !== undefined && alt > config.player.cameraHeightMax + 0.01) { this.mode = 'fly'; this.alt = alt; }
    else { this.mode = 'walk'; this.cameraHeight = alt ?? config.player.eyeHeight; this.alt = this.cameraHeight; }
    this.vel.set(0, 0, 0);
  }

  adjustFlySpeed(steps: number) {
    const P = config.player;
    this.flySpeed = Math.max(P.flySpeedMin, Math.min(P.flySpeedMax, this.flySpeed - steps));
  }

  toggleMode() {
    if (this.mode === 'walk') { if (!this.flyEnabled) return; this.mode = 'fly'; this.vel.set(0, 0, 0); }
    else { this.mode = 'walk'; }
  }

  get headingDeg(): number { return ((this.yaw * 180) / Math.PI + 360) % 360; }
  /** Compass heading in degrees from north, clockwise (for photo metadata) */
  get compassDeg(): number { return ((90 - (this.yaw * 180) / Math.PI) % 360 + 360) % 360; }

  update(dt: number) {
    const inp = this.input; const P = config.player;
    if (this.frozen) return;
    // look
    const look = inp.consumeLook();
    const dx = look.dx + this.touchLook.dx, dy = look.dy + this.touchLook.dy;
    this.touchLook.dx = 0; this.touchLook.dy = 0;
    this.yaw -= dx * this.lookSensitivity;
    this.pitch -= dy * this.lookSensitivity;
    this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
    if (inp.down('KeyZ')) this.roll -= dt * 0.6;
    if (inp.down('KeyX')) this.roll += dt * 0.6;
    if (inp.justPressed('KeyF') || inp.touch.fly) { inp.touch.fly = false; this.toggleMode(); }

    // movement input in the camera's local frame (forward/right), plan coordinates
    let f = 0, r = 0;
    if (inp.down('KeyW') || inp.down('ArrowUp')) f += 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) f -= 1;
    if (inp.down('KeyD') || inp.down('ArrowRight')) r += 1;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) r -= 1;
    f += -inp.joy.y; r += inp.joy.x;
    const len = Math.hypot(f, r); if (len > 1) { f /= len; r /= len; }
    const boost = inp.down('ShiftLeft') || inp.down('ShiftRight') || inp.touch.boost;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const fwd: Vec2 = [cy, sy]; const right: Vec2 = [sy, -cy];
    let up = 0;
    if (inp.down('KeyE') || inp.touch.up) up += 1;
    if (inp.down('KeyQ') || inp.touch.down) up -= 1;

    if (this.mode === 'walk') {
      const speed = boost ? P.runSpeed : P.walkSpeed;
      const nx = this.pos[0] + (fwd[0] * f + right[0] * r) * speed * dt;
      const ny = this.pos[1] + (fwd[1] * f + right[1] * r) * speed * dt;
      this.pos = this.collision.resolveWalk([nx, ny], P.radius);
      if (up) this.cameraHeight = Math.max(P.cameraHeightMin, Math.min(P.cameraHeightMax, this.cameraHeight + up * dt * 0.6));
      // settle softly to the ground after flying
      this.alt += (this.cameraHeight - this.alt) * Math.min(1, dt * 6);
    } else {
      const speed = this.flySpeed * (boost ? 2 : 1);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const target = new THREE.Vector3(
        (fwd[0] * cp * f + right[0] * r) * speed,
        (sp * f + up) * speed,
        (fwd[1] * cp * f + right[1] * r) * speed,
      );
      // light drone-like inertia
      this.vel.lerp(target, Math.min(1, dt * 4));
      const np: [number, number, number] = [this.pos[0] + this.vel.x * dt, this.pos[1] + this.vel.z * dt, this.alt + this.vel.y * dt];
      const res = this.collision.resolveFly(np, 0.6);
      this.pos = [res[0], res[1]]; this.alt = res[2];
    }
  }

  applyTo(camera: THREE.PerspectiveCamera) {
    camera.position.set(this.pos[0], this.alt, -this.pos[1]);
    // yaw: 0 = +x. In Three, camera looks down -Z by default; rotation.y = yaw - 90deg gives +x when yaw = 0
    camera.rotation.set(this.pitch, this.yaw - Math.PI / 2, this.roll, 'YXZ');
  }

  /** Plan position of the camera from a Three.js position */
  static planOf(camera: THREE.Camera): Vec2 { return fromThree(camera.position.x, camera.position.z); }
}
