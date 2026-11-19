// Motion Studio renderer v2 — any HTML page → MP4 (frame by frame, no dropped frames).
// • fast: the video is split into parts rendered side by side (WORKERS pages + encoders), then joined losslessly
// • any code: pages without our render(t) run on a virtual clock (rAF, timers, CSS/WAAPI animations, GSAP, canvas, <video>)
// • light preview copy for smooth playback in the studio library
// Usage:  node render.mjs <input folder | file.html> <output folder> [fps]
// Optional sidecar next to a page: input/<name>.json  {"w":1080,"h":1920,"dur":12,"fps":30,"audio":"<name>.mp3"}
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [, , inArg = 'input', outDir = 'output', fpsArg = '30'] = process.argv;
const WORKERS = Math.max(1, Number(process.env.WORKERS) || Math.min(4, os.cpus().length));
const FF = process.env.FFMPEG_PATH || 'ffmpeg';
if (!fs.existsSync(inArg)) { console.log('No input yet — nothing to render.'); process.exit(0); }
const files = fs.statSync(inArg).isDirectory()
  ? fs.readdirSync(inArg).filter((f) => f.endsWith('.html')).map((f) => path.join(inArg, f))
  : [inArg];
fs.mkdirSync(outDir, {recursive: true});
if (!files.length) { console.log('No .html files found in', inArg); process.exit(0); }

const run = (args) => new Promise((res, rej) => { const p = spawn(FF, ['-y', '-loglevel', 'error', ...args], {stdio: 'inherit'}); p.on('close', (c) => c === 0 ? res() : rej(new Error('ffmpeg failed: ' + args.join(' ')))); });
const progress = (name, p) => { if (process.env.PROGRESS_FILE) fs.writeFileSync(process.env.PROGRESS_FILE, JSON.stringify({name, p, t: Date.now()})); };

/* Virtual clock, installed before any page script. Stays real until __virt() is called (only for pages without render(t)). */
const CLOCK = `(() => {
  const R = {now: performance.now.bind(performance), dnow: Date.now, raf: window.requestAnimationFrame.bind(window), st: window.setTimeout.bind(window), si: window.setInterval.bind(window), ct: window.clearTimeout.bind(window), ci: window.clearInterval.bind(window)};
  let virt = false, vt = 0, base = 0, dbase = 0, nid = 1;
  const T = new Map(), RA = new Map();
  const now = () => virt ? base + vt : R.now();
  performance.now = now; Date.now = () => virt ? dbase + vt : R.dnow();
  const call = (r) => { try { typeof r.cb === 'function' ? r.cb(...r.args) : (0, eval)(String(r.cb)); } catch (e) { console.error(e); } };
  const add = (cb, d, args, iv) => { const id = nid++, ms = Math.max(0, Number(d) || 0); const r = {cb, args, d: ms, iv, at: now() + ms, h: null}; T.set(id, r);
    if (!virt) r.h = (iv ? R.si : R.st)(() => { if (virt) return; if (!iv) T.delete(id); call(r); }, ms); return id; };
  window.setTimeout = (cb, d, ...a) => add(cb, d, a, false);
  window.setInterval = (cb, d, ...a) => add(cb, d, a, true);
  window.clearTimeout = window.clearInterval = (id) => { const r = T.get(id); if (!r) return; if (r.h != null) (r.iv ? R.ci : R.ct)(r.h); T.delete(id); };
  window.requestAnimationFrame = (cb) => { const id = nid++; RA.set(id, cb); if (!virt) R.raf((ts) => { if (!virt && RA.has(id)) { RA.delete(id); cb(ts); } }); return id; };
  window.cancelAnimationFrame = (id) => { RA.delete(id); };
  window.__virt = () => { if (virt) return; base = R.now(); dbase = R.dnow(); virt = true; vt = 0;
    for (const r of T.values()) if (r.h != null) { (r.iv ? R.ci : R.ct)(r.h); r.h = null; } };
  window.__advance = (ms) => { const target = Math.max(vt, ms);
    for (let guard = 0; guard < 100000; guard++) { let best = null, bid = 0;
      for (const [id, r] of T) if (r.at <= base + target && (!best || r.at < best.at)) { best = r; bid = id; }
      if (!best) break; vt = Math.max(vt, best.at - base);
      if (best.iv) best.at += Math.max(1, best.d); else T.delete(bid); call(best); }
    vt = target; const q = [...RA]; RA.clear(); for (const [, cb] of q) { try { cb(now()); } catch (e) { console.error(e); } } };
})();`;

async function openPage(browser, file, W, H, ours) {
  const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: 1});
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.addInitScript(CLOCK);
  await page.goto('file://' + path.resolve(file), {waitUntil: 'load'});
  await page.evaluate(() => document.fonts.ready);
  if (ours) await page.addStyleTag({content: `
    html,body{margin:0!important;padding:0!important;background:#000!important;display:block!important;min-height:0!important;overflow:hidden!important}
    body>*:not(#reel){display:none!important}
    #reel{width:${W}px!important;height:${H}px!important;max-width:none!important;max-height:none!important;border-radius:0!important;box-shadow:none!important;position:fixed!important;left:0;top:0}`});
  await page.evaluate((ours) => {
    const vo = document.getElementById('vo'); if (vo) { vo.muted = true; vo.pause(); }
    if (!ours) { window.__virt(); document.querySelectorAll('video,audio').forEach((m) => { m.muted = true; m.pause(); }); }
    window.__step = async (t, dt) => {
      if (ours) render(t);
      else { window.__advance(t * 1000);
        await Promise.all([...document.querySelectorAll('video')].map((v) => { if (Math.abs(v.currentTime - t) < .001) return null; v.currentTime = Math.min(t, (v.duration || 1e9) - .01); return new Promise((r) => { v.addEventListener('seeked', r, {once: true}); setTimeout.call ? 0 : 0; }); })); }
      for (const a of document.getAnimations()) {
        if (!a.__ctl) { a.__ctl = true; a.pause(); a.currentTime = ours ? 0 : t * 1000; }
        else a.currentTime = (Number(a.currentTime) || 0) + dt;
      }
      if (window.__settle) await window.__settle();
    };
  }, ours);
  return page;
}

for (const file of files) {
  const name = path.basename(file, '.html');
  const started = Date.now();
  const html = fs.readFileSync(file, 'utf8');
  const side = (() => { try { return JSON.parse(fs.readFileSync(file.replace(/\.html$/, '.json'), 'utf8')); } catch { return {}; } })();
  const ours = /id="reel"/.test(html) && /function\s+render\s*\(/.test(html);
  const FPS = Number(side.fps) || Number(fpsArg);
  const [W, H] = [Number(side.w) || 1080, Number(side.h) || 1920];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-'));
  // audio: editable pages mix voice+SFX themselves; otherwise an embedded <audio> or a sidecar audio file
  let audioPath = null;
  const m = html.match(/<audio[^>]*src="data:audio\/[a-z0-9]+;base64,([^"]+)"/i);
  if (m) { audioPath = path.join(tmp, 'voice.mp3'); fs.writeFileSync(audioPath, Buffer.from(m[1], 'base64')); }
  if (side.audio && fs.existsSync(path.join(path.dirname(file), side.audio))) audioPath = path.join(path.dirname(file), side.audio);
  const tm = html.match(/<script[^>]*id="thumb-b64"[^>]*>([^<]+)<\/script>/i);
  const thumbPath = path.join(outDir, `${name}.jpg`);
  if (tm) fs.writeFileSync(thumbPath, Buffer.from(tm[1].trim(), 'base64'));

  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--run-all-compositor-stages-before-draw']});
  const probe = await openPage(browser, file, W, H, ours);
  if (ours && await probe.evaluate(() => typeof window.__mixAudio === 'function')) {
    audioPath = path.join(tmp, 'mix.wav'); fs.writeFileSync(audioPath, Buffer.from(await probe.evaluate(() => window.__mixAudio()), 'base64'));
  }
  const dur = Number(side.dur) || await probe.evaluate(() => {
    if (typeof DUR !== 'undefined' && +DUR > 0) return +DUR;
    const meta = document.querySelector('meta[name="duration"]'); if (meta && +meta.content > 0) return +meta.content;
    let end = 0;
    for (const a of document.getAnimations()) { const t = a.effect && a.effect.getComputedTiming(); if (t && isFinite(t.endTime)) end = Math.max(end, t.endTime / 1000); }
    document.querySelectorAll('video,audio').forEach((v) => { if (isFinite(v.duration)) end = Math.max(end, v.duration); });
    return end > 0.5 ? end : 10;
  });
  await probe.close();
  const frames = Math.ceil(dur * FPS);
  const n = Math.max(1, Math.min(WORKERS, Math.floor(frames / (FPS * 2)) || 1));
  const per = Math.ceil(frames / n);
  console.log(`${name}: ${dur.toFixed(1)}s, ${frames} frames, ${n} parts, ${ours ? 'studio page' : 'generic page'} ${W}x${H}`);
  const done = new Array(n).fill(0);
  const report = () => { const p = Math.round(done.reduce((a, b) => a + b, 0) / frames * 100); progress(name, p); process.stdout.write(`\r${name}: ${p}%   `); };
  const sel = ours ? '#reel' : null;

  async function part(k) {
    const a = k * per, b = Math.min(frames, a + per);
    if (a >= b) return null;
    const page = await openPage(browser, file, W, H, ours);
    const seg = path.join(tmp, `seg${k}.mp4`);
    const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-threads', '2',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', seg], {stdio: ['pipe', 'inherit', 'inherit']});
    let closed = false; const finished = new Promise((r) => ff.on('close', (c) => { closed = true; r(c); }));
    ff.stdin.on('error', () => {});
    // warm-up so transitions/stateful animations arrive at frame a exactly as in a straight render
    const from = ours ? Math.max(0, a - FPS) : 0;
    for (let f = from; f < a; f++) await page.evaluate(([t, dt]) => window.__step(t, dt), [f / FPS, 1000 / FPS]);
    const target = sel ? page.locator(sel) : page;
    for (let f = a; f < b && !closed; f++) {
      await page.evaluate(([t, dt]) => window.__step(t, dt), [f / FPS, 1000 / FPS]);
      const buf = await target.screenshot({type: 'jpeg', quality: 95, animations: 'allow', caret: 'initial'});
      if (!ff.stdin.write(buf)) await new Promise((r) => { const go = () => { ff.stdin.off('drain', go); r(); }; ff.stdin.once('drain', go); ff.once('close', go); });
      done[k]++; if (done[k] % 15 === 0) report();
    }
    ff.stdin.end(); const code = await finished; await page.close();
    if (code !== 0 || !fs.existsSync(seg)) throw new Error(`part ${k} failed for ${name}`);
    return seg;
  }
  const segs = (await Promise.all([...Array(n)].map((_, k) => part(k)))).filter(Boolean);
  await browser.close();
  report();

  // join parts losslessly, then add sound padded/trimmed to the exact picture length
  const list = path.join(tmp, 'list.txt'); fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n'));
  const vid = path.join(tmp, 'video.mp4');
  await run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', vid]);
  const out = path.join(outDir, `${name}.mp4`), vlen = (frames / FPS).toFixed(3);
  const a2 = ['-i', vid]; if (audioPath) a2.push('-i', audioPath); if (tm) a2.push('-i', thumbPath);
  a2.push('-map', '0:v:0'); if (audioPath) a2.push('-map', '1:a:0');
  if (tm) a2.push('-map', `${audioPath ? 2 : 1}:v:0`, '-c:v:1', 'copy', '-disposition:v:1', 'attached_pic');
  a2.push('-c:v:0', 'copy'); if (audioPath) a2.push('-af', 'apad', '-c:a', 'aac', '-b:a', '192k');
  a2.push('-t', vlen, '-movflags', '+faststart', out);
  await run(a2);
  // light copy for smooth playback inside the studio + poster frame
  const pw = W >= H ? 1280 : 720, ph = Math.round(pw * H / W / 2) * 2;
  await run(['-i', out, '-map', '0:v:0', '-map', '0:a?', '-vf', `scale=${pw}:${ph}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-maxrate', '2500k', '-bufsize', '5000k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(outDir, `${name}.preview.mp4`)]);
  if (!tm) await run(['-ss', String(Math.min(1, dur / 2)), '-i', out, '-frames:v', '1', '-vf', `scale=${pw}:-2`, '-q:v', '3', path.join(outDir, `${name}.jpg`)]);
  fs.rmSync(tmp, {recursive: true, force: true});
  progress(name, 100);
  console.log(`\r${name}: done in ${Math.round((Date.now() - started) / 1000)}s → ${out}`);
}
