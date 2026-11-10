import * as THREE from 'three';
import { config, pools, toThree, type Vec2 } from '../data/config';
import type { PoolTip } from './answers';
import type { Player } from './player';
import type { PhotoCamera } from './photo';

export interface Composition {
  hasA: boolean;
  hasV: boolean;
  /** nearest pool tip the player is composing from, if any */
  tip: PoolTip | null;
  /** apex sits in the upper third of the frame */
  apexUpper: boolean;
  level: boolean;
}

const tmp = new THREE.Vector3();

function project(camera: THREE.Camera, world: THREE.Vector3, vw: number, vh: number): { x: number; y: number; behind: boolean } {
  tmp.copy(world).project(camera);
  return { x: ((tmp.x + 1) / 2) * vw, y: ((1 - tmp.y) / 2) * vh, behind: tmp.z > 1 || tmp.z < -1 };
}

/**
 * Live read of the composition in the viewfinder.
 * A = the pyramid apex and the base edge facing the player are inside the frame.
 * V = the player stands on a pool tip (within reach), looks roughly along its bisector, and the two pool edges
 *     leave the frame at the bottom (they converge toward the tip under the camera).
 */
export function readComposition(player: Player, photo: PhotoCamera, camera: THREE.Camera, vw: number, vh: number, tips: PoolTip[], pyramidCenter: Vec2): Composition {
  const out: Composition = { hasA: false, hasV: false, tip: null, apexUpper: false, level: Math.abs(player.roll) < (1 * Math.PI) / 180 };
  if (!photo.on) return out;
  const r = photo.frameRect(vw, vh);
  const inFrame = (p: { x: number; y: number; behind: boolean }, slackX = 0, slackY = 0) => !p.behind && p.x > r.x - slackX && p.x < r.x + r.w + slackX && p.y > r.y - slackY && p.y < r.y + r.h + slackY;
  // A
  const [ax, az] = toThree(pyramidCenter);
  const apex = project(camera, new THREE.Vector3(ax, config.mainPyramid.height, az), vw, vh);
  const corners = (config.mainPyramid.corners as Vec2[]).map((c) => { const [x, z] = toThree(c); return project(camera, new THREE.Vector3(x, 0.3, z), vw, vh); });
  const cornersIn = corners.filter((c) => inFrame(c, r.w * 0.15, r.h * 0.3)).length;
  out.hasA = inFrame(apex) && cornersIn >= 2;
  out.apexUpper = inFrame(apex) && apex.y < r.y + r.h * 0.4;
  // V
  // candidate tips within reach; pick the one the player is actually looking along (distance + heading mismatch)
  let best: PoolTip | null = null; let bestD = 0; let bestScore = Infinity;
  for (const t of tips) {
    const d = Math.hypot(player.pos[0] - t.pos[0], player.pos[1] - t.pos[1]); if (d > 7) continue;
    const diff = Math.abs((((player.headingDeg - t.bisectorDeg) % 360) + 540) % 360 - 180);
    const score = d + diff / 12;
    if (score < bestScore) { bestScore = score; best = t; bestD = d; }
  }
  if (best) {
    out.tip = best;
    const diff = Math.abs((((player.headingDeg - best.bisectorDeg) % 360) + 540) % 360 - 180);
    const pool = pools.find((p) => p.id === best!.pool)!; const n = pool.pts.length;
    const a = pool.pts[(best.index + 1) % n], b = pool.pts[(best.index + n - 1) % n];
    const far = [a, b].map((q) => { const [x, z] = toThree(q); return project(camera, new THREE.Vector3(x, config.poolRimHeight, z), vw, vh); });
    const edgesVisible = far.filter((f) => inFrame(f, r.w * 0.6, r.h * 0.6)).length;
    const pitchOk = player.pitch < (12 * Math.PI) / 180 && player.pitch > (-40 * Math.PI) / 180;
    out.hasV = diff < 32 && pitchOk && edgesVisible >= 1 && bestD < 6;
  }
  return out;
}
