import { el, ui, download } from './dom';
import { gallery, type PhotoRecord, type Stroke } from '../gameplay/gallery';

const RED = '#ff2a1f';

/** Draw strokes onto a context sized w x h (strokes are normalised 0..1). */
export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = RED; ctx.fillStyle = RED;
  const lw = Math.max(3, w / 300);
  for (const s of strokes) {
    if (s.tool === 'dot') { for (const p of s.pts) { ctx.beginPath(); ctx.arc(p[0] * w, p[1] * h, lw * 2.2, 0, Math.PI * 2); ctx.fill(); } continue; }
    ctx.lineWidth = lw; ctx.setLineDash(s.tool === 'V' ? [lw * 4, lw * 3] : []);
    ctx.beginPath(); s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * w, p[1] * h) : ctx.moveTo(p[0] * w, p[1] * h))); ctx.stroke();
  }
  ctx.restore();
}

export async function renderAnnotated(rec: PhotoRecord): Promise<HTMLCanvasElement> {
  const img = await createImageBitmap(rec.blob);
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0); drawStrokes(ctx, rec.strokes, c.width, c.height);
  return c;
}

export class Annotator {
  root: HTMLElement | null = null;
  onSaved: ((rec: PhotoRecord) => void) | null = null;

  async open(rec: PhotoRecord) {
    this.close();
    const img = await createImageBitmap(rec.blob);
    const strokes: Stroke[] = rec.strokes.map((s) => ({ tool: s.tool, pts: s.pts.map((p) => [p[0], p[1]] as [number, number]) }));
    let tool: Stroke['tool'] = 'A';
    const canvas = el('canvas'); canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    const redraw = () => { ctx.drawImage(img, 0, 0); drawStrokes(ctx, strokes, canvas.width, canvas.height); };
    redraw();
    const tb = (t: Stroke['tool'], label: string) => { const b = el('button', { class: `tool ${t}` }, [label]); b.onclick = () => { tool = t; [...top.querySelectorAll('.tool')].forEach((x) => x.classList.remove('active')); b.classList.add('active'); }; return b; };
    const bA = tb('A', 'A nét liền'), bV = tb('V', 'V nét đứt'), bD = tb('dot', '● chủ thể'); bA.classList.add('active');
    const undo = el('button', {}, ['↶ Hoàn tác']); undo.onclick = () => { strokes.pop(); redraw(); };
    const clear = el('button', { class: 'danger' }, ['Xoá nét']); clear.onclick = () => { strokes.length = 0; redraw(); };
    const meta = rec.meta;
    const info = el('span', { class: 'muted' }, [`${meta.focal} mm · ${meta.aspect} · máy ${meta.cameraHeight} m · hướng ${meta.compassDeg}° · ${meta.label}`]);
    const top = el('div', { class: 'top' }, [bA, bV, bD, undo, clear, el('span', { class: 'legend' }, [el('i'), 'A', el('i', { class: 'dash' }), 'V', el('i', { class: 'dot' }), 'chủ thể']), info]);
    const note = el('textarea', { placeholder: 'Ghi 1 câu: đỉnh V dẫn mắt vào đâu?' }); note.value = rec.note;
    const save = el('button', { class: 'primary' }, ['Lưu']);
    const exportBtn = el('button', {}, ['⬇ Tải PNG đã vẽ']);
    const close = el('button', {}, ['Đóng']);
    const bottom = el('div', { class: 'bottom' }, [note, save, exportBtn, close]);
    this.root = el('div', { id: 'annot' }, [top, el('div', { class: 'canvas-wrap' }, [canvas]), bottom]);
    ui().append(this.root);

    // pointer drawing in normalised coordinates
    let cur: Stroke | null = null;
    const norm = (e: PointerEvent): [number, number] => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    canvas.onpointerdown = (e) => { canvas.setPointerCapture(e.pointerId); const p = norm(e); if (tool === 'dot') { strokes.push({ tool: 'dot', pts: [p] }); redraw(); return; } cur = { tool, pts: [p] }; strokes.push(cur); };
    canvas.onpointermove = (e) => { if (!cur) return; cur.pts.push(norm(e)); redraw(); };
    canvas.onpointerup = () => { if (cur && cur.pts.length === 1) cur.pts.push([cur.pts[0][0] + 0.001, cur.pts[0][1]]); cur = null; redraw(); };
    const persist = async () => { rec.strokes = strokes; rec.note = note.value.trim(); await gallery.update(rec); this.onSaved?.(rec); };
    save.onclick = async () => { await persist(); this.close(); };
    exportBtn.onclick = async () => { await persist(); const c = await renderAnnotated(rec); c.toBlob((b) => b && download(b, `${rec.group || 'nhom'}-${rec.id}.png`), 'image/png'); };
    close.onclick = () => this.close();
  }
  close() { this.root?.remove(); this.root = null; }
}
