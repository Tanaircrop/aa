import { el, ui } from './dom';
import type { Session } from '../gameplay/session';
import type { Player } from '../gameplay/player';

export class Hud {
  root: HTMLElement; timer: HTMLElement; group: HTMLElement; tasks: HTMLElement; mode: HTMLElement; hints: HTMLElement; fps: HTMLElement;
  btnMenu: HTMLButtonElement; btnGallery: HTMLButtonElement; btnTeacher: HTMLButtonElement;
  constructor(isTouch: boolean) {
    this.group = el('span', { class: 'chip' }, ['Nhóm: ', el('b', {}, ['—'])]);
    this.timer = el('span', { class: 'chip', id: 'timer' }, ['10:00']);
    this.tasks = el('span', { class: 'chip' }, ['📷 0 chụp · ✎ 0 vẽ']);
    this.mode = el('span', { class: 'chip' }, ['Đi bộ']);
    this.btnMenu = el('button', {}, ['☰ Menu']);
    this.btnGallery = el('button', {}, ['🖼 Thư viện']);
    this.btnTeacher = el('button', { class: 'hidden' }, ['🎓 Giảng viên']);
    const left = el('div', { id: 'hud-left' }, [el('div', { class: 'row' }, [this.group, this.timer]), el('div', { class: 'row' }, [this.tasks, this.mode])]);
    const right = el('div', { class: 'row' }, [this.btnTeacher, this.btnGallery, this.btnMenu]);
    this.root = el('div', { id: 'hud-top' }, [left, right]);
    this.hints = el('div', { id: 'hints', html: isTouch ? '' : '<kbd>WASD</kbd> đi · <kbd>Shift</kbd> chạy · <kbd>F</kbd> bay · <kbd>E/Q</kbd> nâng/hạ máy · <kbd>C</kbd> hoặc chuột phải: máy ảnh · <kbd>Space</kbd> chụp · con lăn hoặc <kbd>1</kbd>-<kbd>5</kbd>: zoom · <kbd>T</kbd> tỷ lệ · <kbd>L</kbd> lưới · <kbd>M</kbd> bản đồ · <kbd>Esc</kbd> menu' });
    this.fps = el('div', { id: 'fps' });
    ui().append(this.root, this.hints, this.fps, el('div', { id: 'crosshair' }));
  }
  update(session: Session, player: Player, stats: { fps: number; drawCalls: number; triangles: number }) {
    this.group.querySelector('b')!.textContent = session.group || '—';
    if (session.phase === 'grace') { this.timer.textContent = `Xuất bài: ${session.format(session.graceRemaining)}`; this.timer.className = 'chip over'; }
    else if (session.phase === 'ended') { this.timer.textContent = 'Kết thúc'; this.timer.className = 'chip over'; }
    else { this.timer.textContent = session.format(session.remaining); this.timer.className = 'chip' + (session.remaining < 120 ? ' warn' : ''); }
    this.tasks.textContent = `📷 ${session.photosTaken} chụp · ✎ ${session.photosAnnotated} vẽ`;
    this.mode.textContent = player.mode === 'fly' ? `🚁 Bay · ${player.alt.toFixed(1)} m · ${player.flySpeed.toFixed(0)} m/s` : `🚶 Đi bộ · máy ${player.cameraHeight.toFixed(2)} m`;
    this.fps.textContent = `${stats.fps} fps · ${stats.drawCalls} dc · ${(stats.triangles / 1000).toFixed(0)}k tri`;
  }
}
