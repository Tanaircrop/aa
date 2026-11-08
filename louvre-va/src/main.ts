import './ui/styles.css';
import * as THREE from 'three';
import { config, referencePhotos, type Vec2, type ReferencePhoto } from './data/config';
import { Engine } from './core/engine';
import { Input } from './core/input';
import { detectQuality, qualitySettings, isTouchDevice, type QualityLevel } from './core/quality';
import { CollisionWorld } from './gameplay/collision';
import { Player } from './gameplay/player';
import { PhotoCamera, shutterSound } from './gameplay/photo';
import { gallery, uid } from './gameplay/gallery';
import { Session, loadTeacherSettings, type TeacherSettings } from './gameplay/session';
import { buildPlaza, updateFountains } from './scene/plaza';
import { buildFacades } from './scene/facades';
import { Environment, buildBackground } from './scene/environment';
import { Crowd } from './scene/crowd';
import { AnswerOverlay } from './scene/overlay';
import { Tutorial } from './gameplay/tutorial';
import { classifyTips } from './gameplay/answers';
import { pools } from './data/config';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { Viewfinder } from './ui/viewfinder';
import { GalleryPanel } from './ui/galleryPanel';
import { showIntro } from './ui/intro';
import { TouchControls } from './ui/touch';
import { TeacherPanel, teacherFromUrl } from './ui/teacher';
import { Menu } from './ui/menu';
import { exportSummary } from './ui/exporter';
import { el, ui, toast } from './ui/dom';

const loader = el('div', { class: 'loader' }, [el('div', {}, ['Louvre V+A Photo Game']), el('div', { class: 'bar' }, [el('i')]), el('div', { class: 'muted', id: 'loader-msg' }, ['Dựng quảng trường…'])]);
ui().append(loader);
const progress = (p: number, msg: string) => { (loader.querySelector('.bar i') as HTMLElement).style.width = `${p * 100}%`; loader.querySelector('#loader-msg')!.textContent = msg; };

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const quality: QualityLevel = detectQuality();
const settings = qualitySettings(quality);
const engine = new Engine(canvas, settings);
const input = new Input(canvas);
const collision = new CollisionWorld();
collision.walk = { ...config.walkBounds };
collision.fly = { ...config.flyBounds };
const isTouch = isTouchDevice();
const teacher = teacherFromUrl();
const tSettings: TeacherSettings = loadTeacherSettings();

// --- scene (progressive: plaza first, facades/background/crowd in later frames)
progress(0.15, 'Hồ và kim tự tháp…');
const env = new Environment(engine.scene, engine.renderer, settings);
const plaza = buildPlaza(engine.scene, collision, settings);
const overlay = new AnswerOverlay(engine.scene);
let crowd: Crowd | null = null;
const allTips = classifyTips(pools, config.mainPyramid.corners as Vec2[], { coincidentTol: config.answers.coincidentCornerTolerance, angleTolDeg: config.answers.angleToleranceDeg });
const tutorialWanted = localStorage.getItem('lva.tutorialDone') !== '1';
const tutorial = new Tutorial(engine.scene, allTips, tutorialWanted);

const player = new Player(input, collision);
player.flyEnabled = tSettings.flyEnabled;
const photo = new PhotoCamera(engine);
const session = new Session(tSettings.durationMinutes);
const hud = new Hud(isTouch);
const minimap = new Minimap();
const vf = new Viewfinder(photo, isTouch);
const galleryPanel = new GalleryPanel(() => session.group);
let touch: TouchControls | null = null;
let teacherPanel: TeacherPanel | null = null;
let menu: Menu;
let gameStarted = false;

function applyTeacher(s: TeacherSettings) {
  player.flyEnabled = s.flyEnabled; if (!s.flyEnabled && player.mode === 'fly') player.toggleMode();
  crowd?.setEnabled(s.crowd);
  if (env.presetId !== s.preset) env.applyPreset(s.preset);
  overlay.setVisible(s.overlay && teacher);
  if (session.phase === 'intro' || session.phase === 'preview') session.durationSec = s.durationMinutes * 60;
}

function gotoPose(r: ReferencePhoto) {
  player.teleport(r.pose.pos as Vec2, r.pose.headingDeg, r.pose.height, r.pose.pitchDeg ?? 0);
  if (r.pose.focal) photo.focal = r.pose.focal;
  if (env.presetId !== r.preset) { env.applyPreset(r.preset); }
  setCamera(true);
}

function setCamera(on: boolean) {
  photo.on = on; vf.setOn(on);
  document.getElementById('crosshair')?.classList.toggle('hidden', on);
  if (on && !isTouch && !input.pointerLocked) canvas.requestPointerLock?.();
}

async function shoot() {
  if (!photo.on || !gameStarted) return;
  if (session.captureLocked) { toast('Hết giờ: máy ảnh đã khoá'); return; }
  const n = await gallery.count(session.group);
  if (n >= config.camera.maxPhotosPerGroup) { toast(`Đã đủ ${config.camera.maxPhotosPerGroup} ảnh. Xoá bớt trong thư viện.`); return; }
  vf.doFlash(); shutterSound();
  const { canvas: c, meta } = photo.capture(player, session.group, env.presetId);
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
  await gallery.add({ id: uid(), group: session.group, blob, meta, strokes: [], note: '', createdAt: Date.now() });
  await refreshCounts();
  toast(`Đã chụp (${session.photosTaken}/${config.camera.maxPhotosPerGroup}) · ${meta.label}`, 1800);
}

async function refreshCounts() {
  const recs = await gallery.list(session.group);
  session.photosTaken = recs.length; session.photosAnnotated = recs.filter((r) => r.strokes.length > 0 && r.note).length;
}

function releaseForUi() { input.releasePointer(); }

// --- UI wiring
input.onShutter = () => shoot();
input.onToggleCamera = () => setCamera(!photo.on);
vf.onShutter = () => shoot();
galleryPanel.onChange = () => refreshCounts();
hud.btnGallery.onclick = () => { releaseForUi(); menu.hide(); teacherPanel?.hide(); galleryPanel.toggle(); };
hud.btnMenu.onclick = () => { releaseForUi(); galleryPanel.hide(); teacherPanel?.hide(); menu.toggle(); };
menu = new Menu({
  teleport: (pos, heading, alt) => player.teleport(pos, heading, alt),
  setQuality: (q) => { localStorage.setItem('lva.quality', q); location.reload(); },
  quality,
  exportSummary: () => exportSummary(session.group),
  resume: () => { if (!isTouch) canvas.requestPointerLock?.(); },
});
if (teacher) {
  hud.btnTeacher.classList.remove('hidden');
  teacherPanel = new TeacherPanel({
    apply: applyTeacher,
    goto: (e) => { player.teleport(e.pose.pos, e.pose.headingDeg, e.pose.alt, e.pose.pitchDeg ?? 0); photo.focal = e.focal || 24; setCamera(true); toast(e.label, 3500); },
    gotoPose,
    entries: overlay.entries,
    player,
    getFocal: () => photo.focal,
  });
  hud.btnTeacher.onclick = () => { releaseForUi(); galleryPanel.hide(); menu.hide(); teacherPanel!.toggle(); };
}
if (isTouch) {
  touch = new TouchControls(input, player);
  touch.onCamera = () => setCamera(!photo.on);
  touch.onShutter = () => shoot();
  touch.onMap = () => minimap.toggle();
  touch.onZoom = (dir) => { if (photo.on) photo.zoom(dir); };
  touch.setVisible(true);
}
session.onReminder = (m) => toast(m, 5000);
tutorial.onMessage = (t, b, p) => hud.setTutorial(t, b, p);
hud.tutorialSkip.onclick = () => { tutorial.skip(); localStorage.setItem('lva.tutorialDone', '1'); };
// block the browser's pinch / double-tap zoom on touch devices (iOS ignores user-scalable=no)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', (e) => { if (isTouch) e.preventDefault(); });
const apexWorld = new THREE.Vector3(plaza.pyramidCenter[0], config.mainPyramid.height, -plaza.pyramidCenter[1]);
function apexInUpperThird(): boolean {
  if (!photo.on) return false;
  const v = apexWorld.clone().project(engine.camera);
  if (v.z > 1 || v.z < -1) return false;
  const r = photo.frameRect(canvas.clientWidth, canvas.clientHeight);
  const px = ((v.x + 1) / 2) * canvas.clientWidth, py = ((1 - v.y) / 2) * canvas.clientHeight;
  return px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h * 0.4;
}
session.onPhase = (p) => { if (p === 'ended') { galleryPanel.show(); toast('Kết thúc bài. Xuất trang tổng hợp để nộp.', 6000); } };

// --- deferred building (keeps first paint fast)
const later = (fn: () => void, msg: string, p: number) => new Promise<void>((res) => setTimeout(() => { progress(p, msg); fn(); res(); }, 30));
(async () => {
  await later(() => buildFacades(engine.scene, collision, settings.facadeDetail), 'Mặt tiền Richelieu, Sully, Denon…', 0.45);
  await later(() => buildBackground(engine.scene), 'Tuileries, tháp Eiffel, vòng quay…', 0.7);
  await later(() => {
    crowd = new Crowd(engine.scene, collision, settings.crowd, config.crowd.speed);
    // keep walkers a few metres away from every pool corner and from the tutorial checkpoint
    crowd.avoid = allTips.map((t) => ({ c: t.pos, r: config.crowd.avoidRadius }));
    crowd.avoid.push({ c: config.tutorial.checkpoint as Vec2, r: 5 }, { c: config.spawn.pos as Vec2, r: 7 });
    crowd.spawn(); crowd.setEnabled(tSettings.crowd);
  }, 'Người đi bộ…', 0.9);
  applyTeacher(tSettings);
  progress(1, 'Xong');
  loader.remove();
  showIntro({
    teacher,
    onPreview: () => { session.phase = 'preview'; },
    onStart: (group) => {
      session.start(group); gameStarted = true; refreshCounts();
      toast(`Nhóm ${group}: ${session.format(session.durationSec)} bắt đầu. Tìm V + A!`, 4000);
      if (!isTouch) canvas.requestPointerLock?.();
    },
  });
})();

// --- loop
engine.onUpdate((dt, t) => {
  const uiOpen = galleryPanel.open || menu.open || (teacherPanel?.open ?? false) || !!galleryPanel.annot.root;
  player.frozen = uiOpen || !gameStarted;
  if (!uiOpen) {
    if (input.justPressed('KeyC')) setCamera(!photo.on);
    if (input.justPressed('Space') && photo.on) shoot();
    if (input.justPressed('KeyM')) minimap.toggle();
    if (input.justPressed('BracketRight')) photo.cycleFocal(1);
    if (input.justPressed('BracketLeft')) photo.cycleFocal(-1);
    if (input.justPressed('KeyG')) galleryPanel.show();
    if (input.justPressed('KeyT') && photo.on) vf.cycleAspect();
    if (input.justPressed('KeyL') && photo.on) vf.cycleGrid();
    for (let i = 0; i < 5; i++) if (input.justPressed(`Digit${i + 1}`) && photo.on) photo.setFocalIndex(i);
    const wheel = input.consumeWheel();
    if (wheel) { if (photo.on) photo.zoom(wheel < 0 ? 1 : -1); else if (player.mode === 'fly') player.adjustFlySpeed(wheel); }
  }
  if (input.justPressed('Escape')) { releaseForUi(); if (galleryPanel.annot.root) galleryPanel.annot.close(); else if (uiOpen) { galleryPanel.hide(); menu.hide(); teacherPanel?.hide(); } else menu.show(); }
  player.update(dt);
  player.applyTo(engine.camera);
  photo.applyToMainCamera(engine.camera, canvas.clientWidth, canvas.clientHeight);
  env.update(dt, engine.camera);
  updateFountains(plaza.fountains, t);
  crowd?.update(dt, t);
  session.update(dt);
  if (gameStarted) tutorial.update(dt, t, player, photo.on, photo.focal, apexInUpperThird(), session.photosTaken, session.photosAnnotated);
  if (tutorial.step === 'done') localStorage.setItem('lva.tutorialDone', '1');
  hud.update(session, player, engine.stats);
  minimap.draw(player, photo.focal, photo.aspect, photo.on);
  vf.draw(player, photo.on, dt);
  touch?.update(photo.on);
  input.endFrame();
});
engine.start();

// expose a little for QA scripts
(window as unknown as { lva: unknown }).lva = { player, photo, session, env, engine, overlay, setCamera, gotoPose, referencePhotos, THREE, galleryPanel, menu, tutorial, get teacherPanel() { return teacherPanel; } };
