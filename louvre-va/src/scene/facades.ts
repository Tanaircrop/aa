import * as THREE from 'three';
import { config, wings, type Wing } from '../data/config';
import { CollisionWorld } from '../gameplay/collision';
import { limestoneTexture, slateTexture } from './textures';

type M4 = THREE.Matrix4;
const V = THREE.Vector3; const Q = THREE.Quaternion;

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: M4[], shadow = true): THREE.InstancedMesh | null {
  if (!mats.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = shadow; im.receiveShadow = shadow;
  return im;
}
const at = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0) =>
  new THREE.Matrix4().compose(new V(x, y, z), new Q().setFromAxisAngle(new V(0, 1, 0), ry), new V(sx, sy, sz));

export interface FacadeMaterials { limestone: THREE.Material; limestoneDark: THREE.Material; slate: THREE.Material; zinc: THREE.Material; glass: THREE.Material; interior: THREE.Material; bronze: THREE.Material }

export function facadeMaterials(): FacadeMaterials {
  const lime = limestoneTexture(); lime.repeat.set(1, 1);
  const limeMat = new THREE.MeshStandardMaterial({ map: lime, roughness: 0.85, metalness: 0.0 });
  const limeDark = new THREE.MeshStandardMaterial({ map: lime, color: 0xb9ab8c, roughness: 0.9 });
  const slate = slateTexture();
  return {
    limestone: limeMat,
    limestoneDark: limeDark,
    slate: new THREE.MeshStandardMaterial({ map: slate, roughness: 0.75, metalness: 0.1 }),
    zinc: new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.45, metalness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0e141a, roughness: 0.35, metalness: 0.35, envMapIntensity: 0.6 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x17120d, roughness: 1 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x3c3a33, roughness: 0.5, metalness: 0.5 }),
  };
}

/**
 * Build one wing in a local frame: X along the facade (s), Z toward the courtyard (front face at z = 0), Y up.
 * The group is then placed so the facade line matches scene.config.json.
 */
function buildWing(w: Wing, mats: FacadeMaterials, detail: number, collision: CollisionWorld): THREE.Group {
  const F = config.facade;
  const g = new THREE.Group(); g.name = 'wing-' + w.id;
  const isEast = w.side === 'east';
  const sFrom = isEast ? -(w.yTo as number) : w.side === 'north' ? (w.xFrom as number) : -(w.xTo as number);
  const sTo = isEast ? -(w.yFrom as number) : w.side === 'north' ? (w.xTo as number) : -(w.xFrom as number);
  const pavS = (px: number) => (isEast ? -px : w.side === 'north' ? px : -px);
  const length = sTo - sFrom; const mid = (sFrom + sTo) / 2;
  const D = w.depth; const T = F.wallThickness;
  const pav = w.pavilions.map((p) => ({ s: pavS(p.x), w: p.width, dome: !!p.dome, name: p.name }));
  const inPavilion = (s: number) => pav.find((p) => Math.abs(s - p.s) < p.w / 2);

  // main body: ground floor recessed by the wall thickness (arcade), upper floors flush
  const body1 = new THREE.Mesh(new THREE.BoxGeometry(length, F.groundFloorHeight, D - T), mats.limestoneDark);
  body1.position.set(mid, F.groundFloorHeight / 2, -T - (D - T) / 2); body1.receiveShadow = true; body1.castShadow = true; g.add(body1);
  const body2 = new THREE.Mesh(new THREE.BoxGeometry(length, F.corniceHeight - F.groundFloorHeight, D), mats.limestone);
  body2.position.set(mid, F.groundFloorHeight + (F.corniceHeight - F.groundFloorHeight) / 2, -D / 2); body2.receiveShadow = true; body2.castShadow = true; g.add(body2);
  // dark strip behind the arcade so the arches read as recessed openings
  const interior = new THREE.Mesh(new THREE.PlaneGeometry(length, F.groundFloorHeight), mats.interior);
  interior.position.set(mid, F.groundFloorHeight / 2, -T + 0.05); g.add(interior);

  // arcade spandrel pieces per bay (extruded wall with an arch opening)
  const archShape = new THREE.Shape();
  archShape.moveTo(-F.bayWidth / 2, 0); archShape.lineTo(F.bayWidth / 2, 0); archShape.lineTo(F.bayWidth / 2, F.groundFloorHeight); archShape.lineTo(-F.bayWidth / 2, F.groundFloorHeight); archShape.closePath();
  const hole = new THREE.Path();
  const aw = F.archWidth / 2;
  hole.moveTo(-aw, 0); hole.lineTo(aw, 0); hole.lineTo(aw, F.archSpring); hole.absarc(0, F.archSpring, aw, 0, Math.PI, false); hole.lineTo(-aw, 0);
  archShape.holes.push(hole);
  const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: T, bevelEnabled: false }); archGeo.translate(0, 0, -T);
  const arches: M4[] = []; const windows: M4[] = []; const frames: M4[] = []; const columns: M4[] = []; const caps: M4[] = [];
  const attics: M4[] = []; const balusters: M4[] = []; const dormers: M4[] = []; const chimneys: M4[] = []; const statues: M4[] = []; const keystones: M4[] = [];
  const nBays = Math.floor(length / F.bayWidth);
  const bayStart = mid - (nBays * F.bayWidth) / 2;
  const y1 = F.groundFloorHeight; const y2 = y1 + F.firstFloorHeight;
  for (let i = 0; i < nBays; i++) {
    const s = bayStart + (i + 0.5) * F.bayWidth;
    const p = inPavilion(s);
    const front = p ? 2.5 : 0;
    arches.push(at(s, 0, front));
    keystones.push(at(s, F.archSpring + aw + 0.2, front + 0.15, 0.6, 0.9, 0.3));
    // first floor window + frame
    windows.push(at(s, y1 + 1.2 + F.windowHeight / 2, front + 0.03, F.windowWidth, F.windowHeight, 0.05));
    frames.push(at(s, y1 + 1.2 + F.windowHeight / 2, front + 0.08, F.windowWidth + 0.5, F.windowHeight + 0.5, 0.12));
    // paired columns on the bay boundaries
    for (const off of [-0.55, 0.55]) {
      const cs = bayStart + i * F.bayWidth + off;
      columns.push(at(cs, y1 + (F.firstFloorHeight - 0.4) / 2 + 0.2, front + 0.45, 1, F.firstFloorHeight - 0.6, 1));
      caps.push(at(cs, y2 - 0.35, front + 0.45, 0.95, 0.35, 0.95));
    }
    // attic window
    attics.push(at(s, y2 + F.atticHeight / 2, front + 0.03, F.windowWidth * 0.8, F.atticHeight * 0.5, 0.05));
    if (detail >= 0.7) {
      for (let b = 0; b < 6; b++) balusters.push(at(bayStart + i * F.bayWidth + (b + 0.5) * (F.bayWidth / 6), y1 + 0.45, front + 0.55, 1, 1, 1));
      if (!p) dormers.push(at(s, F.corniceHeight + 2.2, -1.2));
    }
    if (detail >= 0.9 && i % 3 === 1 && !p) chimneys.push(at(s, F.corniceHeight + F.roofHeight + 1.2, -D / 2));
  }
  const col = instanced(new THREE.CylinderGeometry(0.38, 0.42, 1, 10), mats.limestone, columns); if (col) g.add(col);
  const cap = instanced(new THREE.BoxGeometry(1, 1, 1), mats.limestone, caps); if (cap) g.add(cap);
  const arch = instanced(archGeo, mats.limestone, arches); if (arch) g.add(arch);
  const key = instanced(new THREE.BoxGeometry(1, 1, 1), mats.limestoneDark, keystones, false); if (key) g.add(key);
  const win = instanced(new THREE.BoxGeometry(1, 1, 1), mats.glass, windows, false); if (win) g.add(win);
  const fr = instanced(new THREE.BoxGeometry(1, 1, 1), mats.limestoneDark, frames, false); if (fr) g.add(fr);
  const att = instanced(new THREE.BoxGeometry(1, 1, 1), mats.glass, attics, false); if (att) g.add(att);
  const bal = instanced(new THREE.CylinderGeometry(0.09, 0.12, 0.9, 6), mats.limestone, balusters, false); if (bal) g.add(bal);
  // ledges: balustrade rail, string course, main cornice
  const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.18, 0.7), mats.limestone); rail.position.set(mid, y1 + 0.95, 0.5); g.add(rail);
  const course = new THREE.Mesh(new THREE.BoxGeometry(length, 0.5, 0.9), mats.limestone); course.position.set(mid, y1, 0.3); course.castShadow = true; g.add(course);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(length, 0.9, 1.4), mats.limestone); cornice.position.set(mid, F.corniceHeight - 0.45, 0.5); cornice.castShadow = true; g.add(cornice);
  // mansard roof (trapezoid profile extruded along the wing)
  const prof = new THREE.Shape(); prof.moveTo(0.3, F.corniceHeight); prof.lineTo(-D - 0.3, F.corniceHeight); prof.lineTo(-D + 2.2, F.corniceHeight + F.roofHeight); prof.lineTo(-2.2, F.corniceHeight + F.roofHeight); prof.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(prof, { depth: length, bevelEnabled: false });
  // ExtrudeGeometry: shape in XY (here: X = depth axis, Y = up), extruded along Z; rotate so extrusion runs along local X
  // rotateY(-90deg): extrusion Z -> -X, shape X (depth) -> Z. Then shift so the roof spans sFrom..sTo.
  roofGeo.rotateY(-Math.PI / 2); roofGeo.translate(sTo, 0, 0);
  const roof = new THREE.Mesh(roofGeo, mats.slate); roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
  const dor = instanced(new THREE.BoxGeometry(1.6, 1.8, 1.6), mats.zinc, dormers); if (dor) g.add(dor);
  const chim = instanced(new THREE.BoxGeometry(1.2, 2.4, 1.0), mats.limestoneDark, chimneys); if (chim) g.add(chim);

  // pavilions: taller block in front with a square dome roof and statues on the roofline
  for (const p of pav) {
    const ph = F.corniceHeight + F.pavilionExtraHeight;
    const block = new THREE.Mesh(new THREE.BoxGeometry(p.w, ph - F.groundFloorHeight, 2.5 + 3), mats.limestone);
    block.position.set(p.s, F.groundFloorHeight + (ph - F.groundFloorHeight) / 2, 2.5 - (2.5 + 3) / 2); block.castShadow = true; block.receiveShadow = true; g.add(block);
    const base = new THREE.Mesh(new THREE.BoxGeometry(p.w, F.groundFloorHeight, 3 + 2.5 - T), mats.limestoneDark);
    base.position.set(p.s, F.groundFloorHeight / 2, 2.5 - T - (3 + 2.5 - T) / 2); g.add(base);
    const pint = new THREE.Mesh(new THREE.PlaneGeometry(p.w, F.groundFloorHeight), mats.interior); pint.position.set(p.s, F.groundFloorHeight / 2, 2.5 - T + 0.05); g.add(pint);
    const pc = new THREE.Mesh(new THREE.BoxGeometry(p.w + 1, 1.0, 4), mats.limestone); pc.position.set(p.s, ph - 0.5, 1.3); pc.castShadow = true; g.add(pc);
    // pediment
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0, p.w * 0.42, 3.2, 3, 1), mats.limestone); ped.rotation.y = Math.PI / 6; ped.scale.set(1, 1, 0.3); ped.position.set(p.s, ph + 1.6, 2.2); g.add(ped);
    // roof: steep square dome (truncated pyramid) + lantern
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(2.5, p.w * 0.62, F.domeHeight, 4, 1), mats.slate);
    dome.rotation.y = Math.PI / 4; dome.position.set(p.s, ph + F.domeHeight / 2, -D / 2 + 3); dome.castShadow = true; g.add(dome);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 3.5, 8), mats.zinc); lantern.position.set(p.s, ph + F.domeHeight + 1.7, -D / 2 + 3); g.add(lantern);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 8), mats.zinc); finial.position.set(p.s, ph + F.domeHeight + 5, -D / 2 + 3); g.add(finial);
    if (detail >= 0.7) for (let i = -2; i <= 2; i++) statues.push(at(p.s + i * (p.w / 5), ph + 1.5, 3.2, 1, 1, 1));
    if (p.dome) { const clock = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 24), new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.4 })); clock.rotation.x = Math.PI / 2; clock.position.set(p.s, F.corniceHeight + 2.5, 5.1); g.add(clock); }
  }
  const statGeo = new THREE.CapsuleGeometry(0.45, 1.6, 4, 8); statGeo.translate(0, 1.2, 0);
  const stat = instanced(statGeo, mats.limestoneDark, statues); if (stat) g.add(stat);

  // collisions: body box + pavilion boxes in plan coordinates (done by the caller through the group transform)
  void collision;
  return g;
}

export function buildFacades(scene: THREE.Scene, collision: CollisionWorld, detail: number): THREE.Group {
  const mats = facadeMaterials();
  const root = new THREE.Group(); root.name = 'facades';
  for (const w of wings) {
    const g = buildWing(w, mats, detail, collision);
    if (w.side === 'north') { g.position.set(0, 0, -(w.facadeY as number)); g.rotation.y = 0; }
    else if (w.side === 'south') { g.position.set(0, 0, -(w.facadeY as number)); g.rotation.y = Math.PI; }
    else { g.position.set(w.facadeX as number, 0, 0); g.rotation.y = -Math.PI / 2; }
    root.add(g);
    const F = config.facade; const top = F.corniceHeight + F.roofHeight + 2;
    if (w.side === 'north') collision.addBox({ xMin: w.xFrom as number, xMax: w.xTo as number, yMin: w.facadeY as number, yMax: (w.facadeY as number) + w.depth, h: top, name: w.id });
    else if (w.side === 'south') collision.addBox({ xMin: w.xFrom as number, xMax: w.xTo as number, yMin: (w.facadeY as number) - w.depth, yMax: w.facadeY as number, h: top, name: w.id });
    else collision.addBox({ xMin: w.facadeX as number, xMax: (w.facadeX as number) + w.depth, yMin: w.yFrom as number, yMax: w.yTo as number, h: top, name: w.id });
    for (const p of w.pavilions) {
      const half = p.width / 2; const hp = F.corniceHeight + F.pavilionExtraHeight + F.domeHeight + 6;
      if (w.side === 'north') collision.addBox({ xMin: p.x - half, xMax: p.x + half, yMin: (w.facadeY as number) - 2.5, yMax: (w.facadeY as number) + w.depth, h: hp });
      else if (w.side === 'south') collision.addBox({ xMin: p.x - half, xMax: p.x + half, yMin: (w.facadeY as number) - w.depth, yMax: (w.facadeY as number) + 2.5, h: hp });
      else collision.addBox({ xMin: (w.facadeX as number) - 2.5, xMax: (w.facadeX as number) + w.depth, yMin: p.x - half, yMax: p.x + half, h: hp });
    }
  }
  scene.add(root);
  return root;
}
