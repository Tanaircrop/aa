import * as THREE from 'three';

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function mulberry(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function speckle(ctx: CanvasRenderingContext2D, size: number, n: number, rnd: () => number, alpha: number, dark = true) {
  for (let i = 0; i < n; i++) {
    const v = dark ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    const s = 1 + rnd() * 2;
    ctx.fillRect(rnd() * size, rnd() * size, s, s);
  }
}

function finish(c: HTMLCanvasElement, repeat: number, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pale yellow Paris limestone with ashlar joints. One tile = 4 m. */
export function limestoneTexture(): THREE.CanvasTexture {
  const size = 512; const [c, ctx] = canvas(size); const rnd = mulberry(7);
  ctx.fillStyle = '#d6cdb8'; ctx.fillRect(0, 0, size, size);
  const rows = 8; const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * rowH * 1.3; const w = rowH * 2.6;
    for (let x = -w; x < size + w; x += w) {
      const g = 196 + rnd() * 30; const warm = rnd() * 12;
      ctx.fillStyle = `rgb(${g + warm},${g + warm * 0.4},${g - 14})`;
      ctx.fillRect(x + off, r * rowH, w, rowH);
    }
  }
  // weathering: grey streaks running down, darker under joints
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size, w = 2 + rnd() * 10, h = 40 + rnd() * 200;
    const gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(60,60,60,0.18)'); gr.addColorStop(1, 'rgba(60,60,60,0)');
    ctx.fillStyle = gr; ctx.save(); ctx.translate(x, rnd() * size); ctx.fillRect(0, 0, w, h); ctx.restore();
  }
  speckle(ctx, size, 9000, rnd, 0.08);
  speckle(ctx, size, 3000, rnd, 0.08, false);
  ctx.strokeStyle = 'rgba(70,62,50,0.5)'; ctx.lineWidth = 1.5;
  for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * rowH); ctx.lineTo(size, r * rowH); ctx.stroke(); }
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * rowH * 1.3; const w = rowH * 2.6;
    for (let x = -w; x < size + w; x += w) { ctx.beginPath(); ctx.moveTo(x + off, r * rowH); ctx.lineTo(x + off, (r + 1) * rowH); ctx.stroke(); }
  }
  return finish(c, 1);
}

/** Rusticated ground-floor stone: deep horizontal channels, one tile = 4 m. */
export function rusticatedTexture(): THREE.CanvasTexture {
  const size = 512; const [c, ctx] = canvas(size); const rnd = mulberry(31);
  ctx.fillStyle = '#cfc5ae'; ctx.fillRect(0, 0, size, size);
  const rows = 6; const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    const g = 190 + rnd() * 22; ctx.fillStyle = `rgb(${g + 8},${g + 2},${g - 14})`;
    ctx.fillRect(0, r * rowH + 6, size, rowH - 12);
    const sh = ctx.createLinearGradient(0, r * rowH, 0, r * rowH + 12); sh.addColorStop(0, 'rgba(40,35,30,0.55)'); sh.addColorStop(1, 'rgba(40,35,30,0)');
    ctx.fillStyle = sh; ctx.fillRect(0, r * rowH, size, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, (r + 1) * rowH - 8, size, 3);
    ctx.fillStyle = 'rgba(30,26,22,0.6)'; ctx.fillRect(0, (r + 1) * rowH - 5, size, 5);
  }
  speckle(ctx, size, 7000, rnd, 0.1);
  return finish(c, 1);
}

/** Dark blue-grey slate roof. */
export function slateTexture(): THREE.CanvasTexture {
  const size = 256; const [c, ctx] = canvas(size); const rnd = mulberry(11);
  ctx.fillStyle = '#2f3a44'; ctx.fillRect(0, 0, size, size);
  const rows = 10; const h = size / rows; const w = h * 0.8;
  for (let r = 0; r < rows; r++) {
    for (let x = -w; x < size + w; x += w) {
      const g = 40 + rnd() * 25;
      ctx.fillStyle = `rgb(${g - 5},${g + 4},${g + 12})`;
      ctx.fillRect(x + (r % 2) * w * 0.5, r * h, w - 1.5, h - 1.5);
    }
  }
  speckle(ctx, size, 1500, rnd, 0.15);
  return finish(c, 1);
}

/** Courtyard paving: granite setts with the diagonal motif of the pyramid. One tile = 8 m. */
export function pavingTexture(): THREE.CanvasTexture {
  const size = 1024; const [c, ctx] = canvas(size); const rnd = mulberry(23);
  ctx.fillStyle = '#b5b2ab'; ctx.fillRect(0, 0, size, size);
  const n = 8; const s = size / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const g = 168 + rnd() * 30;
    ctx.fillStyle = `rgb(${g + 2},${g},${g - 5})`;
    ctx.fillRect(i * s + 1, j * s + 1, s - 2, s - 2);
  }
  ctx.strokeStyle = 'rgba(70,68,64,0.55)'; ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) { const p = (i * size) / n; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(80,78,74,0.3)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size, size); ctx.moveTo(size, 0); ctx.lineTo(0, size); ctx.stroke();
  speckle(ctx, size, 24000, rnd, 0.09);
  speckle(ctx, size, 6000, rnd, 0.1, false);
  return finish(c, 1);
}

/** Grey granite for pool rims. */
export function graniteTexture(): THREE.CanvasTexture {
  const size = 256; const [c, ctx] = canvas(size); const rnd = mulberry(5);
  ctx.fillStyle = '#7d7f82'; ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 9000, rnd, 0.35);
  speckle(ctx, size, 4000, rnd, 0.3, false);
  return finish(c, 1);
}

export function asphaltTexture(): THREE.CanvasTexture {
  const size = 256; const [c, ctx] = canvas(size); const rnd = mulberry(99);
  ctx.fillStyle = '#6d6b66'; ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 6000, rnd, 0.3);
  return finish(c, 1);
}
