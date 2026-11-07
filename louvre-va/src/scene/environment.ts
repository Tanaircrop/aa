import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { config, lightingPresets, type LightingPreset } from '../data/config';
import { sunPosition, sunDirectionThree } from '../core/solar';
import type { QualitySettings } from '../core/quality';

export class Environment {
  sky: Sky;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  rain: THREE.Points | null = null;
  presetId: string;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  sunDir = new THREE.Vector3(0, 1, 0);
  private overcastDome: THREE.Mesh;

  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer, private settings: QualitySettings) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.sky = new Sky();
    this.sky.scale.setScalar(50000);
    scene.add(this.sky);
    // plain grey gradient dome for the overcast preset (the Sky shader blows out at high turbidity)
    this.overcastDome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      // linear radiance: bright grey near the horizon, darker grey overhead, tone mapped like the rest of the scene
      uniforms: { top: { value: new THREE.Vector3(0.75, 0.8, 0.88) }, bottom: { value: new THREE.Vector3(1.7, 1.75, 1.8) } },
      vertexShader: 'varying vec3 vW; void main(){ vW = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); p.z = p.w; gl_Position = p; }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vW; void main(){ float t = clamp(vW.y * 1.6 + 0.1, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, t), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    }));
    this.overcastDome.scale.setScalar(5000); this.overcastDome.visible = false; this.overcastDome.frustumCulled = false;
    scene.add(this.overcastDome);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = settings.shadows;
    const s = this.sun.shadow;
    s.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    s.camera.near = 10; s.camera.far = 700;
    s.camera.left = -220; s.camera.right = 220; s.camera.top = 220; s.camera.bottom = -220;
    s.bias = -0.0004; s.normalBias = 0.6;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a7a60, 0.5);
    scene.add(this.hemi);
    this.presetId = config.lighting.default;
    this.applyPreset(this.presetId);
  }

  get preset(): LightingPreset { return lightingPresets[this.presetId]; }

  applyPreset(id: string) {
    const p = lightingPresets[id];
    if (!p) return;
    this.presetId = id;
    const date = new Date(p.utc);
    const { azimuth, elevation } = sunPosition(date, config.latitude, config.longitude);
    const [x, y, z] = sunDirectionThree(azimuth, Math.max(elevation, p.sky === 'overcast' ? 25 : elevation), config.courtyardRotationDeg);
    this.sunDir.set(x, y, z).normalize();
    const u = this.sky.material.uniforms;
    u.turbidity.value = p.turbidity;
    u.rayleigh.value = p.rayleigh;
    u.mieCoefficient.value = p.sky === 'overcast' ? 0.08 : 0.005;
    u.mieDirectionalG.value = p.sky === 'overcast' ? 0.6 : 0.8;
    u.sunPosition.value.copy(this.sunDir);
    this.sun.position.copy(this.sunDir).multiplyScalar(400);
    this.sun.target.position.set(0, 0, 0);
    const warm = elevation < 12;
    this.sun.color.set(p.sky === 'overcast' ? 0xbfc6cf : warm ? 0xffb070 : 0xfff2dc);
    this.sun.intensity = p.sunIntensity;
    // keep castShadow constant: toggling it recompiles every material (long hitch)
    this.hemi.intensity = p.ambient;
    this.hemi.color.set(p.sky === 'overcast' ? 0x9aa3ad : warm ? 0xffc9a0 : 0xbfd7ff);
    this.hemi.groundColor.set(p.sky === 'overcast' ? 0x4c4a46 : 0x7d6d55);
    this.scene.fog = new THREE.FogExp2(p.sky === 'overcast' ? 0x9ea4aa : warm ? 0xe8c9a6 : 0xd8e4f2, p.fog);
    // environment map from the sky for glass and water reflections
    this.envRT?.dispose();
    const overcast = p.sky === 'overcast';
    this.sky.visible = !overcast; this.overcastDome.visible = overcast;
    const tmp = new THREE.Scene(); const src = overcast ? this.overcastDome : this.sky; tmp.add(src); src.visible = true;
    this.envRT = this.pmrem.fromScene(tmp as unknown as THREE.Scene, 0.04);
    this.scene.add(src);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = p.envIntensity ?? 0.7;
    this.renderer.toneMappingExposure = p.exposure ?? 1.0;
    this.setRain(!!p.rain);
  }

  private setRain(on: boolean) {
    if (!on) { if (this.rain) { this.scene.remove(this.rain); this.rain = null; } return; }
    if (this.rain) return;
    const n = 4000; const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 80; pos[i * 3 + 1] = Math.random() * 40; pos[i * 3 + 2] = (Math.random() - 0.5) * 80; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xb8c4d0, size: 0.08, transparent: true, opacity: 0.55, depthWrite: false });
    this.rain = new THREE.Points(g, m); this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  update(dt: number, camera: THREE.Camera) {
    // keep the shadow frustum centred on the player
    const cp = camera.position;
    this.sun.position.copy(this.sunDir).multiplyScalar(400).add(new THREE.Vector3(cp.x, 0, cp.z));
    this.sun.target.position.set(cp.x, 0, cp.z);
    if (this.rain) {
      this.rain.position.set(cp.x, 0, cp.z);
      const a = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      for (let i = 1; i < arr.length; i += 3) { arr[i] -= dt * 14; if (arr[i] < 0) arr[i] += 40; }
      a.needsUpdate = true;
    }
  }
}

/** Distant Paris: Tuileries trees, Eiffel tower, Grande Roue, surrounding blocks. Everything is in the courtyard frame. */
export function buildBackground(scene: THREE.Scene) {
  const g = new THREE.Group(); g.name = 'background';
  const rot = (config.courtyardRotationDeg * Math.PI) / 180;
  const toLocal = (trueMathDeg: number, dist: number): [number, number] => {
    const a = (trueMathDeg * Math.PI) / 180 + rot; return [Math.cos(a) * dist, -Math.sin(a) * dist];
  };
  const stone = new THREE.MeshStandardMaterial({ color: 0xc9bca0, roughness: 0.9 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x3b4650, roughness: 0.8 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.6, metalness: 0.4 });

  // Haussmann blocks ring (not in front of the courtyard opening west)
  const blocks: THREE.Matrix4[] = []; const roofs: THREE.Matrix4[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 160; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 520 + Math.random() * 900;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    if (x < -300 && Math.abs(z) < 180 && dist < 1300) continue; // Tuileries axis stays open
    const w = 40 + Math.random() * 70, d = 30 + Math.random() * 50, h = 18 + Math.random() * 8;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(w, h, d));
    blocks.push(m);
    roofs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h + 2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(w, 4, d * 0.8)));
  }
  const bi = new THREE.InstancedMesh(box, stone, blocks.length); blocks.forEach((m, i) => bi.setMatrixAt(i, m)); g.add(bi);
  const ri = new THREE.InstancedMesh(box, roof, roofs.length); roofs.forEach((m, i) => ri.setMatrixAt(i, m)); g.add(ri);

  // Cour Carrée block east of Sully, Rivoli / Seine-side blocks
  const near = [
    { x: 160, z: 0, w: 130, d: 170, h: 24 },
    { x: -150, z: -130, w: 700, d: 26, h: 20 },
    { x: -150, z: 150, w: 700, d: 30, h: 20 },
  ];
  for (const b of near) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), stone); m.position.set(b.x, b.h / 2, b.z); m.castShadow = true; m.receiveShadow = true; g.add(m);
    const r = new THREE.Mesh(new THREE.BoxGeometry(b.w, 5, b.d * 0.85), roof); r.position.set(b.x, b.h + 2.5, b.z); g.add(r);
  }

  // Tuileries garden: rows of trees west of the Carrousel
  const trunk = new THREE.CylinderGeometry(0.3, 0.4, 5, 6); const crown = new THREE.SphereGeometry(4, 8, 6);
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 });
  const crownM = new THREE.MeshStandardMaterial({ color: 0x3f6a2e, roughness: 1 });
  const trees: THREE.Vector3[] = [];
  for (let x = -340; x > -900; x -= 9) for (const zRow of [-110, -95, -80, -65, 65, 80, 95, 110]) trees.push(new THREE.Vector3(x + (Math.random() - 0.5) * 2, 0, zRow + (Math.random() - 0.5) * 2));
  const ti = new THREE.InstancedMesh(trunk, trunkM, trees.length); const ci = new THREE.InstancedMesh(crown, crownM, trees.length);
  trees.forEach((p, i) => { ti.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, 2.5, p.z)); const s = 0.8 + Math.random() * 0.5; ci.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.x, 7.5, p.z), new THREE.Quaternion(), new THREE.Vector3(s, s, s))); });
  g.add(ti, ci);

  // Eiffel tower: ~3 km to the WSW, 330 m tall (true bearing from the pyramid ~ 185.5 deg math angle)
  const [ex, ez] = toLocal(185.5, 3000);
  const eiffel = new THREE.Group();
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [lx, lz] of legs) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 4, 120, 6), iron);
    leg.position.set(lx * 40, 60, lz * 40); leg.rotation.z = -lx * 0.42; leg.rotation.x = lz * 0.42; eiffel.add(leg);
  }
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(70, 6, 70), iron); p1.position.y = 58; eiffel.add(p1);
  const p2 = new THREE.Mesh(new THREE.BoxGeometry(40, 5, 40), iron); p2.position.y = 115; eiffel.add(p2);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(2, 14, 215, 6), iron); spire.position.y = 220; eiffel.add(spire);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2, 24, 5), iron); tip.position.y = 338; eiffel.add(tip);
  eiffel.position.set(ex, 0, ez); g.add(eiffel);

  // Grande Roue at Concorde, on the axis ~1.3 km west
  const [wx, wz] = toLocal(154.4, 1300);
  const wheel = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(30, 1.2, 8, 48), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }));
  wheel.add(ring);
  for (let i = 0; i < 16; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 60, 0.6), new THREE.MeshStandardMaterial({ color: 0xeeeeee })); sp.rotation.z = (i * Math.PI) / 16; wheel.add(sp); }
  wheel.position.set(wx, 34, wz); wheel.rotation.y = Math.PI / 2 - rot; g.add(wheel);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(1, 2, 34, 6), iron); post.position.set(wx, 17, wz); g.add(post);

  scene.add(g);
  return g;
}
