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
  ctx.fillStyle = '#d9c9a3'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${200 + rnd() * 40},${185 + rnd() * 30},${140 + rnd() * 30},0.25)`;
    ctx.fillRect(rnd() * size, rnd() * size, 60 + rnd() * 120, 20 + rnd() * 60);
  }
  speckle(ctx, size, 6000, rnd, 0.12);
  speckle(ctx, size, 2000, rnd, 0.1, false);
  const rows = 6; const rowH = size / rows;
  ctx.strokeStyle = 'rgba(80,65,40,0.45)'; ctx.lineWidth = 2;
  for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * rowH); ctx.lineTo(size, r * rowH); ctx.stroke(); }
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * rowH * 1.1; const w = rowH * 2.2;
    for (let x = -w; x < size + w; x += w) { ctx.beginPath(); ctx.moveTo(x + off, r * rowH); ctx.lineTo(x + off, (r + 1) * rowH); ctx.stroke(); }
  }
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
  ctx.fillStyle = '#9a948b'; ctx.fillRect(0, 0, size, size);
  const n = 16; const s = size / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const g = 135 + rnd() * 35;
    ctx.fillStyle = `rgb(${g + 4},${g},${g - 6})`;
    ctx.fillRect(i * s + 1, j * s + 1, s - 2, s - 2);
  }
  ctx.strokeStyle = 'rgba(60,55,50,0.5)'; ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) { const p = (i * size) / 4; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(70,65,60,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size, size); ctx.moveTo(size, 0); ctx.lineTo(0, size); ctx.stroke();
  speckle(ctx, size, 20000, rnd, 0.1);
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
