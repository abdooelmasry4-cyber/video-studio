// Motion Studio renderer — turns the preview HTML files into a 1080x1920 MP4 (frame by frame, no dropped frames).
// Usage:  node render.mjs <input folder or file.html> <output folder> [fps]
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [, , inArg = 'input', outDir = 'output', fpsArg = '30'] = process.argv;
const FPS = Number(fpsArg);
if (!fs.existsSync(inArg)) { console.log('No input folder yet — nothing to render.'); process.exit(0); }
const files = fs.statSync(inArg).isDirectory()
  ? fs.readdirSync(inArg).filter((f) => f.endsWith('.html')).map((f) => path.join(inArg, f))
  : [inArg];
fs.mkdirSync(outDir, {recursive: true});
if (!files.length) { console.log('No .html files found in', inArg); process.exit(0); }

const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required']});
for (const file of files) {
  const name = path.basename(file, '.html');
  const html = fs.readFileSync(file, 'utf8');
  // 1) voice track: pulled from the embedded data URI
  const m = html.match(/<audio[^>]*src="data:audio\/[a-z0-9]+;base64,([^"]+)"/i);
  const audioPath = path.join(outDir, `${name}.voice.mp3`);
  if (m) fs.writeFileSync(audioPath, Buffer.from(m[1], 'base64'));
  // 2) page at full resolution, controls hidden, animations under manual clock
  const page = await browser.newPage({viewport: {width: 1080, height: 1920}, deviceScaleFactor: 1});
  await page.goto('file://' + path.resolve(file), {waitUntil: 'networkidle'});
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({content: `
    html,body{margin:0!important;padding:0!important;background:#000!important;display:block!important;min-height:0!important;overflow:hidden!important}
    body>*:not(#reel){display:none!important}
    #reel{width:1080px!important;height:1920px!important;max-width:none!important;border-radius:0!important;box-shadow:none!important;position:fixed!important;left:0;top:0}`});
  const dur = await page.evaluate(() => (typeof DUR !== 'undefined' ? DUR : 40));
  await page.evaluate(() => {
    const vo = document.getElementById('vo'); if (vo) { vo.muted = true; vo.pause(); }
    window.__step = (t, dt) => {
      render(t);
      for (const a of document.getAnimations()) {
        if (!a.__ctl) { a.__ctl = true; a.pause(); a.currentTime = 0; }
        else a.currentTime = (Number(a.currentTime) || 0) + dt;
      }
    };
    window.__step(0, 0);
  });
  const frames = Math.ceil(dur * FPS);
  const out = path.join(outDir, `${name}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    ...(m ? ['-i', audioPath] : []), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
    ...(m ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []), '-movflags', '+faststart', out], {stdio: ['pipe', 'inherit', 'inherit']});
  const reel = page.locator('#reel');
  for (let f = 0; f < frames; f++) {
    await page.evaluate(([t, dt]) => window.__step(t, dt), [f / FPS, 1000 / FPS]);
    const buf = await reel.screenshot({type: 'jpeg', quality: 95});
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % FPS === 0) process.stdout.write(`\r${name}: ${Math.round((f / frames) * 100)}%`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  if (m) fs.unlinkSync(audioPath);
  await page.close();
  console.log(`\r${name}: done → ${out}`);
}
await browser.close();
