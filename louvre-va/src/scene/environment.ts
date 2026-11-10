import * as THREE from 'three';
import { config, lightingPresets, type LightingPreset } from '../data/config';
import { sunPosition, sunDirectionThree } from '../core/solar';
import type { QualitySettings } from '../core/quality';

export class Environment {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  rain: THREE.Points | null = null;
  private clouds: THREE.Group | null = null;
  presetId: string;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  sunDir = new THREE.Vector3(0, 1, 0);
  private overcastDome: THREE.Mesh;

  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer, private settings: QualitySettings) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    // Sky dome with explicit HDR colours per preset: zenith -> horizon gradient, warmer band toward the sun,
    // sun disc + halo. Radiance stays in a range ACES handles, so the sky keeps its blue at any sun height.
    this.overcastDome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Vector3(0.2, 0.42, 1.0) }, bottom: { value: new THREE.Vector3(0.9, 0.98, 1.15) },
        bottomSun: { value: new THREE.Vector3(1.1, 1.1, 1.15) }, sunColor: { value: new THREE.Vector3(9, 8.5, 8) },
        ground: { value: new THREE.Vector3(0.35, 0.3, 0.25) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunGlow: { value: 1 },
      },
      vertexShader: 'varying vec3 vW; void main(){ vW = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); p.z = p.w; gl_Position = p; }',
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 bottomSun; uniform vec3 sunColor; uniform vec3 ground; uniform vec3 sunDir; uniform float sunGlow; varying vec3 vW;
        void main(){
          vec3 d = normalize(vW);
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          float t = pow(clamp(d.y, 0.0, 1.0), 0.55);
          vec3 horizon = mix(bottom, bottomSun, pow(sd, 4.0));
          vec3 c = mix(horizon, top, t);
          if (d.y < 0.0) c = mix(bottom, ground, clamp(-d.y * 4.0, 0.0, 1.0));
          c += sunColor * sunGlow * (pow(sd, 1200.0) * 1.0 + pow(sd, 40.0) * 0.08 + pow(sd, 6.0) * 0.03);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.overcastDome.scale.setScalar(5000); this.overcastDome.frustumCulled = false;
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
    const dome = this.overcastDome.material as THREE.ShaderMaterial;
    const sc = p.skyColors ?? { zenith: [0.2, 0.42, 1.0], horizon: [0.9, 0.98, 1.15], horizonSun: [1.1, 1.1, 1.15], sun: [9, 8.5, 8] };
    const setDome = (zen: number[], hor: number[], horSun: number[], sun: number[], ground: number[], glow: number) => {
      (dome.uniforms.top.value as THREE.Vector3).fromArray(zen); (dome.uniforms.bottom.value as THREE.Vector3).fromArray(hor);
      (dome.uniforms.bottomSun.value as THREE.Vector3).fromArray(horSun); (dome.uniforms.sunColor.value as THREE.Vector3).fromArray(sun);
      (dome.uniforms.ground.value as THREE.Vector3).fromArray(ground); (dome.uniforms.sunDir.value as THREE.Vector3).copy(this.sunDir); dome.uniforms.sunGlow.value = glow;
    };
    // environment light: softer colours, no sun disc (it would dominate the irradiance)
    const col = p.env ?? { top: sc.zenith, bottom: sc.horizon, ground: [0.35, 0.3, 0.25] };
    setDome(col.top, col.bottom, col.bottom, [0, 0, 0], col.ground, 0);
    const tmp = new THREE.Scene(); tmp.add(this.overcastDome);
    this.envRT = this.pmrem.fromScene(tmp as unknown as THREE.Scene, 0.04);
    this.scene.add(this.overcastDome);
    setDome(sc.zenith, sc.horizon, sc.horizonSun, sc.sun, col.ground, 1);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = p.envIntensity ?? 0.7;
    this.renderer.toneMappingExposure = p.exposure ?? 1.0;
    this.setRain(!!p.rain);
    this.setClouds(p.clouds ?? 0);
  }

  private cloudTexture(seed: number): THREE.CanvasTexture {
    const size = 256; const c = document.createElement('canvas'); c.width = size; c.height = size; const ctx = c.getContext('2d')!;
    let st = seed; const rnd = () => { st = (st * 1664525 + 1013904223) % 4294967296; return st / 4294967296; };
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < 26; i++) {
      const x = size * (0.25 + rnd() * 0.5), y = size * (0.35 + rnd() * 0.35), r = size * (0.08 + rnd() * 0.16);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const bright = 0.75 + 0.25 * (1 - y / size);
      g.addColorStop(0, `rgba(255,255,255,${0.95 * bright})`); g.addColorStop(0.5, `rgba(250,252,255,${0.6 * bright})`); g.addColorStop(1, 'rgba(240,244,250,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // flatter, slightly grey base
    const base = ctx.createLinearGradient(0, size * 0.55, 0, size * 0.8);
    base.addColorStop(0, 'rgba(0,0,0,0)'); base.addColorStop(1, 'rgba(150,160,180,0.22)');
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = base; ctx.fillRect(0, 0, size, size); ctx.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  private setClouds(coverage: number) {
    if (this.clouds) { this.scene.remove(this.clouds); this.clouds = null; }
    if (coverage <= 0) return;
    const g = new THREE.Group(); g.name = 'clouds';
    const texs = [this.cloudTexture(11), this.cloudTexture(29), this.cloudTexture(47)];
    let st = 7; const rnd = () => { st = (st * 1664525 + 1013904223) % 4294967296; return st / 4294967296; };
    const n = Math.round(90 * coverage);
    for (let i = 0; i < n; i++) {
      const ang = rnd() * Math.PI * 2; const dist = 1200 + rnd() * 3000; const alt = 500 + rnd() * 450 + dist * 0.1;
      const w = 700 + rnd() * 1100; const h = w * (0.4 + rnd() * 0.25);
      // not tone mapped: clouds stay white whatever the preset exposure is
      const m = new THREE.SpriteMaterial({ map: texs[i % 3], transparent: true, depthWrite: false, opacity: 1, fog: false, toneMapped: false });
      const sp = new THREE.Sprite(m); sp.position.set(Math.cos(ang) * dist, alt, Math.sin(ang) * dist); sp.scale.set(w, h, 1); sp.renderOrder = -1;
      g.add(sp);
    }
    this.clouds = g; this.scene.add(g);
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
    if (this.clouds) { this.clouds.position.set(cp.x, 0, cp.z); this.clouds.rotation.y += dt * 0.0015; }
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
  const cc = config.courCarree; const cw = cc.depth; const ch = cc.height;
  const near = [
    // Cour Carree: four wings around a square courtyard east of Sully
    { x: (cc.xFrom + cc.xTo) / 2, z: -(cc.yTo - cw / 2), w: cc.xTo - cc.xFrom, d: cw, h: ch },
    { x: (cc.xFrom + cc.xTo) / 2, z: -(cc.yFrom + cw / 2), w: cc.xTo - cc.xFrom, d: cw, h: ch },
    { x: cc.xTo - cw / 2, z: 0, w: cw, d: cc.yTo - cc.yFrom, h: ch },
    // Rue de Rivoli blocks (north) and the Seine quay buildings (south)
    { x: -150, z: -150, w: 800, d: 26, h: 20 },
    { x: -150, z: 175, w: 800, d: 30, h: 20 },
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
  for (let x = -440; x > -900; x -= 9) for (const zRow of [-110, -95, -80, -65, -40, 40, 65, 80, 95, 110]) trees.push(new THREE.Vector3(x + (Math.random() - 0.5) * 2, 0, zRow + (Math.random() - 0.5) * 2));
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
