import { config, type Vec2 } from '../data/config';
import { el, ui } from './dom';
import { qualitySettings, type QualityLevel } from '../core/quality';

export interface MenuHooks { teleport: (pos: Vec2, headingDeg: number, alt?: number) => void; setQuality: (q: QualityLevel) => void; quality: QualityLevel; exportSummary: () => void; resume: () => void }

export class Menu {
  root: HTMLElement; open = false;
  constructor(private hooks: MenuHooks) {
    this.root = el('div', { id: 'side', class: 'panel hidden' });
    ui().append(this.root);
    this.build();
  }
  private build() {
    const r = this.root; r.innerHTML = '';
    const close = el('button', {}, ['✕']); close.onclick = () => this.hide();
    r.append(el('div', { class: 'row', style: 'justify-content:space-between' }, [el('h2', {}, ['Menu']), close]));
    r.append(el('h3', {}, ['Dịch chuyển nhanh']));
    for (const t of config.teleports) { const b = el('button', { style: 'margin:3px 3px 3px 0' }, [t.name]); b.onclick = () => { this.hooks.teleport(t.pos as Vec2, t.headingDeg); this.hide(); }; r.append(b); }
    r.append(el('h3', {}, ['Điểm nhìn từ cửa sổ']));
    for (const w of config.windows) { const b = el('button', { style: 'margin:3px 3px 3px 0' }, [w.name]); b.onclick = () => { this.hooks.teleport(w.pos as Vec2, w.headingDeg, w.height); this.hide(); }; r.append(b); }
    r.append(el('h3', {}, ['Chất lượng đồ hoạ']));
    const seg = el('div', { class: 'row' });
    for (const q of ['low', 'medium', 'high'] as QualityLevel[]) { const b = el('button', { class: q === this.hooks.quality ? 'active' : '' }, [{ low: 'Thấp', medium: 'Trung', high: 'Cao' }[q]]); b.onclick = () => { this.hooks.setQuality(q); }; seg.append(b); }
    r.append(seg, el('p', { class: 'muted' }, [`Cao: bóng mềm, nước phản chiếu, kính trong suốt. Đổi mức sẽ tải lại trang. Hiện tại: ${qualitySettings(this.hooks.quality).level}.`]));
    r.append(el('h3', {}, ['Xuất bài']));
    const ex = el('button', { class: 'primary' }, ['⬇ Trang tổng hợp']); ex.onclick = () => this.hooks.exportSummary(); r.append(ex);
    r.append(el('h3', {}, ['Điều khiển']));
    r.append(el('table', { class: 'keys', html: `
      <tr><td>Đi bộ ↔ bay</td><td><kbd>F</kbd> / nút BAY</td></tr>
      <tr><td>Di chuyển</td><td><kbd>WASD</kbd>, mũi tên / joystick</td></tr>
      <tr><td>Xoay góc nhìn</td><td>click vào cảnh rồi rê chuột / vuốt nửa phải</td></tr>
      <tr><td>Chạy, bay nhanh</td><td><kbd>Shift</kbd> / ⚡</td></tr>
      <tr><td>Lên xuống (bay) · nâng hạ máy (đi bộ)</td><td><kbd>E</kbd> <kbd>Q</kbd> / ▲ ▼ · thanh trượt</td></tr>
      <tr><td>Tốc độ bay</td><td>con lăn chuột</td></tr>
      <tr><td>Máy ảnh</td><td><kbd>C</kbd> hoặc chuột phải / 📷</td></tr>
      <tr><td>Chụp</td><td><kbd>Space</kbd> hoặc click / nút tròn</td></tr>
      <tr><td>Tiêu cự</td><td><kbd>[</kbd> <kbd>]</kbd> hoặc nút trên khung ngắm</td></tr>
      <tr><td>Nghiêng máy (thước cân bằng)</td><td><kbd>Z</kbd> <kbd>X</kbd></td></tr>
      <tr><td>Bản đồ nhỏ</td><td><kbd>M</kbd></td></tr>
      <tr><td>Menu</td><td><kbd>Esc</kbd></td></tr>` }));
    r.append(el('p', { class: 'muted', style: 'margin-top:14px;font-size:11px' }, [config.credits.join(' · ')]));
    const resume = el('button', { class: 'primary', style: 'margin-top:10px;width:100%' }, ['Tiếp tục chơi']); resume.onclick = () => { this.hide(); this.hooks.resume(); }; r.append(resume);
  }
  show() { this.open = true; this.build(); this.root.classList.remove('hidden'); }
  hide() { this.open = false; this.root.classList.add('hidden'); }
  toggle() { this.open ? this.hide() : this.show(); }
}
