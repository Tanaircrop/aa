import { el, ui, toast } from './dom';
import { gallery, type PhotoRecord } from '../gameplay/gallery';
import { Annotator, renderAnnotated } from './annotate';
import { exportSummary, exportAll } from './exporter';

export class GalleryPanel {
  root: HTMLElement; list: HTMLElement; annot = new Annotator(); open = false;
  onChange: (() => void) | null = null;
  constructor(private getGroup: () => string) {
    this.list = el('div', { class: 'thumbs' });
    const close = el('button', {}, ['✕']); close.onclick = () => this.hide();
    const sum = el('button', { class: 'primary' }, ['⬇ Trang tổng hợp']); sum.onclick = () => exportSummary(this.getGroup());
    const all = el('button', {}, ['⬇ Tất cả PNG']); all.onclick = () => exportAll(this.getGroup());
    this.root = el('div', { id: 'side', class: 'panel hidden' }, [
      el('div', { class: 'row', style: 'justify-content:space-between' }, [el('h2', {}, ['Thư viện ảnh']), close]),
      el('p', { class: 'muted' }, ['Bấm ảnh để vẽ A, V, chấm đỏ và ghi chú. Tối đa 20 ảnh mỗi nhóm.']),
      this.list,
      el('div', { class: 'row', style: 'margin-top:12px' }, [sum, all]),
    ]);
    ui().append(this.root);
    this.annot.onSaved = () => { this.refresh(); this.onChange?.(); };
  }
  async refresh() {
    const recs = await gallery.list(this.getGroup());
    this.list.innerHTML = '';
    for (const r of recs) {
      const c = await renderAnnotated(r);
      const img = el('img'); img.src = c.toDataURL('image/jpeg', 0.6);
      const t = el('div', { class: 't' }, [img, el('span', { class: 'tag' }, [r.meta.mode === 'fly' && !r.meta.label.includes('ngoài đời') ? '🚁 drone' : '🚶']), ...(r.strokes.length ? [el('span', { class: 'ok' })] : [])]);
      t.onclick = () => this.annot.open(r);
      const del = el('button', { class: 'danger', style: 'position:absolute;right:2px;bottom:2px;padding:2px 6px;font-size:11px' }, ['xoá']);
      del.onclick = async (e) => { e.stopPropagation(); if (confirm('Xoá ảnh này?')) { await gallery.remove(r.id); this.refresh(); this.onChange?.(); } };
      t.append(del); this.list.append(t);
    }
    if (!recs.length) this.list.append(el('p', { class: 'muted' }, ['Chưa có ảnh. Bật máy ảnh (C) rồi chụp.']));
  }
  show() { this.open = true; this.root.classList.remove('hidden'); this.refresh(); }
  hide() { this.open = false; this.root.classList.add('hidden'); }
  toggle() { this.open ? this.hide() : this.show(); }
  openRecord(r: PhotoRecord) { this.annot.open(r); }
  static notify(msg: string) { toast(msg); }
}
