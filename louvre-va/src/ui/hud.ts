import { el, ui } from './dom';
import type { Session } from '../gameplay/session';
import type { Player } from '../gameplay/player';

export class Hud {
  root: HTMLElement; timer: HTMLElement; group: HTMLElement; tasks: HTMLElement; mode: HTMLElement; hints: HTMLElement; fps: HTMLElement; score: HTMLElement; heat: HTMLElement;
  btnMenu: HTMLButtonElement; btnGallery: HTMLButtonElement; btnTeacher: HTMLButtonElement; btnFull: HTMLButtonElement; btnHint: HTMLButtonElement; tutorial: HTMLElement; tutorialSkip: HTMLButtonElement;
  constructor(isTouch: boolean) {
    this.group = el('span', { class: 'chip' }, ['Nhóm: ', el('b', {}, ['—'])]);
    this.timer = el('span', { class: 'chip', id: 'timer' }, ['10:00']);
    this.tasks = el('span', { class: 'chip' }, ['📷 0 chụp · ✎ 0 vẽ']);
    this.mode = el('span', { class: 'chip' }, ['Đi bộ']);
    this.score = el('span', { class: 'chip' }, ['⭐ 0 · góc V+A 0/5']);
    this.heat = el('span', { class: 'chip hidden' }, ['']);
    this.btnMenu = el('button', {}, ['☰ Menu']);
    this.btnGallery = el('button', {}, ['🖼 Thư viện']);
    this.btnTeacher = el('button', { class: 'hidden' }, ['🎓 Giảng viên']);
    this.btnHint = el('button', { class: 'hidden primary' }, ['💡 Gợi ý (1 lần)']);
    this.btnFull = el('button', { title: 'Toàn màn hình' }, ['⛶']);
    this.btnFull.onclick = () => {
      const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
      const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
      if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen?.bind(d) ?? d.webkitExitFullscreen)?.(); }
      else if (root.requestFullscreen) root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
      else alert('iPhone: Safari không có toàn màn hình. Bấm Chia sẻ → "Thêm vào MH chính", mở từ icon đó sẽ chạy toàn màn hình.');
    };
    this.tutorialSkip = el('button', { class: 't-skip' }, ['Bỏ qua']);
    this.tutorial = el('div', { id: 'tutorial', class: 'panel hidden' }, [el('div', { class: 't-head' }, [el('b', {}, ['']), el('span', { class: 'muted t-prog' }, ['']), this.tutorialSkip]), el('div', { class: 't-body' }, [''])]);
    const left = el('div', { id: 'hud-left' }, [el('div', { class: 'row' }, [this.group, this.timer]), el('div', { class: 'row' }, [this.tasks, this.mode]), el('div', { class: 'row' }, [this.score, this.heat])]);
    const right = el('div', { class: 'row' }, [this.btnHint, this.btnTeacher, this.btnGallery, this.btnMenu, ...(isTouch ? [this.btnFull] : [])]);
    this.root = el('div', { id: 'hud-top' }, [left, right]);
    this.hints = el('div', { id: 'hints', html: isTouch ? '' : '<kbd>WASD</kbd> đi · <kbd>Shift</kbd> chạy · <kbd>F</kbd> bay · <kbd>E/Q</kbd> nâng/hạ máy · <kbd>C</kbd> hoặc chuột phải: máy ảnh · <kbd>Space</kbd> chụp · con lăn hoặc <kbd>1</kbd>-<kbd>5</kbd>: zoom · <kbd>T</kbd> tỷ lệ · <kbd>L</kbd> lưới · <kbd>M</kbd> bản đồ · <kbd>Esc</kbd> menu' });
    this.fps = el('div', { id: 'fps' });
    ui().append(this.root, this.hints, this.fps, el('div', { id: 'crosshair' }), this.tutorial);
  }
  setTutorial(title: string, body: string, progress: string) {
    if (!title && !body) { this.tutorial.classList.add('hidden'); return; }
    this.tutorial.classList.remove('hidden');
    this.tutorial.querySelector('b')!.textContent = title;
    this.tutorial.querySelector('.t-prog')!.textContent = progress;
    this.tutorial.querySelector('.t-body')!.textContent = body;
    this.tutorialSkip.classList.toggle('hidden', !progress);
  }
  setScore(points: number, found: number, total: number) { this.score.textContent = `⭐ ${points} · góc V+A ${found}/${total}`; }
  /** hot / cold nudge toward the nearest undiscovered V+A corner; empty string hides it */
  setHeat(text: string) { this.heat.classList.toggle('hidden', !text); this.heat.textContent = text; }
  update(session: Session, player: Player, stats: { fps: number; drawCalls: number; triangles: number }) {
    this.group.querySelector('b')!.textContent = session.group || '—';
    if (session.phase === 'grace') { this.timer.textContent = `Xuất bài: ${session.format(session.graceRemaining)}`; this.timer.className = 'chip over'; }
    else if (session.phase === 'ended') { this.timer.textContent = 'Kết thúc'; this.timer.className = 'chip over'; }
    else if (session.phase === 'tutorial') { this.timer.textContent = 'Hướng dẫn · chưa tính giờ'; this.timer.className = 'chip'; }
    else { this.timer.textContent = session.format(session.remaining); this.timer.className = 'chip' + (session.remaining < 120 ? ' warn' : ''); }
    this.tasks.textContent = `📷 ${session.photosTaken} chụp · ✎ ${session.photosAnnotated} vẽ`;
    this.mode.textContent = player.mode === 'fly' ? `🚁 Bay · ${player.alt.toFixed(1)} m · ${player.flySpeed.toFixed(0)} m/s` : `🚶 Đi bộ · máy ${player.cameraHeight.toFixed(2)} m`;
    this.fps.textContent = `${stats.fps} fps · ${stats.drawCalls} dc · ${(stats.triangles / 1000).toFixed(0)}k tri`;
  }
}
