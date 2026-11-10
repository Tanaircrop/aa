import './ui/styles.css';
import { config, pools, smallPyramids, wings } from './data/config';
import { CLOUD } from './net/cloud';
import { el, download } from './ui/dom';
import { awards, gradeGroup, mergeDevices, toCSV, type GroupGrade, type GroupInput, type PhotoGrade } from './gameplay/grading';
import type { PhotoMeta, Stroke } from './gameplay/gallery';

/**
 * Teacher dashboard: live top-down map of every device, results table, per-group photo browser.
 * Reads through the lva-admin edge function with the admin token (sessionStorage).
 */
const FN = `${CLOUD.url}/functions/v1/lva-admin`;
const root = document.getElementById('app')!;
document.body.style.overflow = 'auto';
let token = sessionStorage.getItem('lva.admin') || new URL(location.href).searchParams.get('token') || '';

async function api(params: string, method = 'GET') {
  const r = await fetch(`${FN}?${params}`, { method, headers: { 'x-admin-token': token, apikey: CLOUD.key, Authorization: `Bearer ${CLOUD.key}` } });
  if (r.status === 401) throw new Error('unauthorized');
  return r.json();
}

function login(msg = '') {
  root.innerHTML = '';
  const input = el('input', { type: 'password', placeholder: 'Mã admin' }); const btn = el('button', { class: 'primary' }, ['Vào']);
  const form = el('div', { class: 'modal' }, [el('div', { class: 'panel', style: 'max-width:420px' }, [el('h1', {}, ['Bảng điều khiển giảng viên']), el('p', { class: 'muted' }, ['Nhập mã admin để xem vị trí thiết bị, kết quả và ảnh của các nhóm.']), el('div', { class: 'row' }, [input, btn]), el('p', { class: 'muted', style: 'color:#ff3b30' }, [msg])])]);
  root.append(form);
  const go = async () => { token = input.value.trim(); sessionStorage.setItem('lva.admin', token); try { await api('action=overview'); dashboard(); } catch { login('Sai mã.'); } };
  btn.onclick = go; input.onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

interface Device { device_id: string; group_name: string; x: number; y: number; alt: number; heading: number; mode: string; phase: string; remaining: number; photos: number; points: number; discovered: number; eggs: string[]; updated_at: string }
interface Result { device_id: string; group_name: string; points: number; discovered: number; eggs: string[]; photos: number; annotated: number; answer: number | null; answer_correct: boolean | null; hint_used?: boolean; finished_at: string }

function dashboard() {
  root.innerHTML = '';
  root.style.cssText = 'position:fixed;inset:0;overflow:auto;padding:16px;display:grid;grid-template-columns:minmax(320px,1fr) minmax(320px,1fr);gap:16px;align-content:start';
  const mapCanvas = el('canvas', { style: 'width:100%;aspect-ratio:1.3;border-radius:12px;border:1px solid var(--line);background:#101318' });
  const status = el('div', { class: 'muted' }, ['Đang tải…']);
  const live = el('div', { class: 'panel', style: 'padding:14px' }, [el('h2', {}, ['Bản đồ trực tiếp (cập nhật 3 giây)']), mapCanvas, status]);
  const table = el('div');
  const results = el('div', { class: 'panel', style: 'padding:14px' }, [el('h2', {}, ['Thiết bị và kết quả']), table]);
  const photosBox = el('div', { class: 'panel', style: 'padding:14px;grid-column:1 / -1' }, [el('h2', {}, ['Ảnh của nhóm']), el('p', { class: 'muted' }, ['Bấm một nhóm trong bảng để xem ảnh (kèm nét vẽ và ghi chú).'])]);
  const gradeBody = el('div');
  const gradeBtn = el('button', { class: 'primary' }, ['Chấm toàn bộ lớp']);
  const csvBtn = el('button', {}, ['Tải CSV']); csvBtn.disabled = true;
  const sinceSel = el('select', {}, [['3', '3 giờ gần nhất'], ['8', '8 giờ gần nhất'], ['24', '24 giờ gần nhất'], ['0', 'Tất cả (gồm cả buổi thử)']].map(([v, t]) => { const o = el('option', { value: v }, [t]); if (v === '8') o.selected = true; return o; })) as HTMLSelectElement;
  const strictBox = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const gradeBox = el('div', { class: 'panel', style: 'padding:14px;grid-column:1 / -1' }, [
    el('div', { class: 'row', style: 'justify-content:space-between' }, [el('h2', { style: 'margin:0' }, ['Chấm điểm tự động']), el('div', { class: 'row' }, [sinceSel, gradeBtn, csvBtn])]),
    el('p', { class: 'muted' }, ['Tải mọi ảnh của lớp, chiếu lại sống kim tự tháp và hai bờ hồ vào từng ảnh từ tư thế máy đã lưu, so với nét A, nét V, chấm đỏ và câu ghi chú của nhóm. Nét xanh lá trong ảnh là nét chuẩn máy tính vẽ, nét đỏ là của nhóm. Các máy cùng tên nhóm (không phân biệt hoa thường, "Nhóm 10" = "nhóm 10" = "10") được gộp làm một. Máy để tên mặc định "Nhóm" không biết thuộc nhóm nào: gõ tên nhóm vào ô trong bảng để gộp.']),
    el('label', { class: 'muted', style: 'display:flex;gap:8px;align-items:flex-start;margin:6px 0' }, [strictBox, el('span', {}, ['Bắt buộc chấm đỏ chủ thể và câu ghi chú trên ảnh mới tính là vẽ đủ (đúng như đề). Bỏ chọn: chỉ cần hai nét A và hai nét V bám đúng sống kim tự tháp và bờ hồ.'])]),
    gradeBody,
  ]);
  const tools = el('div', { class: 'row', style: 'grid-column:1 / -1;justify-content:space-between' }, [
    el('h1', { style: 'margin:0;font-size:20px' }, ['Louvre V+A · Giảng viên']),
    el('div', { class: 'row' }, [
      el('a', { href: '/?mode=teacher', target: '_blank' }, [el('button', {}, ['Mở game chế độ giảng viên'])]),
      (() => { const b = el('button', { class: 'danger' }, ['Xoá bảng cho lớp mới']); b.onclick = async () => { if (confirm('Xoá toàn bộ vị trí, kết quả và ảnh trên server? Ảnh trên máy học viên vẫn còn.')) { await api('action=reset&confirm=yes', 'POST'); refresh(); } }; return b; })(),
      (() => { const b = el('button', {}, ['Đăng xuất']); b.onclick = () => { sessionStorage.removeItem('lva.admin'); login(); }; return b; })(),
    ]),
  ]);
  root.append(tools, live, results, gradeBox, photosBox);

  let devices: Device[] = [], res: Result[] = [];
  const drawMap = () => {
    const c = mapCanvas; const w = c.clientWidth, h = c.clientHeight; if (c.width !== w * 2) { c.width = w * 2; c.height = h * 2; }
    const ctx = c.getContext('2d')!; ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, w, h);
    const scale = w / 300; const cx = w / 2 + 50 * scale, cy = h / 2;
    const X = (x: number) => cx + x * scale, Y = (y: number) => cy - y * scale;
    ctx.fillStyle = 'rgba(220,200,160,0.3)';
    for (const wg of wings) {
      if (wg.side === 'north') ctx.fillRect(X(wg.xFrom!), Y(wg.facadeY! + wg.depth), (wg.xTo! - wg.xFrom!) * scale, wg.depth * scale);
      else if (wg.side === 'south') ctx.fillRect(X(wg.xFrom!), Y(wg.facadeY!), (wg.xTo! - wg.xFrom!) * scale, wg.depth * scale);
      else ctx.fillRect(X(wg.facadeX!), Y(wg.yTo!), wg.depth * scale, (wg.yTo! - wg.yFrom!) * scale);
    }
    ctx.fillStyle = 'rgba(80,150,200,0.6)';
    for (const p of pools) { ctx.beginPath(); p.pts.forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])))); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = '#e8c07a'; ctx.lineWidth = 1.5; ctx.beginPath();
    (config.mainPyramid.corners as [number, number][]).forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])))); ctx.closePath(); ctx.stroke();
    for (const sp of smallPyramids) ctx.strokeRect(X(sp.center[0]) - 3, Y(sp.center[1]) - 3, 6, 6);
    const cr = config.carrousel; ctx.strokeStyle = 'rgba(200,200,200,0.5)'; ctx.beginPath(); ctx.arc(X(cr.center[0]), Y(cr.center[1]), cr.ringOuter * scale, 0, Math.PI * 2); ctx.stroke();
    for (const e of config.easterEggs) { ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(e.id, X(e.pos[0]) - 4, Y(e.pos[1]) + 4); }
    const now = Date.now();
    devices.forEach((d, i) => {
      const age = (now - new Date(d.updated_at).getTime()) / 1000; const stale = age > 20;
      const hue = (i * 47) % 360; const px = X(d.x), py = Y(d.y);
      ctx.fillStyle = stale ? 'rgba(150,150,150,0.5)' : `hsl(${hue} 80% 60%)`;
      ctx.beginPath(); ctx.arc(px, py, d.mode === 'fly' ? 6 : 4.5, 0, Math.PI * 2); ctx.fill();
      const r = (d.heading * Math.PI) / 180; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(r) * 10, py - Math.sin(r) * 10); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.fillText(`${d.group_name || d.device_id.slice(0, 5)}${d.mode === 'fly' ? ` ↑${Math.round(d.alt)}m` : ''}`, px + 8, py - 6);
    });
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const renderTable = () => {
    table.innerHTML = '';
    const t = el('table', { class: 'keys' });
    t.append(el('tr', { html: '<td><b>Nhóm</b></td><td><b>Trạng thái</b></td><td><b>Còn</b></td><td><b>Ảnh</b></td><td><b>Điểm</b></td><td><b>Góc</b></td><td><b>Egg</b></td><td><b>Câu hỏi</b></td><td><b>Gợi ý</b></td>' }));
    const byDevice = new Map(res.map((r) => [r.device_id, r]));
    const rows = [...devices];
    for (const r of res) if (!rows.find((d) => d.device_id === r.device_id)) rows.push({ device_id: r.device_id, group_name: r.group_name, x: 0, y: 0, alt: 0, heading: 0, mode: 'walk', phase: 'ended', remaining: 0, photos: r.photos, points: r.points, discovered: r.discovered, eggs: r.eggs, updated_at: r.finished_at });
    for (const d of rows) {
      const r = byDevice.get(d.device_id);
      const age = (Date.now() - new Date(d.updated_at).getTime()) / 1000;
      const phase = { intro: 'Màn hình vào', preview: 'Xem mẫu', tutorial: 'Hướng dẫn', playing: 'Đang chơi', grace: 'Xuất bài', ended: 'Xong' }[d.phase] ?? d.phase;
      const tr = el('tr', { style: 'cursor:pointer' }, [
        el('td', {}, [el('b', {}, [d.group_name || '(chưa đặt)']), el('div', { class: 'muted', style: 'font-size:11px' }, [d.device_id.slice(0, 8)])]),
        el('td', {}, [`${phase}${age > 20 && d.phase !== 'ended' ? ' · mất kết nối' : ''}`]),
        el('td', {}, [d.phase === 'playing' ? fmt(d.remaining) : '—']),
        el('td', {}, [`${d.photos}`]), el('td', {}, [`⭐ ${r?.points ?? d.points}`]), el('td', {}, [`${r?.discovered ?? d.discovered}/5`]),
        el('td', {}, [(r?.eggs ?? d.eggs ?? []).join(' ') || '—']),
        el('td', {}, [r?.answer == null ? '—' : `${r.answer} ${r.answer_correct ? '✓' : '✗'}`]),
        el('td', {}, [r ? (r.hint_used ? 'đã dùng' : 'không') : '—']),
      ]);
      tr.onclick = () => showPhotos(d);
      t.append(tr);
    }
    if (!rows.length) t.append(el('tr', { html: '<td colspan="9" class="muted">Chưa có thiết bị nào trong 6 giờ qua.</td>' }));
    table.append(t);
  };
  const showPhotos = async (d: Device) => {
    photosBox.innerHTML = ''; photosBox.append(el('h2', {}, [`Ảnh của ${d.group_name || d.device_id}`]), el('p', { class: 'muted' }, ['Đang tải…']));
    const data = await api(`action=photos&device_id=${encodeURIComponent(d.device_id)}`);
    photosBox.innerHTML = ''; photosBox.append(el('h2', {}, [`Ảnh của ${d.group_name || d.device_id} (${data.photos.length})`]));
    const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px' });
    for (const p of data.photos) {
      const cv = el('canvas', { style: 'width:100%;border-radius:8px;background:#000' });
      const img = new Image(); img.crossOrigin = 'anonymous'; img.src = p.url;
      img.onload = () => { cv.width = img.width; cv.height = img.height; const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0); drawStrokes(ctx, p.strokes, cv.width, cv.height); };
      const m = p.meta || {};
      grid.append(el('div', {}, [cv, el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px' }, [`${m.hasA && m.hasV ? 'V+A ' : m.hasA ? 'A ' : m.hasV ? 'V ' : ''}${'★'.repeat(m.stars ?? 1)} · ${m.focal} mm · ${m.aspect} · máy ${m.cameraHeight} m · ${m.label ?? ''}`]), el('div', { style: 'color:#ffd23f;font-size:13px' }, [p.note || '(chưa ghi chú)'])]));
    }
    photosBox.append(grid);
  };
  let graded: GroupGrade[] = [];
  let cache: { inputs: GroupInput[]; urlOf: Map<string, string | null> } | null = null;
  const ALIAS = 'lva.alias';
  const loadAlias = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(ALIAS) || '{}'); } catch { return {}; } };
  const saveAlias = (id: string, name: string) => { const a = loadAlias(); if (name.trim()) a[id] = name.trim(); else delete a[id]; try { localStorage.setItem(ALIAS, JSON.stringify(a)); } catch { /* ignore */ } };
  const compute = () => {
    if (!cache) return;
    const merged = mergeDevices(cache.inputs, loadAlias());
    graded = merged.map((g) => gradeGroup(g, { strict: strictBox.checked }));
    renderGrading(graded, cache.urlOf); csvBtn.disabled = false;
  };
  strictBox.onchange = compute;
  const runGrading = async () => {
    gradeBtn.disabled = true; gradeBody.innerHTML = ''; gradeBody.append(el('p', { class: 'muted' }, ['Đang tải ảnh…']));
    try {
      const data = await api('action=all_photos') as { photos: { id: string; device_id: string; group_name: string; meta: PhotoMeta; strokes: Stroke[]; note: string; created_at: string; url: string | null }[] };
      const hours = Number(sinceSel.value); const cutoff = hours ? Date.now() - hours * 3600_000 : 0;
      const fresh = (t?: string | null) => !cutoff || (t ? new Date(t).getTime() >= cutoff : false);
      const byDevice = new Map<string, typeof data.photos>();
      for (const p of data.photos) { if (!fresh(p.created_at)) continue; if (!byDevice.has(p.device_id)) byDevice.set(p.device_id, []); byDevice.get(p.device_id)!.push(p); }
      const resBy = new Map(res.filter((r) => fresh(r.finished_at)).map((r) => [r.device_id, r])); const devBy = new Map(devices.filter((d) => fresh(d.updated_at)).map((d) => [d.device_id, d]));
      const ids = new Set([...byDevice.keys(), ...resBy.keys(), ...devBy.keys()]);
      const inputs: GroupInput[] = [...ids].map((id) => {
        const r = resBy.get(id), d = devBy.get(id), ph = byDevice.get(id) ?? [];
        return { device_id: id, group_name: r?.group_name || d?.group_name || ph[0]?.group_name || '', photos: ph, points: r?.points ?? d?.points ?? 0, discovered: r?.discovered ?? d?.discovered ?? 0, eggs: r?.eggs ?? d?.eggs ?? [], hint_used: !!r?.hint_used, hint_known: !!r, answer: r?.answer ?? null, answer_correct: r?.answer_correct ?? null, finished_at: r?.finished_at ?? null };
      }).filter((g) => g.photos.length > 0 || g.points > 0); // a phone that only opened the page is not a group
      cache = { inputs, urlOf: new Map(data.photos.map((p) => [p.id, p.url])) };
      compute();
    } catch (e) { gradeBody.innerHTML = ''; gradeBody.append(el('p', { style: 'color:#ff3b30' }, ['Lỗi: ' + (e as Error).message])); }
    gradeBtn.disabled = false;
  };
  gradeBtn.onclick = runGrading;
  csvBtn.onclick = () => download(new Blob(['\ufeff' + toCSV(graded)], { type: 'text/csv;charset=utf-8' }), `louvre-va-cham-diem-${new Date().toISOString().slice(0, 10)}.csv`);
  const renderGrading = (groups: GroupGrade[], urlOf: Map<string, string | null>) => {
    gradeBody.innerHTML = '';
    if (!groups.length) { gradeBody.append(el('p', { class: 'muted' }, ['Chưa có nhóm nào trong khoảng thời gian đã chọn.'])); return; }
    const w = awards(groups);
    const name = (g: GroupGrade | null | undefined) => g ? g.group : '—';
    const awardRows: [string, string, string][] = [
      ['Nhất · Mắt kiến trúc', name(w.first), w.first ? `${w.first.fair.total} điểm chấm lại, ${w.first.corners.length}/5 góc chuẩn, ${w.first.cornersComplete.length} góc có nét vẽ đúng${w.first.hint ? ', có dùng gợi ý' : ''}` : 'chưa nhóm nào đủ điều kiện'],
      ['Nhì · Thợ săn góc', name(w.second), w.second ? `${w.second.cornersComplete.length} góc chuẩn có nét vẽ đúng, không dùng gợi ý` : 'chưa có nhóm đủ điều kiện không dùng gợi ý (gợi ý chỉ biết với máy đã nộp câu hỏi cuối)'],
      ['Ba · Người kể chuyện', w.storyteller.length ? 'giảng viên chọn' : '—', w.storyteller.slice(0, 3).map((x) => `${x.group.group}: “${x.photo.note.text.slice(0, 70)}”`).join(' · ') || 'chưa có câu giải thích đạt'],
      ['Phụ · Tinh mắt', w.eyes.map((g) => g.group).join(', ') || '—', 'chụp được cả X và C'],
      ['Phụ · Góc tranh luận', w.debate.map((g) => g.group).join(', ') || '—', 'ảnh V+A tại T1 / T2 vẽ đúng, giảng viên nghe lập luận'],
      ['Phụ · Drone', w.drone.length ? [...new Set(w.drone.map((d) => d.group.group))].join(', ') : '—', `${w.drone.length} ảnh bay có V+A, cả lớp bình chọn`],
    ];
    const at = el('table', { class: 'keys' }); for (const [a, b, c] of awardRows) at.append(el('tr', {}, [el('td', {}, [el('b', {}, [a])]), el('td', { style: 'color:#ffd23f;font-weight:600' }, [b]), el('td', { class: 'muted' }, [c])]));
    gradeBody.append(el('h3', { style: 'margin:8px 0 4px;font-size:15px' }, ['Đề xuất trao giải']), at);

    const t = el('table', { class: 'keys', style: 'margin-top:10px' });
    t.append(el('tr', { html: '<td><b>#</b></td><td><b>Nhóm</b></td><td><b>Điểm chấm lại</b></td><td><b>Điểm game</b></td><td><b>Ảnh</b></td><td><b>Góc chuẩn có V+A</b></td><td><b>Nét vẽ đúng</b></td><td><b>Egg</b></td><td><b>Gợi ý</b></td><td><b>Câu hỏi</b></td><td><b>Dự giải</b></td>' }));
    w.ranking.forEach((g, i) => {
      const nameCell = el('td', {}, [el('b', {}, [g.group]), el('div', { class: 'muted', style: 'font-size:11px' }, [`${g.devices} máy · ${g.ids.map((x) => x.slice(2, 8)).join(' ')}`])]);
      if (g.unnamed) {
        const inp = el('input', { placeholder: 'gõ tên nhóm để gộp, vd 10', style: 'width:150px;margin-top:4px;font-size:12px', title: 'Máy này để tên mặc định. Gõ tên nhóm thật rồi nhấn Enter.' }) as HTMLInputElement;
        inp.onclick = (e) => e.stopPropagation();
        inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { saveAlias(g.device_id, inp.value); compute(); } };
        nameCell.append(inp);
      }
      const tr = el('tr', { style: 'cursor:pointer' }, [
        el('td', {}, [`${i + 1}`]), nameCell,
        el('td', { style: 'font-weight:700;color:#ffd23f' }, [`${g.fair.total}`]), el('td', { class: 'muted' }, [`${g.points}`]), el('td', {}, [`${g.photos.length}`]),
        el('td', {}, [`${g.corners.length}/5 ${g.corners.map((c) => c.replace('Góc ', '')).join(' ')}${g.debateCorners.length ? ' · ' + g.debateCorners.join(' ') : ''}`]),
        el('td', {}, [`${g.cornersComplete.length} (${g.cornersComplete.map((c) => c.replace('Góc ', '')).join(' ') || '—'})`]), el('td', {}, [g.eggs.join(' ') || '—']),
        el('td', {}, [g.hintKnown ? (g.hint ? 'có' : 'không') : 'chưa rõ']), el('td', {}, [g.answer == null ? '—' : `${g.answer} ${g.answerCorrect ? '✓' : '✗'}`]),
        el('td', { style: g.eligible ? 'color:#35d07f' : 'color:#ff3b30' }, [g.eligible ? 'đủ' : g.missing.join('; ')]),
      ]);
      tr.onclick = () => showGraded(g, urlOf);
      t.append(tr);
      if (g.flags.length) t.append(el('tr', {}, [el('td'), el('td', { colspan: '10', style: 'color:#ff9f0a;font-size:12px' }, ['⚠ ' + g.flags.join(' · ')])]));
    });
    gradeBody.append(el('h3', { style: 'margin:14px 0 4px;font-size:15px' }, ['Bảng xếp hạng theo điểm chấm lại']), t,
      el('p', { class: 'muted' }, ['Điểm chấm lại = 100 mỗi góc chuẩn có ảnh V+A (tối đa 5) + 30 mỗi góc tranh luận + nét vẽ đúng (tối đa 30 mỗi góc) + chấm đỏ và câu ghi chú (tối đa 15 mỗi góc) + 40 mỗi Easter egg + 100 nếu trả lời đúng câu cuối. Chụp lặp một góc không cộng thêm. Điểm game là bộ đếm cũ trong máy, chụp nhiều là tăng nên chỉ để tham khảo. Hoà điểm: không dùng gợi ý, nhiều ảnh 3 sao, nộp sớm. Bấm một nhóm để xem phân tích từng ảnh.']));
  };
  const showGraded = (g: GroupGrade, urlOf: Map<string, string | null>) => {
    photosBox.innerHTML = '';
    photosBox.append(el('h2', {}, [`Phân tích ảnh của ${g.group} (${g.photos.length}, ${g.devices} máy)`]), el('p', { class: 'muted' }, [g.eligible ? 'Đủ điều kiện dự giải.' : `Chưa đủ điều kiện: ${g.missing.join('; ')}.`, ' Nét xanh lá: sống kim tự tháp (liền) và bờ hồ (đứt) máy tính chiếu từ tư thế máy. Nét đỏ: nhóm vẽ.']));
    const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px' });
    for (const p of g.photos) grid.append(photoCard(p, urlOf.get(p.id) ?? null));
    photosBox.append(grid); photosBox.scrollIntoView({ behavior: 'smooth' });
  };
  const photoCard = (p: PhotoGrade, url: string | null) => {
    const cv = el('canvas', { style: 'width:100%;border-radius:8px;background:#000' });
    const strokes = p.expected; const draw = (img?: HTMLImageElement) => {
      const w = img?.width ?? 1200, h = img?.height ?? 800; cv.width = w; cv.height = h; const ctx = cv.getContext('2d')!;
      if (img) ctx.drawImage(img, 0, 0); else { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, w, h); }
      ctx.save(); ctx.strokeStyle = '#35d07f'; ctx.lineWidth = Math.max(2, w / 400); ctx.lineCap = 'round';
      for (const r of strokes.ridges) { ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(r[0][0] * w, r[0][1] * h); ctx.lineTo(r[1][0] * w, r[1][1] * h); ctx.stroke(); }
      for (const e of strokes.edges) { ctx.setLineDash([w / 80, w / 120]); ctx.beginPath(); ctx.moveTo(e[0][0] * w, e[0][1] * h); ctx.lineTo(e[1][0] * w, e[1][1] * h); ctx.stroke(); }
      if (strokes.tipUV) { ctx.fillStyle = '#35d07f'; ctx.beginPath(); ctx.arc(strokes.tipUV[0] * w, strokes.tipUV[1] * h, w / 150, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      drawStrokes(ctx, p.strokes, w, h);
    };
    draw();
    if (url) { const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; img.onload = () => draw(img); }
    const tag = (s: string) => el('span', { style: `display:inline-block;padding:1px 7px;border-radius:6px;font-size:12px;margin:2px 4px 2px 0;background:${s === 'đúng' ? 'rgba(53,208,127,.25)' : s === 'gần đúng' ? 'rgba(255,210,63,.25)' : 'rgba(255,59,48,.25)'}` }, [s]);
    return el('div', {}, [cv,
      el('div', { style: 'font-size:13px;margin-top:6px' }, [el('b', {}, [p.label ? `${p.label}` : p.cls === null ? 'Không ở mũi hồ' : 'Mũi hồ loại']), ` · ${p.va ? 'V+A' : p.hasA ? 'chỉ A' : p.hasV ? 'chỉ V' : 'chưa có V, A'} · ${'★'.repeat(p.stars)} · ${p.mode === 'fly' ? 'drone' : 'đi bộ'} · ${p.complete ? 'vẽ đủ' : p.drawnOk ? 'A, V đúng' : 'chưa đủ'}`]),
      el('div', {}, ['A ', tag(p.a.status), 'V ', tag(p.v.status), 'chấm ', tag(p.dot.status), 'ghi chú ', tag(p.note.status)]),
      el('ul', { class: 'muted', style: 'margin:4px 0 0;padding-left:18px;font-size:12px' }, p.verdict.map((v) => el('li', {}, [v]))),
      el('div', { style: 'color:#ffd23f;font-size:13px;margin-top:4px' }, [p.note.text || '(chưa ghi chú)']),
    ]);
  };
  const refresh = async () => {
    try {
      const data = await api('action=overview'); devices = data.devices; res = data.results;
      drawMap(); renderTable();
      status.textContent = `${devices.filter((d) => (Date.now() - new Date(d.updated_at).getTime()) / 1000 < 20).length} thiết bị đang online · ${data.photoCount} ảnh trên server · ${new Date().toLocaleTimeString('vi-VN')}`;
    } catch (e) { status.textContent = 'Lỗi tải: ' + (e as Error).message; if ((e as Error).message === 'unauthorized') login('Mã hết hạn hoặc sai.'); }
  };
  refresh(); setInterval(refresh, 3000);
  window.addEventListener('resize', drawMap);
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: { tool: string; pts: [number, number][] }[], w: number, h: number) {
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#ff2a1f'; ctx.fillStyle = '#ff2a1f'; const lw = Math.max(3, w / 300);
  for (const s of strokes || []) {
    if (s.tool === 'dot') { for (const p of s.pts) { ctx.beginPath(); ctx.arc(p[0] * w, p[1] * h, lw * 2.2, 0, Math.PI * 2); ctx.fill(); } continue; }
    ctx.lineWidth = lw; ctx.setLineDash(s.tool === 'V' ? [lw * 4, lw * 3] : []); ctx.beginPath(); s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * w, p[1] * h) : ctx.moveTo(p[0] * w, p[1] * h))); ctx.stroke();
  }
  ctx.restore();
}

if (token) { api('action=overview').then(dashboard).catch(() => login()); } else login();
