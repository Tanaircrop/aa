import { config } from '../data/config';
import { el, ui } from './dom';

const sampleSvg = `<div style="position:relative;border-radius:10px;overflow:hidden;background:#000">
<img src="/tutorial/louvre-real.webp" alt="Cour Napoléon trời mưa, nhìn từ cửa sổ cánh Sully" style="display:block;width:100%" />
<svg viewBox="0 0 1288 998" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">
<defs><style>
 .a{stroke-dasharray:1000;stroke-dashoffset:1000;animation:drawA 7s ease-in-out infinite}
 .v{stroke-dasharray:22 14;stroke-dashoffset:1200;opacity:0;animation:drawV 7s ease-in-out infinite}
 .d{opacity:0;transform-origin:640px 930px;animation:dot 7s ease-in-out infinite}
 .cap{fill:#fff;font:bold 40px sans-serif;paint-order:stroke;stroke:#000;stroke-width:8px;opacity:0;animation:hint 7s ease-in-out infinite}
 @keyframes drawA{0%,8%{stroke-dashoffset:1000}30%{stroke-dashoffset:0}88%{stroke-dashoffset:0}100%{stroke-dashoffset:1000}}
 @keyframes drawV{0%,34%{opacity:0;stroke-dashoffset:1200}38%{opacity:1}62%{stroke-dashoffset:0;opacity:1}88%{opacity:1}100%{opacity:0}}
 @keyframes dot{0%,64%{opacity:0;transform:scale(0.2)}70%{opacity:1;transform:scale(1.6)}78%{transform:scale(1)}88%{opacity:1}100%{opacity:0}}
 @keyframes hint{0%,6%{opacity:0}10%,32%{opacity:1}36%{opacity:0}100%{opacity:0}}
</style></defs>
<path class="a" d="M388 592 L715 285 L1148 606" stroke="#ff2a1f" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path class="v" d="M190 652 L640 930 M1198 716 L640 930" stroke="#ff2a1f" stroke-width="9" fill="none" stroke-linecap="round"/>
<circle class="d" cx="640" cy="930" r="16" fill="#ff2a1f"/>
<text class="cap" x="644" y="120" text-anchor="middle">1. Chữ A: kéo một đường thẳng dọc hai sống kim tự tháp</text>
<text class="cap" x="644" y="120" text-anchor="middle" style="animation-delay:2.1s">2. Chữ V: hai nét đứt theo bờ hồ, chụm về phía người chụp</text>
<text class="cap" x="644" y="120" text-anchor="middle" style="animation-delay:4.2s">3. Chấm đỏ ở đỉnh V: vị trí đặt chủ thể</text>
</svg>
<div style="position:absolute;left:0;right:0;bottom:0;background:linear-gradient(transparent,rgba(0,0,0,.75));color:#ffd23f;font-size:13px;padding:18px 12px 8px;text-align:center">Ảnh thật từ cửa sổ cánh Sully: đáy kim tự tháp nằm trọn trong lòng V của hồ. Trong game, nét luôn là đường thẳng 2 điểm, kéo đầu mút để chỉnh.</div>
</div>
<div class="row" style="margin-top:10px;align-items:stretch">
 <div style="flex:1;min-width:200px;position:relative;border-radius:10px;overflow:hidden"><img src="/tutorial/egg-x.webp" alt="Hai tấm ván bắc chéo thành chữ X" style="display:block;width:100%" /><div style="position:absolute;left:8px;top:8px;background:#ffd23f;color:#2a2000;font-weight:700;padding:3px 8px;border-radius:6px">Easter egg X +40</div></div>
 <div style="flex:1;min-width:200px;position:relative;border-radius:10px;overflow:hidden"><img src="/tutorial/egg-c.webp" alt="Cánh diều cong thành chữ C" style="display:block;width:100%" /><div style="position:absolute;left:8px;top:8px;background:#ffd23f;color:#2a2000;font-weight:700;padding:3px 8px;border-radius:6px">Easter egg C +40</div></div>
</div>
<p class="muted" style="margin:6px 0 0">Ngoài V + A, trong quảng trường giấu 2 chủ thể có hình chữ X và chữ C (đúng bối cảnh Paris). Đưa chúng vào khung khi chụp là được cộng điểm; huy hiệu vàng trên khung ngắm sáng khi tìm thấy.</p>`;

export function showIntro(opts: { teacher: boolean; onStart: (group: string) => void; onPreview: () => void }): HTMLElement {
  const total = config.session.durationMinutes;
  const input = el('input', { placeholder: 'Tên nhóm (vd: Nhóm 3)', maxlength: '32' });
  const prev = localStorage.getItem('lva.group'); if (prev) input.value = prev;
  const start = el('button', { class: 'primary' }, [`Vào quảng trường`]);
  const skip = el('button', {}, ['Bỏ qua xem mẫu']);
  const countdown = el('span', { class: 'muted' });
  const root = el('div', { class: 'modal' }, [el('div', { class: 'panel' }, [
    el('h1', {}, ['Louvre V+A Photo Game']),
    el('p', { class: 'muted' }, [`Bài tập nhóm ${total} phút ở Cour Napoléon: tìm bố cục có chữ A (sống kim tự tháp) và chữ V (bờ hồ hội tụ) cùng lúc, chụp ít nhất 2 góc, vẽ lên ảnh, rồi giải thích đỉnh V dẫn mắt vào đâu. Cuối bài trả lời: có bao nhiêu góc hội tụ đủ cả V và A?`]),
    el('div', { html: sampleSvg }),
    el('h2', {}, ['Quy ước vẽ']),
    el('p', {}, [el('span', { class: 'legend' }, [el('i'), 'A nét liền đỏ', el('i', { class: 'dash' }), 'V nét đứt đỏ', el('i', { class: 'dot' }), 'chấm đỏ: vị trí chủ thể']), ' · mỗi ảnh ghi 1 câu.']),
    el('h2', {}, ['Nhóm của bạn']),
    el('div', { class: 'row' }, [input, start, skip, countdown]),
    el('p', { class: 'muted', style: 'margin-top:14px' }, [`Xem hình mẫu ${config.session.previewSeconds} giây trước khi bắt đầu. Phần hướng dẫn trong sân không tính giờ; đồng hồ ${total} phút chạy khi hướng dẫn kết thúc. ` + (opts.teacher ? 'Chế độ giảng viên đang bật.' : '')]),
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
