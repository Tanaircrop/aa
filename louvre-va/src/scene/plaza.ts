import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { config, pools, smallPyramids, toThree, type Vec2 } from '../data/config';
import { CollisionWorld, inflatePolygon } from '../gameplay/collision';
import type { QualitySettings } from '../core/quality';
import { pavingTexture, graniteTexture, asphaltTexture } from './textures';

export interface PlazaResult { group: THREE.Group; water: THREE.Object3D[]; fountains: THREE.Points[]; pyramidCenter: Vec2; pyramidSide: number; pyramidRotDeg: number }

/** Shape in the plan (x, y) plane; rotate the geometry by -PI/2 about X to lay it flat facing up. */
function shapeUp(pts: Vec2[]): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach((p, i) => { if (i === 0) s.moveTo(p[0], p[1]); else s.lineTo(p[0], p[1]); });
  s.closePath();
  return s;
}

function shapeFrom(pts: Vec2[]): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach((p, i) => { const [x, z] = toThree(p); if (i === 0) s.moveTo(x, z); else s.lineTo(x, z); });
  s.closePath();
  return s;
}

/** Pyramid lattice: lines parallel to the two sloping edges of each triangular face, plus horizontal ties. */
function latticeMatrices(center: THREE.Vector3, half: number, height: number, rotRad: number, rows: number, r: number): { mats: THREE.Matrix4[]; edges: THREE.Matrix4[] } {
  const mats: THREE.Matrix4[] = []; const edges: THREE.Matrix4[] = [];
  const apex = new THREE.Vector3(0, height, 0);
  const seg = (a: THREE.Vector3, b: THREE.Vector3, out: THREE.Matrix4[]) => {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a); const len = dir.length(); if (len < 0.05) return;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    out.push(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, len, 1)));
  };
  const faceRot = new THREE.Matrix4().makeRotationY(rotRad);
  for (let f = 0; f < 4; f++) {
    const rotF = new THREE.Matrix4().makeRotationY((f * Math.PI) / 2).premultiply(faceRot);
    const L = new THREE.Vector3(-half, 0, half), R = new THREE.Vector3(half, 0, half);
    const tf = (v: THREE.Vector3) => v.clone().applyMatrix4(rotF).add(center);
    // Face parametrised by t along base (0..1) and s up (0..1); point = L + (R-L)*t*(1-s) + apex*s
    const pt = (t: number, s: number) => L.clone().lerp(R, t).multiplyScalar(1 - s).add(apex.clone().multiplyScalar(s));
    for (let k = 1; k < rows; k++) {
      const t0 = k / rows;
      // parallel to left edge: starts at base t0, ends on right edge where s = 1 - t0 ... constant (t - s-shifted)
      seg(tf(pt(t0, 0)), tf(pt(1, 1 - t0)), mats);
      // parallel to right edge
      seg(tf(pt(1 - t0, 0)), tf(pt(0, 1 - t0)), mats);
      // horizontal tie at row k
      seg(tf(pt(0, t0)), tf(pt(1, t0)), mats);
    }
    seg(tf(L), tf(apex), edges);
    seg(tf(L), tf(R), edges);
  }
  void r;
  return { mats, edges };
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], shadow = true): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = shadow; im.receiveShadow = shadow;
  return im;
}

export function buildPlaza(scene: THREE.Scene, collision: CollisionWorld, settings: QualitySettings): PlazaResult {
  const g = new THREE.Group(); g.name = 'plaza';
  const water: THREE.Object3D[] = [];
  const fountains: THREE.Points[] = [];

  // ground: courtyard paving + surrounding asphalt
  const paving = pavingTexture(); paving.repeat.set(60, 60);
  // MeshPhysicalMaterial with low specularIntensity: dry stone must not turn into a mirror at grazing angles toward the low sun
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(480, 480), new THREE.MeshPhysicalMaterial({ map: paving, roughness: 0.95, metalness: 0, specularIntensity: 0.15, envMapIntensity: 0.4 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(-60, 0, 0); ground.receiveShadow = true; g.add(ground);
  const asphalt = asphaltTexture(); asphalt.repeat.set(400, 400);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshPhysicalMaterial({ map: asphalt, roughness: 1, specularIntensity: 0.1, envMapIntensity: 0.3 }));
  far.rotation.x = -Math.PI / 2; far.position.y = -0.05; far.receiveShadow = true; g.add(far);

  // pools
  const rimH = config.poolRimHeight; const rimW = config.poolRimWidth;
  const granite = new THREE.MeshStandardMaterial({ map: graniteTexture(), roughness: 0.55, metalness: 0.05 });
  const floorM = new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.9 });
  const rimGeos: THREE.BufferGeometry[] = [];
  const waterShapes: THREE.Shape[] = [];
  for (const pool of pools) {
    const outer = inflatePolygon(pool.pts, rimW);
    const shape = shapeFrom(outer); shape.holes.push(new THREE.Path(shapeFrom(pool.pts).getPoints()));
    const rim = new THREE.ExtrudeGeometry(shape, { depth: rimH, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
    rim.rotateX(Math.PI / 2); rim.translate(0, rimH, 0);
    rimGeos.push(rim);
    const floorGeo = new THREE.ShapeGeometry(shapeUp(pool.pts)); floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, floorM); floor.position.y = 0.02; g.add(floor);
    waterShapes.push(shapeUp(pool.pts));
    collision.addPolygon(inflatePolygon(pool.pts, rimW), pool.id);
    collision.pools.push(pool.pts);
  }
  for (const rg of rimGeos) { const m = new THREE.Mesh(rg, granite); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  const waterY = rimH - 0.03;
  const waterGeo = new THREE.ShapeGeometry(waterShapes); waterGeo.rotateX(-Math.PI / 2);
  if (settings.planarReflection) {
    const refl = new Reflector(waterGeo, { textureWidth: 1024, textureHeight: 1024, color: 0x889aa8, clipBias: 0.003 });
    refl.position.y = waterY; refl.rotation.set(0, 0, 0);
    (refl.material as THREE.Material).transparent = true;
    g.add(refl); water.push(refl);
    // thin tinted overlay to give the water a little body
    const tint = new THREE.Mesh(waterGeo.clone(), new THREE.MeshPhysicalMaterial({ color: 0x224455, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.1 }));
    tint.position.y = waterY + 0.005; g.add(tint);
  } else {
    const wm = new THREE.MeshPhysicalMaterial({ color: 0x5f8296, roughness: 0.04, metalness: 0.55, transparent: true, opacity: 0.94, envMapIntensity: 1.8 });
    const w = new THREE.Mesh(waterGeo, wm); w.position.y = waterY; w.receiveShadow = true; g.add(w); water.push(w);
  }

  // fountains: jets along the pyramid side inside the three inner pools
  const jetM = new THREE.PointsMaterial({ color: 0xe8f4ff, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false });
  for (const f of config.fountains) {
    const pool = pools.find((p) => p.id === f.pool)!;
    const a = pool.pts[0], b = pool.pts[2], tip = pool.pts[1];
    const n = f.jets * 60; const pos = new Float32Array(n * 3); const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = i % f.jets; const t = (j + 1) / (f.jets + 1);
      const bx = a[0] + (b[0] - a[0]) * t, by = a[1] + (b[1] - a[1]) * t;
      // move the jet line 5 m into the pool toward the tip
      const cx = bx + (tip[0] - bx) * 0.3, cy = by + (tip[1] - by) * 0.3;
      const [X, Z] = toThree([cx, cy]);
      pos[i * 3] = X; pos[i * 3 + 1] = waterY; pos[i * 3 + 2] = Z; seeds[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    geo.userData.base = pos.slice();
    const pts = new THREE.Points(geo, jetM); pts.frustumCulled = false; g.add(pts); fountains.push(pts);
  }

  // main pyramid: average OSM corners, side calibrated to 35 m as the spec asks
  const c = config.mainPyramid.corners as Vec2[];
  const cx = c.reduce((s, p) => s + p[0], 0) / 4, cy = c.reduce((s, p) => s + p[1], 0) / 4;
  let rot = 0; for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; rot += ((Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI * 4) % (Math.PI / 2)); }
  rot /= 4; if (rot > Math.PI / 4) rot -= Math.PI / 2;
  const side = 35; const H = config.mainPyramid.height;
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.4, metalness: 0.8 });
  const glassHi = new THREE.MeshPhysicalMaterial({ color: 0xdfeef5, transmission: 0.92, thickness: 0.4, roughness: 0.03, metalness: 0, ior: 1.5, envMapIntensity: 1.2, side: THREE.DoubleSide, transparent: true, opacity: 1 });
  const glassLo = new THREE.MeshPhysicalMaterial({ color: 0xc8dde8, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.15, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false });
  const glass = settings.transmission ? glassHi : glassLo;
  const buildPyramid = (center: Vec2, s: number, h: number, rotRad: number, rows: number, radius: number) => {
    const [X, Z] = toThree(center); const pos = new THREE.Vector3(X, 0, Z);
    const geo = new THREE.ConeGeometry(Math.SQRT2 * s / 2, h, 4, 1, true); geo.translate(0, h / 2, 0); geo.rotateY(Math.PI / 4 + rotRad);
    const mesh = new THREE.Mesh(geo, glass); mesh.position.copy(pos); mesh.castShadow = false; mesh.renderOrder = 5; g.add(mesh);
    const { mats, edges } = latticeMatrices(pos, s / 2, h, rotRad, rows, radius);
    g.add(instanced(new THREE.CylinderGeometry(radius, radius, 1, 5), steel, mats, false));
    g.add(instanced(new THREE.CylinderGeometry(radius * 2.2, radius * 2.2, 1, 6), steel, edges));
    const base = new THREE.Mesh(new THREE.BoxGeometry(s + 0.6, 0.12, s + 0.6), granite); base.rotation.y = rotRad; base.position.set(X, 0.06, Z); base.receiveShadow = true; g.add(base);
    // corners for collision
    const corners: Vec2[] = [];
    for (let i = 0; i < 4; i++) { const a = rotRad + Math.PI / 4 + (i * Math.PI) / 2; const rr = (Math.SQRT2 * s) / 2; corners.push([center[0] + Math.cos(a) * rr, center[1] + Math.sin(a) * rr]); }
    collision.addPolygon(corners);
    collision.pyramids.push({ corners, center, halfSize: s / 2, rotRad, height: h });
  };
  buildPyramid([cx, cy], side, H, rot, config.mainPyramid.latticeRows, 0.05);
  for (const sp of smallPyramids) buildPyramid(sp.center, sp.side, sp.height, (sp.rotationDeg * Math.PI) / 180 + rot, 5, 0.03);

  // lamp posts
  const lampMats: THREE.Matrix4[] = []; const lanternMats: THREE.Matrix4[] = [];
  for (const row of config.lampPosts.rows) {
    for (let i = 0; i < row.count; i++) {
      const t = row.count === 1 ? 0 : i / (row.count - 1);
      const p: Vec2 = [row.from[0] + (row.to[0] - row.from[0]) * t, row.from[1] + (row.to[1] - row.from[1]) * t];
      const [X, Z] = toThree(p);
      lampMats.push(new THREE.Matrix4().makeTranslation(X, config.lampPosts.height / 2, Z));
      lanternMats.push(new THREE.Matrix4().makeTranslation(X, config.lampPosts.height + 0.3, Z));
      collision.addCircle(p, 0.25);
    }
  }
  g.add(instanced(new THREE.CylinderGeometry(0.07, 0.12, config.lampPosts.height, 8), steel, lampMats));
  g.add(instanced(new THREE.BoxGeometry(0.5, 0.7, 0.5), new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffd080, emissiveIntensity: 1.6, roughness: 0.4 }), lanternMats, false));

  // Louis XIV equestrian statue (simplified) on its stone base, west of the pyramid
  const st = config.statueLouisXIV; const [sx, sz] = toThree(st.pos as Vec2);
  const bronze = new THREE.MeshStandardMaterial({ color: 0x2f3a2f, roughness: 0.45, metalness: 0.7 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xcfc3a6, roughness: 0.85 });
  const baseM = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 3.2), stone); baseM.position.set(sx, 1.3, sz); baseM.castShadow = true; g.add(baseM);
  const horse = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), bronze); horse.scale.set(2.1, 1, 0.9); horse.position.set(sx, 3.6, sz); horse.castShadow = true; g.add(horse);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.8, 8), bronze); neck.position.set(sx - 2.0, 4.4, sz); neck.rotation.z = 0.8; g.add(neck);
  for (const [lx, lz] of [[-1.2, -0.4], [-1.2, 0.4], [1.0, -0.4], [1.0, 0.4]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 1.6, 6), bronze); leg.position.set(sx + lx, 2.9, sz + lz); g.add(leg); }
  const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 8), bronze); rider.position.set(sx + 0.2, 5.2, sz); rider.castShadow = true; g.add(rider);
  collision.addCircle(st.pos as Vec2, st.baseRadius);

  // Arc du Carrousel (simplified triumphal arch with three openings)
  const arc = config.arcDuCarrousel; const [ax, az] = toThree(arc.pos as Vec2);
  const arcShape = new THREE.Shape(); arcShape.moveTo(-arc.width / 2, 0); arcShape.lineTo(arc.width / 2, 0); arcShape.lineTo(arc.width / 2, 14); arcShape.lineTo(-arc.width / 2, 14); arcShape.closePath();
  const hole = (x: number, w: number, h: number) => { const p = new THREE.Path(); p.moveTo(x - w / 2, 0); p.lineTo(x + w / 2, 0); p.lineTo(x + w / 2, h - w / 2); p.absarc(x, h - w / 2, w / 2, 0, Math.PI, false); p.lineTo(x - w / 2, 0); return p; };
  arcShape.holes.push(hole(0, 4.2, 9.5), hole(-6.2, 2.4, 6), hole(6.2, 2.4, 6));
  const arcGeo = new THREE.ExtrudeGeometry(arcShape, { depth: arc.depth, bevelEnabled: false }); arcGeo.translate(0, 0, -arc.depth / 2);
  const arcMesh = new THREE.Mesh(arcGeo, stone); arcMesh.position.set(ax, 0, az); arcMesh.rotation.y = Math.PI / 2 + (arc.rotationDeg * Math.PI) / 180; arcMesh.castShadow = true; g.add(arcMesh);
  const attic = new THREE.Mesh(new THREE.BoxGeometry(arc.width + 0.4, 3.2, arc.depth + 0.4), stone); attic.position.set(ax, 15.6, az); attic.rotation.y = arcMesh.rotation.y; g.add(attic);
  const quad = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 3), bronze); quad.position.set(ax, 18.4, az); quad.rotation.y = arcMesh.rotation.y; g.add(quad);
  for (const dx of [-7.5, -2.8, 2.8, 7.5]) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 11, 10), new THREE.MeshStandardMaterial({ color: 0xa44a3a, roughness: 0.6 })); col.position.set(ax, 5.5, az + dx); col.castShadow = true; g.add(col); }
  collision.addBox({ xMin: arc.pos[0] - arc.depth / 2, xMax: arc.pos[0] + arc.depth / 2, yMin: arc.pos[1] - arc.width / 2, yMax: arc.pos[1] + arc.width / 2, h: 20, name: 'arc' });

  scene.add(g);
  return { group: g, water, fountains, pyramidCenter: [cx, cy], pyramidSide: side, pyramidRotDeg: (rot * 180) / Math.PI };
}

export function updateFountains(fountains: THREE.Points[], t: number) {
  for (const f of fountains) {
    const a = f.geometry.getAttribute('position') as THREE.BufferAttribute;
    const base = f.geometry.userData.base as Float32Array;
    const seed = f.geometry.getAttribute('seed') as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    for (let i = 0; i < seed.count; i++) {
      const ph = (t * 0.9 + (seed.array as Float32Array)[i]) % 1;
      const h = 2.2 * Math.sin(ph * Math.PI);
      const spread = ph * 0.6;
      arr[i * 3] = base[i * 3] + Math.sin(i * 12.9898) * spread;
      arr[i * 3 + 1] = base[i * 3 + 1] + h;
      arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(i * 78.233) * spread;
    }
    a.needsUpdate = true;
  }
}
