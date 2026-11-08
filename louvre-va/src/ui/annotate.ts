import { el, ui, download } from './dom';
import { gallery, type PhotoRecord, type Stroke } from '../gameplay/gallery';

const RED = '#ff2a1f';

/** Draw strokes onto a context sized w x h (strokes are normalised 0..1). A and V are straight two-point lines. */
export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number, handles = false, active = -1) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = RED; ctx.fillStyle = RED;
  const lw = Math.max(3, w / 300);
  strokes.forEach((s, idx) => {
    if (s.tool === 'dot') {
      for (const p of s.pts) { ctx.beginPath(); ctx.arc(p[0] * w, p[1] * h, lw * 2.2, 0, Math.PI * 2); ctx.fill(); }
    } else {
      ctx.lineWidth = lw; ctx.setLineDash(s.tool === 'V' ? [lw * 4, lw * 3] : []);
      ctx.beginPath(); s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * w, p[1] * h) : ctx.moveTo(p[0] * w, p[1] * h))); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (handles) {
      for (const p of s.pts) {
        ctx.beginPath(); ctx.arc(p[0] * w, p[1] * h, lw * 2.6, 0, Math.PI * 2);
        ctx.fillStyle = idx === active ? '#ffd23f' : 'rgba(255,255,255,0.95)'; ctx.fill();
        ctx.lineWidth = Math.max(1.5, lw * 0.5); ctx.strokeStyle = RED; ctx.stroke(); ctx.fillStyle = RED;
      }
    }
  });
  ctx.restore();
}

export async function renderAnnotated(rec: PhotoRecord): Promise<HTMLCanvasElement> {
  const img = await createImageBitmap(rec.blob);
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0); drawStrokes(ctx, rec.strokes, c.width, c.height);
  return c;
}

/**
 * Line-based annotation editor. A and V are straight segments: drag once to place, then drag either
 * endpoint handle to fine-tune. The subject dot is a single draggable point.
 */
export class Annotator {
  root: HTMLElement | null = null;
  onSaved: ((rec: PhotoRecord) => void) | null = null;

  async open(rec: PhotoRecord) {
    this.close();
    const img = await createImageBitmap(rec.blob);
    const strokes: Stroke[] = rec.strokes.map((s) => ({ tool: s.tool, pts: s.pts.length > 2 && s.tool !== 'dot' ? [s.pts[0], s.pts[s.pts.length - 1]] : s.pts.map((p) => [p[0], p[1]] as [number, number]) }));
    let tool: Stroke['tool'] = 'A';
    let active = -1;
    const canvas = el('canvas'); canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    const redraw = () => { ctx.drawImage(img, 0, 0); drawStrokes(ctx, strokes, canvas.width, canvas.height, true, active); };
    redraw();
    const tb = (t: Stroke['tool'], label: string) => { const b = el('button', { class: `tool ${t}` }, [label]); b.onclick = () => { tool = t; active = -1; [...top.querySelectorAll('.tool')].forEach((x) => x.classList.remove('active')); b.classList.add('active'); redraw(); }; return b; };
    const bA = tb('A', 'A nét liền'), bV = tb('V', 'V nét đứt'), bD = tb('dot', '● chủ thể'); bA.classList.add('active');
    const undo = el('button', {}, ['↶ Hoàn tác']); undo.onclick = () => { strokes.pop(); active = -1; redraw(); };
    const clear = el('button', { class: 'danger' }, ['Xoá nét']); clear.onclick = () => { strokes.length = 0; active = -1; redraw(); };
    const meta = rec.meta;
    const info = el('span', { class: 'muted' }, [`${meta.focal} mm · ${meta.aspect} · máy ${meta.cameraHeight} m · hướng ${meta.compassDeg}° · ${meta.label}`]);
    const top = el('div', { class: 'top' }, [bA, bV, bD, undo, clear, el('span', { class: 'legend' }, [el('i'), 'A', el('i', { class: 'dash' }), 'V', el('i', { class: 'dot' }), 'chủ thể']), info]);
    const hint = el('div', { class: 'muted', style: 'padding:0 12px;font-size:12px' }, ['Kéo một lần để đặt đường thẳng. Kéo đầu mút (chấm trắng) để chỉnh. Nét luôn thẳng, không bị méo tay.']);
    const note = el('textarea', { placeholder: 'Ghi 1 câu: đỉnh V dẫn mắt vào đâu?' }); note.value = rec.note;
    const save = el('button', { class: 'primary' }, ['Lưu']);
    const exportBtn = el('button', {}, ['⬇ Tải PNG đã vẽ']);
    const close = el('button', {}, ['Đóng']);
    const bottom = el('div', { class: 'bottom' }, [note, save, exportBtn, close]);
    this.root = el('div', { id: 'annot' }, [top, hint, el('div', { class: 'canvas-wrap' }, [canvas]), bottom]);
    ui().append(this.root);

    // pointer interaction: grab a handle if close, else start a new line / dot
    let drag: { stroke: Stroke; idx: number } | null = null;
    const norm = (e: PointerEvent): [number, number] => { const r = canvas.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
    const grab = (p: [number, number]): { stroke: Stroke; idx: number } | null => {
      const r = canvas.getBoundingClientRect(); const tol = 18 / r.width; // 18 css px
      for (let s = strokes.length - 1; s >= 0; s--) for (let i = 0; i < strokes[s].pts.length; i++) {
        const q = strokes[s].pts[i]; if (Math.hypot((q[0] - p[0]) * (r.width / r.height), q[1] - p[1]) * (r.height / r.width) < tol || Math.hypot(q[0] - p[0], q[1] - p[1]) < tol) return { stroke: strokes[s], idx: i };
      }
      return null;
    };
    canvas.onpointerdown = (e) => {
      canvas.setPointerCapture(e.pointerId); const p = norm(e);
      const g = grab(p);
      if (g) { drag = g; active = strokes.indexOf(g.stroke); redraw(); return; }
      if (tool === 'dot') { const s: Stroke = { tool: 'dot', pts: [p] }; strokes.push(s); drag = { stroke: s, idx: 0 }; }
      else { const s: Stroke = { tool, pts: [p, [p[0], p[1]]] }; strokes.push(s); drag = { stroke: s, idx: 1 }; }
      active = strokes.length - 1; redraw();
    };
    canvas.onpointermove = (e) => { if (!drag) return; drag.stroke.pts[drag.idx] = norm(e); redraw(); };
    canvas.onpointerup = () => {
      if (drag && drag.stroke.tool !== 'dot') {
        const [a, b] = drag.stroke.pts; const len = Math.hypot((a[0] - b[0]) * canvas.width, (a[1] - b[1]) * canvas.height);
        if (len < 8) { const i = strokes.indexOf(drag.stroke); if (i >= 0) strokes.splice(i, 1); active = -1; } // a tap without drag places nothing
      }
      drag = null; redraw();
    };
    canvas.onpointercancel = () => { drag = null; redraw(); };
    const persist = async () => { rec.strokes = strokes; rec.note = note.value.trim(); await gallery.update(rec); this.onSaved?.(rec); };
    save.onclick = async () => { await persist(); this.close(); };
    exportBtn.onclick = async () => { await persist(); const c = await renderAnnotated(rec); c.toBlob((b) => b && download(b, `${rec.group || 'nhom'}-${rec.id}.png`), 'image/png'); };
    close.onclick = () => this.close();
  }
  close() { this.root?.remove(); this.root = null; }
}
