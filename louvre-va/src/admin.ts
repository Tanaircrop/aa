import './ui/styles.css';
import { config, pools, smallPyramids, wings } from './data/config';
import { CLOUD } from './net/cloud';
import { el } from './ui/dom';

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
interface Result { device_id: string; group_name: string; points: number; discovered: number; eggs: string[]; photos: number; annotated: number; answer: number | null; answer_correct: boolean | null; finished_at: string }

function dashboard() {
  root.innerHTML = '';
  root.style.cssText = 'position:fixed;inset:0;overflow:auto;padding:16px;display:grid;grid-template-columns:minmax(320px,1fr) minmax(320px,1fr);gap:16px;align-content:start';
  const mapCanvas = el('canvas', { style: 'width:100%;aspect-ratio:1.3;border-radius:12px;border:1px solid var(--line);background:#101318' });
  const status = el('div', { class: 'muted' }, ['Đang tải…']);
  const live = el('div', { class: 'panel', style: 'padding:14px' }, [el('h2', {}, ['Bản đồ trực tiếp (cập nhật 3 giây)']), mapCanvas, status]);
  const table = el('div');
  const results = el('div', { class: 'panel', style: 'padding:14px' }, [el('h2', {}, ['Thiết bị và kết quả']), table]);
  const photosBox = el('div', { class: 'panel', style: 'padding:14px;grid-column:1 / -1' }, [el('h2', {}, ['Ảnh của nhóm']), el('p', { class: 'muted' }, ['Bấm một nhóm trong bảng để xem ảnh (kèm nét vẽ và ghi chú).'])]);
  const tools = el('div', { class: 'row', style: 'grid-column:1 / -1;justify-content:space-between' }, [
    el('h1', { style: 'margin:0;font-size:20px' }, ['Louvre V+A · Giảng viên']),
    el('div', { class: 'row' }, [
      el('a', { href: '/?mode=teacher', target: '_blank' }, [el('button', {}, ['Mở game chế độ giảng viên'])]),
      (() => { const b = el('button', { class: 'danger' }, ['Xoá bảng cho lớp mới']); b.onclick = async () => { if (confirm('Xoá toàn bộ vị trí, kết quả và ảnh trên server? Ảnh trên máy học viên vẫn còn.')) { await api('action=reset&confirm=yes', 'POST'); refresh(); } }; return b; })(),
      (() => { const b = el('button', {}, ['Đăng xuất']); b.onclick = () => { sessionStorage.removeItem('lva.admin'); login(); }; return b; })(),
    ]),
  ]);
  root.append(tools, live, results, photosBox);

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
    t.append(el('tr', { html: '<td><b>Nhóm</b></td><td><b>Trạng thái</b></td><td><b>Còn</b></td><td><b>Ảnh</b></td><td><b>Điểm</b></td><td><b>Góc</b></td><td><b>Egg</b></td><td><b>Câu hỏi</b></td>' }));
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
      ]);
      tr.onclick = () => showPhotos(d);
      t.append(tr);
    }
    if (!rows.length) t.append(el('tr', { html: '<td colspan="8" class="muted">Chưa có thiết bị nào trong 6 giờ qua.</td>' }));
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
