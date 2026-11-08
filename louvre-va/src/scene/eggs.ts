import * as THREE from 'three';
import { config, toThree, type Vec2 } from '../data/config';
import type { CollisionWorld } from '../gameplay/collision';

export interface EggDef { id: string; label: string; pos: Vec2; height: number; radius: number; bonus: number; hint: string }

/**
 * Easter eggs: two props whose silhouette spells a letter, both plausible in the Louvre forecourt.
 * X: a restoration scaffold with Saint Andrew's cross bracing against the west end of the Richelieu wing.
 * C: an Art Nouveau Metro entrance (Guimard style) whose wrought-iron arms curl into a C.
 */
export function buildEggs(scene: THREE.Scene, collision: CollisionWorld): THREE.Group {
  const g = new THREE.Group(); g.name = 'eggs';
  const eggs = config.easterEggs as EggDef[];
  for (const e of eggs) {
    const [x, z] = toThree(e.pos);
    if (e.id === 'X') g.add(scaffold(x, z, collision, e.pos));
    if (e.id === 'C') g.add(metro(x, z, collision, e.pos));
  }
  scene.add(g);
  return g;
}

function scaffold(x: number, z: number, collision: CollisionWorld, pos: Vec2): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x8e9398, roughness: 0.5, metalness: 0.7 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xa8865a, roughness: 0.9 });
  const W = 12, H = 14, D = 2.2;
  // uprights and ledgers (3 bays x 4 lifts)
  for (let i = 0; i <= 3; i++) for (const dz of [0, D]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, H, 6), steel); p.position.set(x - W / 2 + (i * W) / 3, H / 2, z + dz); p.castShadow = true; g.add(p); }
  for (let l = 1; l <= 4; l++) for (const dz of [0, D]) { const b = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, 0.06), steel); b.position.set(x, (l * H) / 4, z + dz); g.add(b); }
  for (let l = 1; l <= 4; l++) { const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, D), wood); deck.position.set(x, (l * H) / 4 + 0.03, z + D / 2); deck.receiveShadow = true; g.add(deck); }
  // Saint Andrew's crosses: two big diagonal planks per bay on the front face, the X the players must find
  for (let i = 0; i < 3; i++) {
    const bx = x - W / 2 + (i * W) / 3 + W / 6; const bw = W / 3; const lift = H / 2;
    const len = Math.hypot(bw, lift);
    for (const sgn of [1, -1]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.22, len, 0.08), wood);
      plank.position.set(bx, H / 2, z + D + 0.08); plank.rotation.z = sgn * Math.atan2(bw, lift); plank.castShadow = true; g.add(plank);
    }
  }
  // green debris netting on the top lift so it reads as a worksite
  const net = new THREE.Mesh(new THREE.PlaneGeometry(W, H / 4), new THREE.MeshStandardMaterial({ color: 0x3f8f5a, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  net.position.set(x, H - H / 8, z + D + 0.02); g.add(net);
  collision.addBox({ xMin: pos[0] - W / 2, xMax: pos[0] + W / 2, yMin: pos[1] - D - 0.2, yMax: pos[1] + 0.2, h: H });
  return g;
}

function metro(x: number, z: number, collision: CollisionWorld, pos: Vec2): THREE.Group {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 0.45, metalness: 0.6 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xbfb7a6, roughness: 0.9 });
  // stair opening with low stone balustrade
  const pit = new THREE.Mesh(new THREE.BoxGeometry(6, 0.9, 3), stone); pit.position.set(x, 0.45, z); g.add(pit);
  const hole = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.3, 2.4), new THREE.MeshStandardMaterial({ color: 0x15171a })); hole.position.set(x, 0.95, z); g.add(hole);
  // two Guimard stalks: each is a big C-curve (torus arc) rising from the balustrade, carrying the red lamp
  for (const side of [-1, 1]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.09, 10, 40, Math.PI * 1.25), iron);
    arc.position.set(x + side * 2.4, 2.6, z - 1.5); arc.rotation.y = Math.PI / 2; arc.rotation.z = side > 0 ? Math.PI * 0.1 : Math.PI * 0.65; arc.castShadow = true; g.add(arc);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 2.2, 8), iron); stalk.position.set(x + side * 2.4, 1.6, z - 1.5); g.add(stalk);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd94a3a, emissive: 0x8a1c10, emissiveIntensity: 0.8, roughness: 0.3 }));
    lamp.position.set(x + side * 2.4, 4.0, z - 2.9); g.add(lamp);
  }
  // METROPOLITAIN sign plate between the stalks
  const sign = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.7, 0.08), new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 0.5, metalness: 0.5 })); sign.position.set(x, 3.6, z - 1.5); g.add(sign);
  const c = document.createElement('canvas'); c.width = 512; c.height = 80; const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2f5a3a'; ctx.fillRect(0, 0, 512, 80); ctx.fillStyle = '#f2d98a'; ctx.font = 'bold 54px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('MÉTROPOLITAIN', 256, 42);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.65), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })); label.position.set(x, 3.6, z - 1.455); g.add(label);
  // railing scrolls along the balustrade: small C hooks
  for (let i = -2; i <= 2; i++) { const hook = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 20, Math.PI * 1.3), iron); hook.position.set(x + i * 1.1, 1.25, z + 1.5); hook.rotation.z = Math.PI * 0.6; g.add(hook); }
  collision.addBox({ xMin: pos[0] - 3.2, xMax: pos[0] + 3.2, yMin: pos[1] - 1.7, yMax: pos[1] + 1.7, h: 4.5 });
  return g;
}

/** Egg in view: its anchor projects inside the frame, within radius, while the camera is up. */
export function eggsInFrame(camera: THREE.Camera, playerPos: Vec2, frame: { x: number; y: number; w: number; h: number }, vw: number, vh: number): string[] {
  const out: string[] = []; const v = new THREE.Vector3();
  for (const e of config.easterEggs as EggDef[]) {
    const d = Math.hypot(playerPos[0] - e.pos[0], playerPos[1] - e.pos[1]); if (d > e.radius) continue;
    const [x, z] = toThree(e.pos); v.set(x, e.height / 2, z).project(camera);
    if (v.z > 1 || v.z < -1) continue;
    const px = ((v.x + 1) / 2) * vw, py = ((1 - v.y) / 2) * vh;
    if (px > frame.x && px < frame.x + frame.w && py > frame.y && py < frame.y + frame.h) out.push(e.id);
  }
  return out;
}
