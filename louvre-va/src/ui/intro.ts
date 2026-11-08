import { config } from '../data/config';
import { el, ui } from './dom';

const sampleSvg = `<svg viewBox="0 0 600 300" width="100%" style="background:#1b2430;border-radius:10px;max-height:240px">
<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d3f5e"/><stop offset="1" stop-color="#d98a5a"/></linearGradient>
<style>
 .a{stroke-dasharray:420;stroke-dashoffset:420;animation:drawA 6s ease-in-out infinite}
 .v{stroke-dasharray:12 9;stroke-dashoffset:300;opacity:0;animation:drawV 6s ease-in-out infinite}
 .d{opacity:0;transform-origin:300px 200px;animation:dot 6s ease-in-out infinite}
 .h{fill:#fff;font:bold 15px sans-serif;opacity:0;animation:hint 6s ease-in-out infinite}
 .h2{animation-delay:0s}
 @keyframes drawA{0%{stroke-dashoffset:420}10%{stroke-dashoffset:420}35%{stroke-dashoffset:0}85%{stroke-dashoffset:0}100%{stroke-dashoffset:420}}
 @keyframes drawV{0%,38%{opacity:0;stroke-dashoffset:300}42%{opacity:1}65%{stroke-dashoffset:0;opacity:1}85%{opacity:1}100%{opacity:0}}
 @keyframes dot{0%,66%{opacity:0;transform:scale(0.2)}72%{opacity:1;transform:scale(1.6)}80%{transform:scale(1)}85%{opacity:1}100%{opacity:0}}
 @keyframes hint{0%,8%{opacity:0}12%,34%{opacity:1}38%{opacity:0}100%{opacity:0}}
</style></defs>
<rect width="600" height="170" fill="url(#sk)"/><rect y="170" width="600" height="130" fill="#3b3a38"/>
<polygon points="300,60 420,180 180,180" fill="#9fc4d8" fill-opacity=".55" stroke="#dfeaf0" stroke-width="2"/>
<path d="M40 290 L300 185 L560 290" stroke="#6fa3c7" stroke-width="2" fill="none"/>
<path class="a" d="M180 180 L300 60 L420 180" stroke="#ff2a1f" stroke-width="5" fill="none" stroke-linecap="round"/>
<path class="v" d="M40 290 L300 185 M560 290 L300 185" stroke="#ff2a1f" stroke-width="5" fill="none" stroke-linecap="round"/>
<circle class="d" cx="300" cy="200" r="9" fill="#ff2a1f"/>
<text class="h" x="300" y="40" text-anchor="middle">1. Kéo một đường thẳng dọc sống kim tự tháp: chữ A</text>
<text x="300" y="40" text-anchor="middle" style="fill:#fff;font:bold 15px sans-serif;opacity:0;animation:hint 6s ease-in-out infinite;animation-delay:1.9s">2. Hai nét đứt theo bờ hồ hội tụ: chữ V</text>
<text x="300" y="40" text-anchor="middle" style="fill:#fff;font:bold 15px sans-serif;opacity:0;animation:hint 6s ease-in-out infinite;animation-delay:3.7s">3. Chấm đỏ ở đỉnh V: vị trí chủ thể</text>
<text x="300" y="275" fill="#ffd23f" font-size="14" text-anchor="middle">Nét luôn là đường thẳng 2 điểm, kéo đầu mút để chỉnh</text>
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
