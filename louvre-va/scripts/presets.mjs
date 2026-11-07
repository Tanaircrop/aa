import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.addInitScript((q) => localStorage.setItem('lva.quality', q), process.env.Q || 'medium');
await page.goto('http://localhost:4174/');
await page.waitForSelector('.loader', { state: 'detached', timeout: 60000 });
await page.click('text=Bỏ qua xem mẫu'); await page.fill('input[placeholder^="Tên nhóm"]', 'QA'); await page.click('text=Vào quảng trường');
for (const preset of (process.env.PRESETS || 'sunset,overcast,noon').split(',')) {
  await page.evaluate((p) => { window.lva.env.applyPreset(p); window.lva.player.teleport([38.0 - 1.2, 36.9 + 1.2], -135, 1.2, 2); window.lva.photo.focal = 24; window.lva.setCamera(true); }, preset);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `/tmp/claude-0/-home-user-aa/5d065f79-171d-5b8f-9b8c-f1f86af7b32f/scratchpad/preset-${preset}.png`, timeout: 120000 });
  console.log('shot', preset);
}
await browser.close(); server.kill();
