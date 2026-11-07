// Runs the built game in headless Chromium and saves screenshots to production/qa/evidence/.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4173;
const OUT = 'production/qa/evidence';
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const shots = [];
const RUNS = (process.env.RUNS || 'desktop,teacher,mobile').split(',');
async function run(name, { mobile = false, teacher = false, steps }) {
  if (!RUNS.includes(name)) return;
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', name, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', name, m.text().slice(0, 200)); });
  await page.addInitScript(() => { localStorage.setItem('lva.quality', 'medium'); });
  await page.goto(`http://localhost:${PORT}/${teacher ? '?mode=teacher&pin=1789' : ''}`);
  await page.waitForSelector('.loader', { state: 'detached', timeout: 60000 });
  await steps(page);
  await ctx.close();
}
const settle = (page, ms = 1200) => page.waitForTimeout(ms);
const shot = async (page, file, label) => { await page.screenshot({ path: `${OUT}/${file}`, timeout: 120000 }); shots.push([file, label]); console.log('shot', file); };
const enter = async (page) => { await page.click('text=Bỏ qua xem mẫu'); await page.fill('input[placeholder^="Tên nhóm"]', 'QA'); await page.click('text=Vào quảng trường'); await settle(page, 800); await page.evaluate(() => { document.exitPointerLock(); window.lva.player.touchLook.dx = 0; window.lva.player.touchLook.dy = 0; }); };

await run('desktop', { steps: async (page) => {
  await shot(page, '01-intro.png', 'Màn hình vào: tên nhóm, hình mẫu V+A, quy ước');
  await enter(page);
  await shot(page, '02-spawn-walk.png', 'Đi bộ từ điểm xuất phát phía tây, nhìn về kim tự tháp');
  for (const [i, key] of [[1, '1'], [2, '2'], [4, '4']]) {
    await page.evaluate((k) => { const e = window.lva.overlay.entries.find((x) => x.key === k); window.lva.player.teleport(e.pose.pos, e.pose.headingDeg, 1.2, 2); window.lva.photo.focal = k === '4' ? 24 : 16; window.lva.setCamera(true); }, key);
    await settle(page);
    await shot(page, `03-answer-${i}-camera.png`, `Vị trí ${i}: khung ngắm, V bờ hồ + A kim tự tháp`);
  }
  await page.evaluate(() => { window.lva.setCamera(false); window.lva.player.teleport([-60, -8], 180, 1.6, 0); });
  await settle(page);
  await shot(page, '03b-west-sunset-hands.png', 'Nhìn thẳng về mặt trời lặn (hướng tây), tay cầm máy hạ thấp');
  await page.evaluate(() => { window.lva.setCamera(true); });
  await settle(page);
  await shot(page, '03c-west-sunset-camera.png', 'Cùng góc, máy giơ lên: khung ngắm là màn LCD trong tay');
  await page.evaluate(() => { window.lva.setCamera(false); window.lva.player.teleport([-60, -20], 15, 35, -20); });
  await settle(page);
  await shot(page, '04-flycam-high.png', 'Fly cam 35 m: toàn cảnh quảng trường');
  await page.evaluate(() => { const w = window.lva.referencePhotos[1]; window.lva.gotoPose(w); });
  await settle(page, 1800);
  await shot(page, '05-window-richelieu-overcast.png', 'Cửa sổ Richelieu, preset trời mưa, nhìn xuống hồ N');
  await page.evaluate(() => { window.lva.env.applyPreset('noon'); window.lva.setCamera(false); window.lva.player.teleport([36.4, -0.3], 180, 0.5, 4); window.lva.photo.focal = 16; window.lva.setCamera(true); });
  await settle(page, 1500);
  await shot(page, '06-pool-edge-noon-16mm.png', 'Sát mép hồ E, nắng trưa, 16 mm');
  // take a real photo through the pipeline and open the gallery
  await page.evaluate(() => window.lva.env.applyPreset('sunset'));
  await settle(page, 800);
  await page.keyboard.press('Space'); await settle(page, 1500);
  await page.evaluate(() => document.exitPointerLock()); await settle(page, 300);
  await page.click('#hud-top button:has-text("Thư viện")'); await settle(page, 1200);
  await shot(page, '07-gallery.png', 'Thư viện ảnh (IndexedDB) sau khi chụp');
  await page.click('.thumbs .t'); await settle(page, 800);
  const c = await page.$('#annot canvas'); const b = await c.boundingBox();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.8); await page.mouse.down(); await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.3, { steps: 10 }); await page.mouse.up();
  await page.click('text=V nét đứt');
  await page.mouse.move(b.x + b.width * 0.1, b.y + b.height * 0.95); await page.mouse.down(); await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.55, { steps: 10 }); await page.mouse.up();
  await page.fill('#annot textarea', 'Đỉnh V dẫn mắt vào chân kim tự tháp');
  await shot(page, '08-annotate.png', 'Vẽ A (liền), V (đứt) và ghi chú lên ảnh');
  await page.click('#annot .bottom button.primary'); await settle(page, 800);
}});

await run('teacher', { teacher: true, steps: async (page) => {
  await enter(page);
  await page.evaluate(() => document.exitPointerLock()); await settle(page, 300);
  await page.click('#hud-top button:has-text("Giảng viên")'); await settle(page, 500);
  await page.click('label:has-text("Overlay") input');
  await page.evaluate(() => { window.lva.player.teleport([-40, -30], 25, 28, -22); });
  await settle(page, 1500);
  await shot(page, '09-teacher-overlay.png', 'Chế độ giảng viên: overlay 5 đáp án xanh, T1/T2 + V phối cảnh vàng, panel cài đặt');
}});

await run('mobile', { mobile: true, steps: async (page) => {
  await enter(page);
  await page.evaluate(() => { window.lva.player.teleport([0.4, 38], -90, 1.2, 2); window.lva.setCamera(true); });
  await settle(page, 1500);
  await shot(page, '10-mobile-camera.png', 'Điện thoại ngang: joystick, nút chụp, khung ngắm');
}});

await browser.close();
server.kill();
const fs = await import('node:fs');
if (RUNS.length === 3) fs.writeFileSync(`${OUT}/README.md`, `# QA evidence\n\nẢnh chụp tự động từ bản build (scripts/evidence.mjs), Chromium headless, mức chất lượng medium.\n\n${shots.map(([f, l]) => `- \`${f}\`: ${l}`).join('\n')}\n`);
console.log('done');
