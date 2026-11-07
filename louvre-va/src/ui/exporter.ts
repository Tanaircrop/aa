import { gallery, type PhotoRecord } from '../gameplay/gallery';
import { renderAnnotated } from './annotate';
import { download, toast } from './dom';

/** One summary page (PNG) with every photo, its drawing, metadata and the one-line note. */
export async function exportSummary(group: string) {
  const recs = await gallery.list(group);
  if (!recs.length) { toast('Chưa có ảnh để xuất'); return; }
  const cols = recs.length > 4 ? 3 : 2; const cellW = 900; const pad = 40; const textH = 150;
  const cellH = Math.round(cellW / 1.5) + textH;
  const rows = Math.ceil(recs.length / cols);
  const W = cols * cellW + (cols + 1) * pad; const H = 200 + rows * (cellH + pad);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#111317'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e8c07a'; ctx.font = 'bold 56px sans-serif'; ctx.fillText(`Bài tập V + A · Nhóm ${group}`, pad, 90);
  ctx.fillStyle = '#a8adb5'; ctx.font = '28px sans-serif';
  ctx.fillText(`${new Date().toLocaleString('vi-VN')} · ${recs.length} ảnh · A nét liền, V nét đứt, chấm đỏ là chủ thể`, pad, 140);
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i]; const col = i % cols, row = Math.floor(i / cols);
    const x = pad + col * (cellW + pad), y = 200 + row * (cellH + pad);
    const img = await renderAnnotated(r);
    const ar = img.width / img.height; let w = cellW, h = cellW / ar; if (h > cellH - textH) { h = cellH - textH; w = h * ar; }
    ctx.fillStyle = '#000'; ctx.fillRect(x, y, cellW, cellH - textH);
    ctx.drawImage(img, x + (cellW - w) / 2, y + (cellH - textH - h) / 2, w, h);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 30px sans-serif'; ctx.fillText(`Ảnh ${i + 1} · ${r.meta.focal} mm · ${r.meta.aspect} · máy ${r.meta.cameraHeight} m · ${r.meta.label}`, x, y + cellH - textH + 44);
    ctx.fillStyle = '#a8adb5'; ctx.font = '24px sans-serif';
    ctx.fillText(`Vị trí (${r.meta.pos[0]}, ${r.meta.pos[1]}) · hướng ${r.meta.compassDeg}° · nghiêng ${r.meta.pitchDeg}° · ${r.meta.preset}`, x, y + cellH - textH + 82);
    ctx.fillStyle = '#ffd23f'; ctx.font = 'italic 26px sans-serif';
    wrap(ctx, r.note || '(chưa ghi chú)', x, y + cellH - textH + 122, cellW, 30, 1);
  }
  ctx.fillStyle = '#666'; ctx.font = '20px sans-serif'; ctx.fillText('Louvre V+A Photo Game · © OpenStreetMap contributors', pad, H - 16);
  c.toBlob((b) => b && download(b, `VA-tong-hop-${group || 'nhom'}.png`), 'image/png');
  toast('Đã xuất trang tổng hợp');
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = text.split(' '); let line = ''; let lines = 0;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; if (++lines >= maxLines) return; } else line = t;
  }
  ctx.fillText(line, x, y);
}

export async function exportAll(group: string) {
  const recs = await gallery.list(group);
  for (const r of recs) { const c = await renderAnnotated(r); await new Promise<void>((res) => c.toBlob((b) => { if (b) download(b, `${group || 'nhom'}-${r.id}.png`); res(); }, 'image/png')); await new Promise((r2) => setTimeout(r2, 300)); }
}
export type { PhotoRecord };
