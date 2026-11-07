import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { QualitySettings } from './quality';

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  clock = new THREE.Clock();
  composer: EffectComposer | null = null;
  settings: QualitySettings;
  private updaters: ((dt: number, t: number) => void)[] = [];
  private captureCanvas = document.createElement('canvas');
  stats = { fps: 0, drawCalls: 0, triangles: 0 };
  private fpsAcc = 0; private fpsN = 0;
  running = true;

  constructor(public canvas: HTMLCanvasElement, settings: QualitySettings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.level !== 'low', powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 6000);
    this.camera.rotation.order = 'YXZ';
    this.applyQuality(settings);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applyQuality(s: QualitySettings) {
    this.settings = s;
    this.renderer.setPixelRatio(s.pixelRatio);
    this.renderer.shadowMap.enabled = s.shadows;
    if (s.postprocessing) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.6, 0.92);
      this.composer.addPass(bloom);
      this.composer.addPass(new OutputPass());
    } else {
      this.composer = null;
    }
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  onUpdate(fn: (dt: number, t: number) => void) { this.updaters.push(fn); }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.running) return;
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const t = this.clock.elapsedTime;
      for (const u of this.updaters) u(dt, t);
      this.renderFrame();
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc > 0.5) { this.stats.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
      this.stats.drawCalls = this.renderer.info.render.calls;
      this.stats.triangles = this.renderer.info.render.triangles;
    };
    loop();
  }

  renderFrame() {
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  /**
   * Render a clean photo (no UI) with the given camera at an exact pixel size.
   * Done synchronously so the on-screen canvas never shows the intermediate frame.
   */
  capture(camera: THREE.PerspectiveCamera, width: number, height: number): HTMLCanvasElement {
    const prevRatio = this.renderer.getPixelRatio();
    const size = this.renderer.getSize(new THREE.Vector2());
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(width, height);
      const rp = this.composer.passes[0] as RenderPass;
      const prevCam = rp.camera; rp.camera = camera;
      this.composer.render();
      rp.camera = prevCam;
    } else {
      this.renderer.render(this.scene, camera);
    }
    const out = this.captureCanvas;
    out.width = width; out.height = height;
    out.getContext('2d')!.drawImage(this.canvas, 0, 0, width, height);
    this.renderer.setPixelRatio(prevRatio);
    this.renderer.setSize(size.x, size.y, false);
    this.composer?.setSize(size.x, size.y);
    this.renderFrame();
    return out;
  }
}
