import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CollisionWorld } from '../gameplay/collision';
import type { Vec2 } from '../data/config';

interface Agent { pos: Vec2; target: Vec2; speed: number; phase: number }

const AREA = { xMin: -125, xMax: 68, yMin: -72, yMax: 72 };

export class Crowd {
  mesh: THREE.InstancedMesh;
  agents: Agent[] = [];
  enabled = true;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, private collision: CollisionWorld, count: number, private speed: number) {
    const body = new THREE.CapsuleGeometry(0.22, 0.9, 3, 8); body.translate(0, 1.0, 0);
    const head = new THREE.SphereGeometry(0.14, 8, 6); head.translate(0, 1.72, 0);
    const legs = new THREE.CylinderGeometry(0.2, 0.17, 0.55, 6); legs.translate(0, 0.28, 0);
    const geo = mergeGeometries([body, head, legs]);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.castShadow = true;
    const palette = [0x3a3f4a, 0x7a2e2e, 0xd9d2c5, 0x2f4f6f, 0x8a7a5a, 0x1f1f1f, 0xb8c0cc, 0x5a3f6a, 0xe0b090, 0x446a4a];
    for (let i = 0; i < count; i++) {
      const a: Agent = { pos: this.randomPoint(), target: this.randomPoint(), speed: speed * (0.7 + Math.random() * 0.6), phase: Math.random() * 10 };
      this.agents.push(a);
      this.mesh.setColorAt(i, new THREE.Color(palette[i % palette.length]));
    }
    scene.add(this.mesh);
  }

  private randomPoint(): Vec2 {
    for (let k = 0; k < 20; k++) {
      const p: Vec2 = [AREA.xMin + Math.random() * (AREA.xMax - AREA.xMin), AREA.yMin + Math.random() * (AREA.yMax - AREA.yMin)];
      const r = this.collision.resolveWalk(p, 0.4);
      if (Math.hypot(r[0] - p[0], r[1] - p[1]) < 0.01) return p;
    }
    return [-60, 0];
  }

  setEnabled(on: boolean) { this.enabled = on; this.mesh.visible = on; }

  update(dt: number, t: number) {
    if (!this.enabled) return;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      const dx = a.target[0] - a.pos[0], dy = a.target[1] - a.pos[1];
      const d = Math.hypot(dx, dy);
      if (d < 1) { a.target = this.randomPoint(); continue; }
      const nx = a.pos[0] + (dx / d) * a.speed * dt, ny = a.pos[1] + (dy / d) * a.speed * dt;
      const r = this.collision.resolveWalk([nx, ny], 0.3);
      if (Math.hypot(r[0] - nx, r[1] - ny) > 0.05) a.target = this.randomPoint();
      a.pos = r;
      this.dummy.position.set(r[0], Math.abs(Math.sin(t * 6 + a.phase)) * 0.03, -r[1]);
      this.dummy.rotation.set(0, Math.atan2(dx, -dy) + Math.PI, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
