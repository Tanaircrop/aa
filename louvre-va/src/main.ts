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
import { readComposition, type Composition } from './gameplay/composition';
import { Progress } from './gameplay/score';
import { buildEggs, eggsInFrame } from './scene/eggs';
import { cloud } from './net/cloud';
import { deviceId } from './gameplay/gallery';
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
const standardTips = allTips.filter((t) => t.cls === 'standard');
let prog = new Progress('');
const bonusGiven = new Set<string>();
let comp: Composition = { hasA: false, hasV: false, tip: null, apexUpper: false, level: true };
let eggsNow: string[] = [];
const eggDefs = config.easterEggs as unknown as { id: string; label: string; bonus: number; pos: [number, number] }[];
let frame = 0;
let lastPresence = -10;
void deviceId();

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
  const shotComp = comp;
  const { canvas: c, meta } = photo.capture(player, session.group, env.presetId);
  const sc = prog.scoreShot(shotComp, standardTips.length, eggDefs.filter((e) => eggsNow.includes(e.id)));
  meta.hasA = shotComp.hasA; meta.hasV = shotComp.hasV; meta.stars = sc.stars; meta.points = sc.points;
  (meta as unknown as { eggs?: string[] }).eggs = [...eggsNow];
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
  const rec = { id: uid(), group: session.group, blob, meta, strokes: [], note: '', createdAt: Date.now() };
  await gallery.add(rec);
  void cloud.photo(rec, c);
  await refreshCounts();
  hud.setScore(prog.points, prog.discovered.size, standardTips.length);
  const stars = '★'.repeat(sc.stars) + '☆'.repeat(3 - sc.stars);
  toast(`${stars}  +${sc.points} điểm${sc.discovered ? ' · GÓC MỚI!' : ''}\n${sc.reasons.slice(1).join(' · ') || 'Thử tìm A và V'}`, sc.discovered ? 5000 : 3200);
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
galleryPanel.annot.onSaved = (rec) => {
  if (rec.strokes.length && rec.note && !bonusGiven.has(rec.id)) { bonusGiven.add(rec.id); prog.addAnnotationBonus(); hud.setScore(prog.points, prog.discovered.size, standardTips.length); toast('Đã vẽ và ghi chú +15', 2000); }
  galleryPanel.refresh(); refreshCounts(); void cloud.annotation(rec);
};
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
hud.tutorialSkip.onclick = () => { tutorial.skip(); localStorage.setItem('lva.tutorialDone', '1'); session.beginTimer(); toast(`Bỏ qua hướng dẫn. ${session.format(session.durationSec)} bắt đầu!`, 3000); };
tutorial.onDone = () => {
  localStorage.setItem('lva.tutorialDone', '1'); releaseForUi();
  const start = el('button', { class: 'primary' }, [`Bắt đầu ${config.session.durationMinutes} phút`]);
  const m = el('div', { class: 'modal' }, [el('div', { class: 'panel', style: 'max-width:520px' }, [
    el('h1', {}, ['Hướng dẫn kết thúc']),
    el('p', {}, ['Bạn đã làm quen đủ thao tác: đi lại, giơ máy, zoom, canh khung theo huy hiệu A và V, chụp, vẽ và ghi chú.']),
    el('p', {}, [`Giờ là bài thật: còn ${standardTips.length - 1} góc V + A nữa quanh hồ, 2 Easter egg chữ X và chữ C, và câu hỏi cuối bài. Đồng hồ ${config.session.durationMinutes} phút bắt đầu khi bấm nút.`]),
    el('p', { class: 'muted' }, ['Gợi ý 1 lần sẽ mở sau 5 phút nếu bạn cần.']),
    start,
  ])]);
  ui().append(m);
  start.onclick = () => { m.remove(); session.beginTimer(); toast(`${session.format(session.durationSec)} bắt đầu. Tìm V + A!`, 3500); if (!isTouch) canvas.requestPointerLock?.(); };
};
// one-shot hint: teleport to the known V + A corner with the camera already framed; just press the shutter
hud.btnHint.onclick = () => {
  if (prog.hintUsed) return;
  prog.useHint(); hud.btnHint.classList.add('hidden');
  player.teleport(tutorial.checkpoint, tutorial.headingDeg, 0.8, -4); photo.focal = 16; setCamera(true);
  toast('Gợi ý: đây là một góc V + A chuẩn, máy đã canh sẵn. Bấm chụp!', 5000);
};
// block the browser's pinch / double-tap zoom on touch devices (iOS ignores user-scalable=no)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', (e) => { if (isTouch) e.preventDefault(); });
function askFinalQuestion() {
  releaseForUi(); setCamera(false);
  const q = config.finalQuestion;
  const input = el('input', { type: 'number', min: '0', max: '21', placeholder: 'Số góc' }); const ok = el('button', { class: 'primary' }, ['Trả lời']);
  const m = el('div', { class: 'modal' }, [el('div', { class: 'panel', style: 'max-width:520px' }, [
    el('h1', {}, ['Hết giờ! Câu hỏi cuối']),
    el('p', {}, [q.text]),
    el('p', { class: 'muted' }, [`Nhóm bạn đã khám phá ${prog.discovered.size} góc, ${session.photosTaken} ảnh, ⭐ ${prog.points} điểm. Trả lời đúng +${q.bonus}.`]),
    el('div', { class: 'row' }, [input, ok]),
  ])]);
  ui().append(m); setTimeout(() => input.focus(), 50);
  const submit = async () => {
    const n = parseInt(input.value); if (isNaN(n)) return;
    const correct = prog.answerQuestion(n, q.answer, q.bonus); m.remove();
    hud.setScore(prog.points, prog.discovered.size, standardTips.length);
    toast(correct ? `Đúng! Có ${q.answer} góc hội tụ đủ V + A. +${q.bonus} điểm. Tổng ⭐ ${prog.points}.` : `Chưa đúng: có ${q.answer} góc (5 mũi hồ 90° hướng vào kim tự tháp). Tổng ⭐ ${prog.points}.`, 9000);
    await cloud.result({ group: session.group, points: prog.points, discovered: prog.discovered.size, eggs: [...prog.eggs], photos: session.photosTaken, annotated: session.photosAnnotated, answer: n, correct });
    galleryPanel.show();
  };
  ok.onclick = submit; input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
}
session.onPhase = (p) => {
  if (p === 'grace') { toast(`Hết giờ! Còn 1 phút để xuất bài.`, 4000); askFinalQuestion(); }
  if (p === 'ended') { galleryPanel.show(); toast('Kết thúc bài. Xuất trang tổng hợp để nộp.', 6000); }
};

// --- deferred building (keeps first paint fast)
const later = (fn: () => void, msg: string, p: number) => new Promise<void>((res) => setTimeout(() => { progress(p, msg); fn(); res(); }, 30));
(async () => {
  await later(() => { buildFacades(engine.scene, collision, settings.facadeDetail); buildEggs(engine.scene, collision); }, 'Mặt tiền Richelieu, Sully, Denon…', 0.45);
  await later(() => buildBackground(engine.scene), 'Tuileries, tháp Eiffel, vòng quay…', 0.7);
  await later(() => {
    crowd = new Crowd(engine.scene, collision, settings.crowd, config.crowd.speed);
    // keep walkers a few metres away from every pool corner and from the tutorial checkpoint
    crowd.avoid = allTips.map((t) => ({ c: t.pos, r: config.crowd.avoidRadius }));
    crowd.avoid.push({ c: tutorial.checkpoint, r: 5 }, { c: config.spawn.pos as Vec2, r: 7 });
    crowd.spawn(); crowd.setEnabled(tSettings.crowd);
  }, 'Người đi bộ…', 0.9);
  applyTeacher(tSettings);
  progress(1, 'Xong');
  loader.remove();
  showIntro({
    teacher,
    onPreview: () => { session.phase = 'preview'; },
    onStart: (group) => {
      session.start(group, tutorial.active); gameStarted = true; refreshCounts();
      prog = new Progress(group); hud.setScore(prog.points, prog.discovered.size, standardTips.length);
      toast(tutorial.active ? `Nhóm ${group}: làm quen thao tác trước, chưa tính giờ.` : `Nhóm ${group}: ${session.format(session.durationSec)} bắt đầu. Tìm V + A!`, 4000);
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
  comp = readComposition(player, photo, engine.camera, canvas.clientWidth, canvas.clientHeight, allTips, plaza.pyramidCenter);
  vf.badges.a = comp.hasA; vf.badges.v = comp.hasV; vf.badges.both = comp.hasA && comp.hasV;
  eggsNow = photo.on ? eggsInFrame(engine.camera, player.pos, photo.frameRect(canvas.clientWidth, canvas.clientHeight), canvas.clientWidth, canvas.clientHeight) : [];
  vf.badges.eggs = eggsNow;
  hud.btnHint.classList.toggle('hidden', !(gameStarted && session.phase === 'playing' && !prog.hintUsed && session.elapsed >= config.session.hintAfterSeconds));
  if (gameStarted && t - lastPresence > 4) { lastPresence = t; void cloud.presence({ group: session.group, x: player.pos[0], y: player.pos[1], alt: player.alt, heading: player.headingDeg, mode: player.mode, phase: session.phase, remaining: session.remaining, photos: session.photosTaken, points: prog.points, discovered: prog.discovered.size, eggs: [...prog.eggs] }); }
  if (gameStarted) tutorial.update(dt, t, player, photo.on, photo.focal, comp.hasA, comp.hasV, session.photosTaken, session.photosAnnotated);
  // hot / cold rescue: after 4 minutes with fewer than 2 corners found, point toward the nearest undiscovered corner
  if (gameStarted && session.phase === 'playing' && !tutorial.active && session.durationSec - session.remaining > 240 && prog.discovered.size < 2) {
    let best = Infinity;
    for (const tp of standardTips) if (!prog.discovered.has(Progress.tipKey(tp))) best = Math.min(best, Math.hypot(player.pos[0] - tp.pos[0], player.pos[1] - tp.pos[1]));
    hud.setHeat(best < 8 ? '🔥 Rất nóng: góc V+A ngay đây' : best < 25 ? '🌡 Ấm: góc V+A gần đây' : '❄️ Lạnh: đi dọc mép hồ');
  } else hud.setHeat('');
  // performance while flying high: skip the planar water reflection and refresh shadows every 3rd frame
  frame++;
  const high = player.alt > 12;
  for (const w of plaza.water) if ((w as unknown as { isReflector?: boolean }).isReflector !== undefined || w.name === 'reflector') w.visible = !high;
  engine.renderer.shadowMap.autoUpdate = !high; if (high && frame % 3 === 0) engine.renderer.shadowMap.needsUpdate = true;
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
