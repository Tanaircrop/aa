import * as THREE from 'three';
import type { CollisionWorld } from '../gameplay/collision';
import type { Vec2 } from '../data/config';

interface Agent { pos: Vec2; target: Vec2; speed: number; phase: number; heading: number; pause: number }

const AREA = { xMin: -125, xMax: 68, yMin: -72, yMax: 72 };

/**
 * Low-poly humans: six instanced body parts (head, torso, two arms, two legs) animated with a walk cycle.
 * Agents wander between random points, keep out of obstacles and stay clear of the photo spots (avoid zones).
 */
export class Crowd {
  group = new THREE.Group();
  agents: Agent[] = [];
  enabled = true;
  avoid: { c: Vec2; r: number }[] = [];
  private parts: Record<string, THREE.InstancedMesh>;
  private dummy = new THREE.Object3D();
  private skin = [0xe8c4a0, 0xc9906b, 0x8d5a3b, 0x5c3a21, 0xf1d6bd];
  private shirts = [0x3a3f4a, 0x7a2e2e, 0xd9d2c5, 0x2f4f6f, 0x8a7a5a, 0xe0e0e0, 0xb8c0cc, 0x5a3f6a, 0xc9a26b, 0x446a4a, 0xd94f4f, 0x2b2b2b];
  private pants = [0x23252b, 0x3b3f55, 0x6b6b6b, 0x2e4a6b, 0x4a4036, 0xbdb6a6];

  constructor(scene: THREE.Scene, private collision: CollisionWorld, count: number, private speed: number) {
    const mat = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const head = new THREE.SphereGeometry(0.11, 10, 8);
    const torso = new THREE.CapsuleGeometry(0.16, 0.42, 4, 10); torso.scale(1.15, 1, 0.7);
    const arm = new THREE.CapsuleGeometry(0.05, 0.56, 3, 6); arm.translate(0, -0.3, 0);
    const leg = new THREE.CapsuleGeometry(0.07, 0.72, 3, 6); leg.translate(0, -0.4, 0);
    this.parts = {
      head: new THREE.InstancedMesh(head, mat(), count), torso: new THREE.InstancedMesh(torso, mat(), count),
      armL: new THREE.InstancedMesh(arm, mat(), count), armR: new THREE.InstancedMesh(arm, mat(), count),
      legL: new THREE.InstancedMesh(leg, mat(), count), legR: new THREE.InstancedMesh(leg, mat(), count),
    };
    for (let i = 0; i < count; i++) {
      const a: Agent = { pos: [0, 0], target: [0, 0], speed: speed * (0.7 + Math.random() * 0.6), phase: Math.random() * 10, heading: 0, pause: 0 };
      this.agents.push(a);
      const sk = new THREE.Color(this.skin[Math.floor(Math.random() * this.skin.length)]);
      const sh = new THREE.Color(this.shirts[Math.floor(Math.random() * this.shirts.length)]);
      const pa = new THREE.Color(this.pants[Math.floor(Math.random() * this.pants.length)]);
      this.parts.head.setColorAt(i, sk); this.parts.torso.setColorAt(i, sh);
      this.parts.armL.setColorAt(i, Math.random() < 0.5 ? sh : sk); this.parts.armR.setColorAt(i, Math.random() < 0.5 ? sh : sk);
      this.parts.legL.setColorAt(i, pa); this.parts.legR.setColorAt(i, pa);
    }
    for (const m of Object.values(this.parts)) { m.castShadow = true; m.frustumCulled = false; this.group.add(m); }
    scene.add(this.group);
  }

  /** Call once obstacles and avoid zones are registered: places every agent on a valid spot. */
  spawn() {
    for (const a of this.agents) { a.pos = this.randomPoint(); a.target = this.randomPoint(); }
    // colours never change after spawn: upload them once, then let the GPU cull the whole crowd by one sphere
    for (const m of Object.values(this.parts)) { if (m.instanceColor) m.instanceColor.needsUpdate = true; m.frustumCulled = true; }
    this.boundsDirty = true;
  }
  private boundsDirty = false;

  private blocked(p: Vec2): boolean {
    for (const z of this.avoid) if (Math.hypot(p[0] - z.c[0], p[1] - z.c[1]) < z.r) return true;
    return false;
  }

  private randomPoint(): Vec2 {
    for (let k = 0; k < 30; k++) {
      const p: Vec2 = [AREA.xMin + Math.random() * (AREA.xMax - AREA.xMin), AREA.yMin + Math.random() * (AREA.yMax - AREA.yMin)];
      if (this.blocked(p)) continue;
      const r = this.collision.resolveWalk(p, 0.4);
      if (Math.hypot(r[0] - p[0], r[1] - p[1]) < 0.01) return p;
    }
    return [-60, 0];
  }

  setEnabled(on: boolean) { this.enabled = on; this.group.visible = on; }

  update(dt: number, t: number) {
    if (!this.enabled) return;
    const d = this.dummy;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      let moving = false;
      if (a.pause > 0) { a.pause -= dt; }
      else {
        const dx = a.target[0] - a.pos[0], dy = a.target[1] - a.pos[1];
        const dist = Math.hypot(dx, dy);
        if (dist < 1) { a.target = this.randomPoint(); a.pause = Math.random() < 0.3 ? 2 + Math.random() * 5 : 0; }
        else {
          const nx = a.pos[0] + (dx / dist) * a.speed * dt, ny = a.pos[1] + (dy / dist) * a.speed * dt;
          const r = this.collision.resolveWalk([nx, ny], 0.3);
          if (Math.hypot(r[0] - nx, r[1] - ny) > 0.05 || this.blocked(r)) a.target = this.randomPoint();
          else { a.pos = r; a.heading = Math.atan2(dx, -dy) + Math.PI; moving = true; }
        }
      }
      const x = a.pos[0], z = -a.pos[1];
      const swing = moving ? Math.sin(t * 7 + a.phase) * 0.55 : 0;
      const bob = moving ? Math.abs(Math.sin(t * 7 + a.phase)) * 0.03 : 0;
      const set = (mesh: THREE.InstancedMesh, px: number, py: number, pz: number, rx = 0) => {
        d.position.set(x, py + bob, z); d.rotation.set(0, a.heading, 0);
        d.translateX(px); d.translateZ(pz); d.rotateX(rx); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
      };
      set(this.parts.head, 0, 1.62, 0);
      set(this.parts.torso, 0, 1.17, 0);
      set(this.parts.armL, -0.24, 1.42, 0, swing);
      set(this.parts.armR, 0.24, 1.42, 0, -swing);
      set(this.parts.legL, -0.1, 0.86, 0, -swing);
      set(this.parts.legR, 0.1, 0.86, 0, swing);
    }
    for (const m of Object.values(this.parts)) { m.instanceMatrix.needsUpdate = true; }
    if (this.boundsDirty) { for (const m of Object.values(this.parts)) { m.computeBoundingSphere(); if (m.boundingSphere) m.boundingSphere.radius += 20; } this.boundsDirty = false; }
  }
}
