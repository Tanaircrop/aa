import { config, lightingPresets, referencePhotos, type ReferencePhoto } from '../data/config';
import { el, ui, toast } from './dom';
import { gallery } from '../gameplay/gallery';
import { loadTeacherSettings, saveTeacherSettings, type TeacherSettings } from '../gameplay/session';
import type { AnswerEntry } from '../scene/overlay';
import type { Player } from '../gameplay/player';

export interface TeacherHooks {
  apply: (s: TeacherSettings) => void;
  goto: (e: AnswerEntry) => void;
  gotoPose: (r: ReferencePhoto) => void;
  entries: AnswerEntry[];
  player: Player;
  getFocal: () => number;
}

export class TeacherPanel {
  root: HTMLElement; settings: TeacherSettings; open = false;
  private compare: HTMLElement | null = null;
  constructor(private hooks: TeacherHooks) {
    this.settings = loadTeacherSettings();
    this.root = el('div', { id: 'side', class: 'panel hidden' });
    ui().append(this.root);
    this.build();
  }
  private build() {
    const s = this.settings; const r = this.root; r.innerHTML = '';
    const close = el('button', {}, ['✕']); close.onclick = () => this.hide();
    r.append(el('div', { class: 'row', style: 'justify-content:space-between' }, [el('h2', {}, ['🎓 Giảng viên']), close]));
    const save = () => { saveTeacherSettings(s); this.hooks.apply(s); };
    r.append(el('h3', {}, ['Bài tập']));
    const dur = el('select'); for (const m of [5, 10, 15]) dur.append(el('option', { value: `${m}`, ...(s.durationMinutes === m ? { selected: '' } : {}) }, [`${m} phút`]));
    dur.onchange = () => { s.durationMinutes = parseInt(dur.value); save(); };
    r.append(el('label', {}, ['Thời gian bài', dur]));
    const chk = (label: string, key: 'crowd' | 'flyEnabled' | 'overlay') => { const i = el('input', { type: 'checkbox' }); i.checked = s[key]; i.onchange = () => { s[key] = i.checked; save(); }; r.append(el('label', {}, [label, i])); };
    chk('Đám đông', 'crowd'); chk('Cho phép bay (fly cam)', 'flyEnabled'); chk('Overlay đáp án trong cảnh', 'overlay');
    const pre = el('select'); for (const [k, p] of Object.entries(lightingPresets)) pre.append(el('option', { value: k, ...(s.preset === k ? { selected: '' } : {}) }, [p.label]));
    pre.onchange = () => { s.preset = pre.value; save(); };
    r.append(el('label', {}, ['Ánh sáng', pre]));
    r.append(el('h3', {}, ['Đáp án chuẩn (5 xanh) · tranh luận (3 vàng)']));
    const list = el('div', { class: 'answer-list' });
    for (const e of this.hooks.entries) { const b = el('button', { class: e.kind === 'standard' ? 'std' : 'deb' }, [`${e.label}`, el('div', { class: 'muted' }, [e.note])]); b.onclick = () => { s.overlay = true; save(); this.build(); this.hooks.goto(e); }; list.append(b); }
    r.append(list);
    r.append(el('h3', {}, ['Ảnh kết quả mẫu']));
    r.append(el('p', { class: 'muted' }, ['Mỗi ảnh gắn một tư thế máy. "Đến góc này" bay camera tới đúng tư thế rồi bật thanh trượt so sánh ảnh thật với render. Gắn ảnh thật bằng nút tải lên (lưu trong trình duyệt này).']));
    for (const ref of referencePhotos) r.append(this.refRow(ref));
    r.append(el('h3', {}, ['Thêm ảnh mẫu mới']));
    const nameIn = el('input', { placeholder: 'Tên ảnh mẫu' }); const file = el('input', { type: 'file', accept: 'image/*' });
    const add = el('button', {}, ['Gắn ảnh vào tư thế hiện tại']);
    add.onclick = async () => {
      const f = file.files?.[0]; if (!f) { toast('Chọn ảnh trước'); return; }
      const p = this.hooks.player; const id = 'custom_' + Date.now().toString(36);
      const custom: ReferencePhoto = { id, label: nameIn.value || 'Ảnh mẫu mới', preset: s.preset, pose: { pos: [p.pos[0], p.pos[1]], height: p.alt, headingDeg: p.headingDeg, pitchDeg: (p.pitch * 180) / Math.PI, focal: this.hooks.getFocal() }, note: 'Thêm lúc chạy' };
      const customs = JSON.parse(localStorage.getItem('lva.customRefs') || '[]') as ReferencePhoto[]; customs.push(custom); localStorage.setItem('lva.customRefs', JSON.stringify(customs));
      await gallery.setReference(id, f); toast('Đã thêm ảnh mẫu'); this.build();
    };
    r.append(el('div', { class: 'row' }, [nameIn, file, add]));
    const customs = JSON.parse(localStorage.getItem('lva.customRefs') || '[]') as ReferencePhoto[];
    for (const ref of customs) r.append(this.refRow(ref));
    r.append(el('p', { class: 'muted', style: 'margin-top:14px' }, ['Mở chế độ này bằng ?mode=teacher&pin=…']));
  }
  private refRow(ref: ReferencePhoto): HTMLElement {
    const go = el('button', { class: 'primary' }, ['Đến góc này']); go.onclick = () => { this.hooks.gotoPose(ref); this.showCompare(ref); };
    const file = el('input', { type: 'file', accept: 'image/*', style: 'max-width:150px' });
    file.onchange = async () => { const f = file.files?.[0]; if (f) { await gallery.setReference(ref.id, f); toast('Đã gắn ảnh thật'); } };
    const img = el('img', { style: 'width:100%;border-radius:8px;display:none;margin-top:6px' });
    gallery.getReference(ref.id).then((b) => { if (b) { img.src = URL.createObjectURL(b); img.style.display = 'block'; } });
    return el('div', { style: 'border-top:1px solid var(--line);padding:8px 0' }, [
      el('div', {}, [el('b', {}, [ref.label]), el('span', { class: 'muted' }, [` · ${ref.pose.focal ?? 24} mm · ${lightingPresets[ref.preset]?.label ?? ref.preset}`])]),
      el('div', { class: 'muted' }, [ref.note]),
      el('div', { class: 'row', style: 'margin-top:6px' }, [go, file]), img,
    ]);
  }
  async showCompare(ref: ReferencePhoto) {
    this.compare?.remove();
    const blob = await gallery.getReference(ref.id);
    if (!blob) { toast('Chưa có ảnh thật cho tư thế này. Tải ảnh lên để so sánh.'); return; }
    const img = el('img'); img.src = URL.createObjectURL(blob); img.style.opacity = '0.5';
    const range = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0.5' }); range.oninput = () => { img.style.opacity = range.value; };
    const close = el('button', {}, ['✕']);
    const ctl = el('div', { id: 'compare-ctl', class: 'panel' }, [el('span', { class: 'muted' }, ['Ảnh thật ⟷ render']), range, close]);
    const wrap = el('div', { class: 'compare' }, [img]);
    this.compare = el('div', {}, [wrap, ctl]); ui().append(this.compare);
    close.onclick = () => { this.compare?.remove(); this.compare = null; };
  }
  show() { this.open = true; this.build(); this.root.classList.remove('hidden'); }
  hide() { this.open = false; this.root.classList.add('hidden'); }
  toggle() { this.open ? this.hide() : this.show(); }
}

export function teacherFromUrl(): boolean {
  const u = new URL(location.href);
  if (u.searchParams.get('mode') !== 'teacher') return false;
  const pin = u.searchParams.get('pin') ?? sessionStorage.getItem('lva.pin') ?? prompt('Mã PIN giảng viên');
  if (pin === config.teacher.pin) { sessionStorage.setItem('lva.pin', pin); return true; }
  toast('Sai mã PIN'); return false;
}
