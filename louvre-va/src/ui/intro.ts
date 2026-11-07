import { config } from '../data/config';
import { el, ui } from './dom';

const sampleSvg = `<svg viewBox="0 0 600 300" width="100%" style="background:#1b2430;border-radius:10px;max-height:240px">
<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d3f5e"/><stop offset="1" stop-color="#d98a5a"/></linearGradient></defs>
<rect width="600" height="170" fill="url(#sk)"/><rect y="170" width="600" height="130" fill="#3b3a38"/>
<polygon points="300,60 420,180 180,180" fill="#9fc4d8" fill-opacity=".55" stroke="#dfeaf0" stroke-width="2"/>
<polygon points="300,60 420,180 180,180" fill="none" stroke="#ff2a1f" stroke-width="4"/>
<path d="M40 290 L300 185 M560 290 L300 185" stroke="#ff2a1f" stroke-width="4" stroke-dasharray="12 9" fill="none"/>
<path d="M40 290 L300 185 L560 290" stroke="#6fa3c7" stroke-width="2" fill="none"/>
<circle cx="300" cy="200" r="8" fill="#ff2a1f"/>
<text x="300" y="45" fill="#fff" font-size="18" text-anchor="middle" font-weight="bold">A = sống kim tự tháp (nét liền)</text>
<text x="300" y="275" fill="#ffd23f" font-size="16" text-anchor="middle">V = hai bờ hồ hội tụ (nét đứt) · chấm đỏ = chủ thể ở đỉnh V</text>
</svg>`;

export function showIntro(opts: { teacher: boolean; onStart: (group: string) => void; onPreview: () => void }): HTMLElement {
  const input = el('input', { placeholder: 'Tên nhóm (vd: Nhóm 3)', maxlength: '32' });
  const prev = localStorage.getItem('lva.group'); if (prev) input.value = prev;
  const start = el('button', { class: 'primary' }, [`Vào quảng trường`]);
  const skip = el('button', {}, ['Bỏ qua xem mẫu']);
  const countdown = el('span', { class: 'muted' });
  const root = el('div', { class: 'modal' }, [el('div', { class: 'panel' }, [
    el('h1', {}, ['Louvre V+A Photo Game']),
    el('p', { class: 'muted' }, ['Bài tập nhóm 10 phút ở Cour Napoléon: tìm bố cục có chữ A (sống kim tự tháp) và chữ V (bờ hồ hội tụ) cùng lúc, chụp ít nhất 2 góc, vẽ lên ảnh, rồi giải thích đỉnh V dẫn mắt vào đâu.']),
    el('div', { html: sampleSvg }),
    el('h2', {}, ['Quy ước vẽ']),
    el('p', {}, [el('span', { class: 'legend' }, [el('i'), 'A nét liền đỏ', el('i', { class: 'dash' }), 'V nét đứt đỏ', el('i', { class: 'dot' }), 'chấm đỏ: vị trí chủ thể']), ' · mỗi ảnh ghi 1 câu.']),
    el('h2', {}, ['Nhóm của bạn']),
    el('div', { class: 'row' }, [input, start, skip, countdown]),
    el('p', { class: 'muted', style: 'margin-top:14px' }, [`Xem hình mẫu ${config.session.previewSeconds} giây trước khi bắt đầu. Đồng hồ ${config.session.durationMinutes} phút chạy ngay khi vào. ` + (opts.teacher ? 'Chế độ giảng viên đang bật.' : '')]),
    el('p', { class: 'muted', style: 'font-size:11px' }, [config.credits.join(' · ')]),
  ])]);
  ui().append(root);
  let left = config.session.previewSeconds;
  start.disabled = true; start.textContent = `Vào quảng trường (${left})`;
  const tick = setInterval(() => { left--; if (left <= 0) { clearInterval(tick); start.disabled = false; start.textContent = 'Vào quảng trường'; countdown.textContent = ''; } else start.textContent = `Vào quảng trường (${left})`; }, 1000);
  skip.onclick = () => { clearInterval(tick); start.disabled = false; start.textContent = 'Vào quảng trường'; };
  const go = () => { const g = input.value.trim() || 'Nhóm'; localStorage.setItem('lva.group', g); root.remove(); opts.onStart(g); };
  start.onclick = go;
  input.onkeydown = (e) => { if (e.key === 'Enter' && !start.disabled) go(); };
  opts.onPreview();
  setTimeout(() => input.focus(), 50);
  return root;
}
