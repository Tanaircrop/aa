// Ad-hoc screenshot: SHOTS='name:preset:x,y,heading,alt,pitch,focal,cam;...' Q=high node scripts/shot.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-aa/5d065f79-171d-5b8f-9b8c-f1f86af7b32f/scratchpad';
const server = spawn('npx', ['vite', 'preview', '--port', '4175', '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.addInitScript((q) => localStorage.setItem('lva.quality', q), process.env.Q || 'medium');
await page.goto('http://localhost:4175/' + (process.env.QS || ''));
await page.waitForSelector('.loader', { state: 'detached', timeout: 90000 });
if (process.env.INTRO) { await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/de-bai.png`, timeout: 120000, fullPage: false }); console.log('shot de-bai'); }
await page.click('text=Đã rõ đề, xem hướng dẫn');
if (process.env.INTRO) { await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/intro-real.png`, timeout: 120000, fullPage: false }); console.log('shot intro-real'); }
await page.click('text=Bỏ qua xem mẫu'); await page.fill('input[placeholder^="Tên nhóm"]', 'QA'); await page.click('text=Vào quảng trường'); await page.waitForTimeout(500); await page.evaluate(() => { document.exitPointerLock(); window.lva.player.touchLook.dx = 0; window.lva.player.touchLook.dy = 0; });
if (process.env.NOTUT) await page.evaluate(() => { window.lva.tutorial.skip(); document.querySelectorAll('#ui .modal').forEach((m) => m.remove()); window.lva.session.beginTimer(); });
for (const spec of (process.env.SHOTS || '').split(';').filter(Boolean)) {
  const [name, preset, rest] = spec.split(':'); const [x, y, h, alt, pitch, focal, cam] = rest.split(',').map(Number);
  await page.evaluate(({ preset, x, y, h, alt, pitch, focal, cam }) => { if (preset !== 'keep') window.lva.env.applyPreset(preset); window.lva.player.teleport([x, y], h, alt, pitch); window.lva.photo.focal = focal; window.lva.setCamera(!!cam); }, { preset, x, y, h, alt, pitch, focal, cam });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 180000 }); console.log('shot', name);
}
await browser.close(); server.kill();
