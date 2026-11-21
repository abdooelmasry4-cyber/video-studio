/* ===== Motion Studio montage layer (post.js) =====
   Lives inside an exported page, after the page's own scripts.
   cut-data JSON  → cuts / speed / inserted clips / overlays / music / grade / volumes
   script.post-media → embedded media (base64)
   API: window.__post = {dur, render(T) (exact, for the renderer), preview(T, playing), mix() → WAV, setData, setMedia, ...}
   The original page is untouched: its own render(t) is called with the mapped source time. */
(function(){
  const reel = document.getElementById('reel');
  if (!reel || window.__post) return;
  const SR = 44100;
  const cdEl = document.getElementById('cut-data');
  const origRender = typeof window.render === 'function' ? window.render : () => {};
  const baseDur = (() => { try { if (typeof DUR !== 'undefined' && +DUR > 0) return +DUR; } catch (e) {} try { if (window.ED && +ED.dur > 0) return +ED.dur; } catch (e) {} return 10; })();
  const NEUTRAL = {bri: 0, con: 0, sat: 0, hue: 0, temp: 0, tint: 0, light: 0, shadow: 0, vig: 0, blur: 0, sepia: 0, fade: 0};
  const PRESETS = {
    none: {}, cine: {con: .14, sat: -.12, temp: -.12, vig: .35, shadow: .05}, warm: {temp: .32, sat: .08, light: .05},
    cold: {temp: -.32, sat: -.05}, bw: {sat: -1, con: .22}, vivid: {sat: .45, con: .1}, retro: {sepia: .35, shadow: .14, vig: .3, con: -.05},
    drama: {con: .3, bri: -.06, vig: .5, sat: -.1}, gold: {temp: .2, tint: .06, sat: .15, con: .08, vig: .25}, night: {temp: -.4, bri: -.12, con: .12, sat: -.2, vig: .4}
  };
  const empty = () => ({v: 1, main: [{id: 'b0', src: 'base', in: 0, out: baseDur, speed: 1, vol: 1}], ov: [], au: [], mix: {voice: 1, sfx: 1, music: .5, master: 1, duck: .6}, grade: {}, filter: 'none', media: {}});
  let D = empty();
  try { if (cdEl) D = Object.assign(empty(), JSON.parse(cdEl.textContent)); } catch (e) { console.warn('cut-data broken', e); }

  /* ---------- media ---------- */
  const URLS = {}, ELS = {}, AUD = {};
  async function loadMedia(){
    const list = [...document.querySelectorAll('script.post-media')];
    await Promise.all(list.map(async s => {
      const id = s.dataset.id, mime = s.dataset.mime || 'application/octet-stream';
      try { const b = await (await fetch('data:' + mime + ';base64,' + s.textContent.trim())).blob(); URLS[id] = URL.createObjectURL(b); } catch (e) { console.warn('media', id, e); }
    }));
  }
  function mediaEl(id, key){
    const k = id + '|' + key; if (ELS[k]) return ELS[k];
    const m = D.media[id] || {}; let el;
    if (m.kind === 'image') { el = document.createElement('img'); el.src = URLS[id] || ''; el.decoding = 'sync'; }
    else { el = document.createElement('video'); el.muted = true; el.playsInline = true; el.preload = 'auto'; el.src = URLS[id] || ''; }
    el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none';
    ELS[k] = el; return el;
  }

  /* ---------- layer ---------- */
  if (getComputedStyle(reel).position === 'static') reel.style.position = 'relative';
  const L = document.createElement('div'); L.id = 'post-layer';
  L.style.cssText = 'position:absolute;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden;container-type:size';
  L.innerHTML = '<div data-k="main" style="position:absolute;inset:0;background:#000;display:none;overflow:hidden"></div>' +
    '<div data-k="temp" style="position:absolute;inset:0;mix-blend-mode:soft-light;opacity:0"></div>' +
    '<div data-k="tint" style="position:absolute;inset:0;mix-blend-mode:soft-light;opacity:0"></div>' +
    '<div data-k="light" style="position:absolute;inset:0;background:#fff;mix-blend-mode:soft-light;opacity:0"></div>' +
    '<div data-k="shadow" style="position:absolute;inset:0;background:#3a3a3a;mix-blend-mode:lighten;opacity:0"></div>' +
    '<div data-k="vig" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 48%,rgba(0,0,0,.92) 100%)"></div>' +
    '<div data-k="ov" style="position:absolute;inset:0"></div>' +
    '<div data-k="tr" style="position:absolute;inset:0;opacity:0"></div>';
  reel.appendChild(L);
  const P = k => L.querySelector(`[data-k="${k}"]`);
  const MAIN = P('main'), OV = P('ov'), TR = P('tr');

  /* ---------- timeline ---------- */
  let TL = [], DURO = baseDur;
  function build(){
    let t = 0; TL = (D.main || []).map(c => { const sp = c.speed || 1, len = Math.max(.04, (c.out - c.in) / sp); const r = Object.assign({}, c, {s: t, e: t + len, sp}); t += len; return r; });
    if (!TL.length) TL = [{id: 'x', src: 'base', in: 0, out: baseDur, sp: 1, s: 0, e: baseDur}];
    DURO = Math.max(.1, t);
    api.dur = DURO;
  }
  const clipAt = T => { for (const c of TL) if (T < c.e) return c; return TL[TL.length - 1]; };
  const srcOf = (c, T) => c.in + Math.max(0, Math.min(c.e - c.s, T - c.s)) * c.sp;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = x => 1 - Math.pow(1 - clamp(x), 3);

  /* ---------- grade ---------- */
  function gradeFor(c){
    const g = Object.assign({}, NEUTRAL);
    const add = o => { for (const k in o) if (k in g) g[k] += +o[k] || 0; };
    add(PRESETS[D.filter] || {}); add(D.grade || {});
    if (c) { add(PRESETS[c.filter] || {}); add(c.grade || {}); }
    return g;
  }
  let lastF = '';
  function applyGrade(g, extraBlur){
    const f = (g.bri || g.con || g.sat || g.hue || g.sepia || g.blur || extraBlur) ?
      `brightness(${(1 + g.bri).toFixed(3)}) contrast(${(1 + g.con).toFixed(3)}) saturate(${Math.max(0, 1 + g.sat).toFixed(3)}) hue-rotate(${(g.hue * 180).toFixed(1)}deg) sepia(${clamp(g.sepia).toFixed(3)}) blur(${((g.blur * 6) + (extraBlur || 0)).toFixed(2)}px)` : '';
    if (f !== lastF) { reel.style.filter = f; lastF = f; }
    const tp = P('temp'); tp.style.background = g.temp >= 0 ? '#ff8a00' : '#0077ff'; tp.style.opacity = clamp(Math.abs(g.temp) * .75);
    const tn = P('tint'); tn.style.background = g.tint >= 0 ? '#ff00c8' : '#00ff66'; tn.style.opacity = clamp(Math.abs(g.tint) * .6);
    P('light').style.opacity = clamp(g.light * .9); P('shadow').style.opacity = clamp(g.shadow);
    P('vig').style.opacity = clamp(g.vig);
  }

  /* ---------- transitions (into a clip) ---------- */
  function transition(T){
    let o = 0, col = '#000', blur = 0;
    for (let i = 1; i < TL.length; i++) {
      const c = TL[i], tr = c.tr; if (!tr || tr === 'none') continue;
      const d = (c.trd || .4) / 2, x = T - c.s; if (x < -d || x > d) continue;
      const k = 1 - Math.abs(x) / d;
      if (tr === 'fade') { o = k; col = '#000'; } else if (tr === 'flash') { o = k; col = '#fff'; } else if (tr === 'yellow') { o = k; col = '#F5C518'; }
      else if (tr === 'blur') blur = 14 * k;
      else if (tr === 'wipe') { o = 1; col = `linear-gradient(90deg,#000 ${((x + d) / (2 * d) * 100 - 30).toFixed(1)}%,transparent ${((x + d) / (2 * d) * 100).toFixed(1)}%)`; if (k < .02) o = 0; }
    }
    TR.style.background = col; TR.style.opacity = o.toFixed(3);
    return blur;
  }

  /* ---------- overlays ---------- */
  const OVE = {};
  function ovEl(o){
    let el = OVE[o.id];
    if (!el || el.dataset.kind !== o.type + (o.mid || '')) {
      if (el) el.remove();
      el = document.createElement('div'); el.dataset.kind = o.type + (o.mid || ''); el.dataset.id = o.id;
      el.style.cssText = 'position:absolute;left:0;top:0;transform-origin:50% 50%;will-change:transform,opacity';
      if (o.type === 'media') { const m = mediaEl(o.mid, 'ov' + o.id); m.style.position = 'static'; m.style.display = 'block'; m.style.width = '100%'; m.style.height = 'auto'; m.style.objectFit = 'contain'; el.appendChild(m); }
      else { const t = document.createElement('div'); el.appendChild(t); }
      OV.appendChild(el); OVE[o.id] = el;
      el.addEventListener('pointerdown', e => dragOv(e, o.id));
    }
    return el;
  }
  function styleText(el, o){
    const t = el.firstChild, s = o.style || {};
    t.textContent = o.text || '';
    t.style.cssText = `font-family:${s.font || "'Taj','Tajawal','Alexandria','Cairo',sans-serif"};font-weight:${s.weight || 900};font-size:${(s.size || 7)}cqw;line-height:1.25;color:${s.color || '#fff'};direction:rtl;text-align:center;white-space:${o.w ? 'pre-wrap' : 'pre'};` +
      `padding:${s.bg ? '.35em .6em' : '0'};border-radius:${s.radius != null ? s.radius : .35}em;background:${s.bg || 'transparent'};` +
      (s.stroke ? `-webkit-text-stroke:${(s.strokeW || .9)}cqw ${s.stroke};paint-order:stroke fill;` : '') +
      (s.glow ? `text-shadow:0 0 1.2cqw ${s.glow},0 0 3.5cqw ${s.glow},0 0 7cqw ${s.glow};` : s.shadow !== false ? 'text-shadow:0 .6cqw 2.4cqw rgba(0,0,0,.45);' : '') +
      (s.uline ? `text-decoration:underline;text-decoration-color:${s.uline};text-decoration-thickness:.12em;text-underline-offset:.18em;` : '');
  }
  function animK(o, T){
    const a = T - o.start, b = o.start + o.dur - T, ai = o.ain != null ? o.ain : .35, ao = o.aout != null ? o.aout : .25;
    const i = ai > 0 ? ease(a / ai) : 1, u = ao > 0 ? clamp(b / ao) : 1;
    let sc = 1, dx = 0, dy = 0, op = Math.min(1, u), rot = 0;
    switch (o.anim || 'pop') {
      case 'pop': sc = .55 + .45 * i + (i < 1 ? Math.sin(i * Math.PI) * .12 : 0); op *= clamp(i * 2); break;
      case 'fade': op *= i; break;
      case 'up': dy = (1 - i) * 8; op *= i; break;
      case 'down': dy = -(1 - i) * 8; op *= i; break;
      case 'right': dx = -(1 - i) * 30; op *= i; break;
      case 'left': dx = (1 - i) * 30; op *= i; break;
      case 'zoom': sc = 1.8 - .8 * i; op *= i; break;
      case 'swing': rot = (1 - i) * -14; sc = .8 + .2 * i; op *= i; break;
      case 'type': op *= 1; break;
      default: break;
    }
    if (o.loop === 'pulse') sc *= 1 + .035 * Math.sin((T - o.start) * 6);
    if (o.loop === 'float') dy += Math.sin((T - o.start) * 2.4) * 1.2;
    return {sc, dx, dy, op, rot, i};
  }
  async function drawOverlays(T, exact, playing){
    const live = new Set(), waits = [];
    for (const o of (D.ov || [])) {
      const on = T >= o.start && T < o.start + o.dur; const el = on ? ovEl(o) : OVE[o.id];
      if (!el) continue;
      if (!on) { el.style.display = 'none'; if (o.type === 'media') { const v = el.querySelector('video'); if (v && !v.paused) v.pause(); } continue; }
      live.add(o.id); el.style.display = 'block';
      const k = animK(o, T);
      if (o.type === 'text') { styleText(el, o); if (o.anim === 'type') { const full = o.text || ''; el.firstChild.textContent = full.slice(0, Math.ceil(full.length * clamp((T - o.start) / Math.max(.3, (o.ain || .35) * 3)))); } }
      el.style.width = o.type === 'media' ? (o.w || 60) + 'cqw' : (o.w ? o.w + 'cqw' : 'max-content');
      el.style.maxWidth = o.type === 'text' ? '92cqw' : 'none';
      el.style.opacity = (k.op * (o.op != null ? o.op : 1)).toFixed(3);
      el.style.transform = `translate(calc(${o.x != null ? o.x : 50}cqw - 50%), calc(${o.y != null ? o.y : 50}cqh - 50%)) translate(${k.dx}cqw,${k.dy}cqw) rotate(${(o.rot || 0) + k.rot}deg) scale(${(k.sc * (o.sc || 1)).toFixed(4)})`;
      el.style.pointerEvents = api.editing ? 'auto' : 'none'; el.style.cursor = api.editing ? 'move' : '';
      el.style.outline = api.editing && api.sel === o.id ? '0.4cqw dashed #00E5FF' : 'none';
      if (o.type === 'media' && (D.media[o.mid] || {}).kind === 'video') waits.push(syncVid(el.querySelector('video'), (o.in || 0) + (T - o.start), exact, playing, 1));
    }
    await Promise.all(waits);
  }
  function dragOv(e, id){
    if (!api.editing) return; e.preventDefault(); e.stopPropagation();
    const r = L.getBoundingClientRect(), o = D.ov.find(x => x.id === id); if (!o) return;
    const x0 = e.clientX, y0 = e.clientY, ox = o.x != null ? o.x : 50, oy = o.y != null ? o.y : 50;
    api.sel = id; if (api.onSelect) api.onSelect(id);
    const mv = ev => { o.x = Math.round((ox + (ev.clientX - x0) / r.width * 100) * 10) / 10; o.y = Math.round((oy + (ev.clientY - y0) / r.height * 100) * 10) / 10; api.preview(api.T, false); if (api.onDrag) api.onDrag(id, o.x, o.y, false); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (api.onDrag) api.onDrag(id, o.x, o.y, true); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }

  /* ---------- video sync ---------- */
  function syncVid(v, t, exact, playing, rate){
    if (!v) return null;
    const d = v.duration; if (isFinite(d)) t = Math.min(t, d - .03); t = Math.max(0, t);
    if (playing && !exact) {
      v.playbackRate = rate || 1; if (v.paused) v.play().catch(() => {});
      if (Math.abs(v.currentTime - t) > .3) v.currentTime = t;
      return null;
    }
    if (!v.paused) v.pause();
    if (Math.abs(v.currentTime - t) > (exact ? .004 : .03)) {
      v.currentTime = t;
      return new Promise(r => { const done = () => { v.removeEventListener('seeked', done); r(); }; v.addEventListener('seeked', done); setTimeout(done, exact ? 4000 : 400); });
    }
    return v.readyState >= 2 ? null : new Promise(r => { v.addEventListener('loadeddata', r, {once: true}); setTimeout(r, 3000); });
  }

  /* ---------- the frame ---------- */
  let curMainEl = null;
  async function frame(T, exact, playing){
    T = clamp(T, 0, DURO - 1 / 120);
    api.T = T;
    const c = clipAt(T), waits = [];
    const vo = document.getElementById('vo');
    if (c.src === 'base') {
      MAIN.style.display = 'none'; if (curMainEl && curMainEl.tagName === 'VIDEO') curMainEl.pause(); curMainEl = null;
      const st = srcOf(c, T);
      if (vo && !exact) {
        if (playing) { vo.muted = true; vo.playbackRate = c.sp; if (vo.paused) vo.play().catch(() => {}); if (Math.abs(vo.currentTime - st) > .25) vo.currentTime = st; }
        else { if (!vo.paused) vo.pause(); vo.currentTime = st; }
      }
      try { origRender(st); } catch (e) { console.error(e); }
      if (exact && window.__settle && window.__settle !== settle) waits.push(window.__settle());
    } else {
      if (vo && !vo.paused) vo.pause();
      const id = c.src.slice(2), m = D.media[id] || {};
      MAIN.style.display = 'block';
      const el = mediaEl(id, 'main');
      if (el.parentNode !== MAIN) MAIN.appendChild(el);
      [...MAIN.children].forEach(x => { if (x !== el) { x.style.display = 'none'; if (x.tagName === 'VIDEO' && !x.paused) x.pause(); } });
      el.style.display = 'block';
      const z = c.zoom || 1, kb = c.kb ? 1 + .1 * ((T - c.s) / (c.e - c.s)) : 1;
      el.style.objectFit = c.fit || 'cover';
      el.style.transform = `translate(${(c.px || 0)}%, ${(c.py || 0)}%) scale(${(z * kb).toFixed(4)})`;
      curMainEl = el;
      if (m.kind === 'video') waits.push(syncVid(el, srcOf(c, T), exact, playing, c.sp));
    }
    const g = gradeFor(c), blur = transition(T);
    applyGrade(g, blur);
    waits.push(drawOverlays(T, exact, playing));
    await Promise.all(waits.filter(Boolean));
  }
  const settle = () => Promise.resolve();

  /* ---------- audio ---------- */
  const b64ToBuf = b => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
  const decode = async ab => { try { return await new OfflineAudioContext(2, SR, SR).decodeAudioData(ab); } catch (e) { return null; } };
  const baseMixer = window.__mixAudio;
  let BASE = null, BASEKEY = '';
  async function baseBuf(){
    const sfxK = (D.mix && D.mix.sfx != null) ? D.mix.sfx : 1;
    const key = JSON.stringify(window.ED ? ED.sfx : 0) + '|' + sfxK;
    if (BASE && key === BASEKEY) return BASE;
    let ab = null;
    if (baseMixer && window.ED) {
      const keep = ED.sfx; ED.sfx = (keep || []).map(([n, t, g]) => [n, t, g * sfxK]);
      try { ab = b64ToBuf(await baseMixer()); } catch (e) { console.warn(e); }
      ED.sfx = keep;
    } else {
      const vo = document.getElementById('vo'); const src = vo && (vo.currentSrc || vo.src);
      if (src) try { ab = await (await fetch(src)).arrayBuffer(); } catch (e) {}
    }
    BASE = ab ? await decode(ab) : null; BASEKEY = key; return BASE;
  }
  async function libBuf(name){
    const k = 'lib:' + name; if (AUD[k] !== undefined) return AUD[k];
    let b = null; try { const lib = JSON.parse(document.getElementById('sfx-lib').textContent); if (lib[name]) b = await decode(b64ToBuf(lib[name])); } catch (e) {}
    return (AUD[k] = b);
  }
  async function mediaBuf(id){
    if (id.startsWith('lib:')) return libBuf(id.slice(4));
    if (AUD[id] !== undefined) return AUD[id];
    let b = null; if (URLS[id]) try { b = await decode(await (await fetch(URLS[id])).arrayBuffer()); } catch (e) {}
    return (AUD[id] = b);
  }
  function sched(ctx, buf, at, off, len, rate, gain, fin, fout){
    if (!buf || len <= 0) return;
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate || 1;
    const g = ctx.createGain(); s.connect(g); g.connect(ctx.destination);
    const out = len / (rate || 1), a = Math.max(.004, fin || 0), b = Math.max(.004, fout || 0);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + Math.min(a, out / 2));
    g.gain.setValueAtTime(gain, Math.max(at + Math.min(a, out / 2), at + out - Math.min(b, out / 2))); g.gain.linearRampToValueAtTime(0, at + out);
    s.start(at, Math.max(0, off), len);
  }
  async function renderBus(fn){
    const ctx = new OfflineAudioContext(2, Math.ceil(DURO * SR) + 1, SR);
    await fn(ctx); return await ctx.startRendering();
  }
  async function mix(){
    build();
    const M = Object.assign({voice: 1, sfx: 1, music: .5, master: 1, duck: .6}, D.mix || {});
    const base = await baseBuf();
    const speech = await renderBus(async ctx => {
      for (const c of TL) {
        const len = c.out - c.in;
        if (c.src === 'base') sched(ctx, base, c.s, c.in, len, c.sp, M.voice * (c.vol != null ? c.vol : 1), .006, .006);
        else if ((D.media[c.src.slice(2)] || {}).kind === 'video' && (c.vol == null || c.vol > 0)) sched(ctx, await mediaBuf(c.src.slice(2)), c.s, c.in, len, c.sp, M.voice * (c.vol != null ? c.vol : 1), .01, .01);
      }
      for (const o of D.ov || []) if (o.type === 'media' && (D.media[o.mid] || {}).kind === 'video' && o.vol > 0) sched(ctx, await mediaBuf(o.mid), o.start, o.in || 0, o.dur, 1, M.voice * o.vol, .02, .02);
    });
    const ducked = await renderBus(async ctx => { for (const a of D.au || []) if (a.duck !== false) sched(ctx, await mediaBuf(a.mid), a.start, a.in || 0, a.dur, a.rate || 1, M.music * (a.vol != null ? a.vol : 1), a.fin || 0, a.fout || 0); });
    const plain = await renderBus(async ctx => { for (const a of D.au || []) if (a.duck === false) sched(ctx, await mediaBuf(a.mid), a.start, a.in || 0, a.dur, a.rate || 1, M.sfx * (a.vol != null ? a.vol : 1), a.fin || 0, a.fout || 0); });
    const N = speech.length, S0 = speech.getChannelData(0), S1 = speech.getChannelData(1);
    // speech envelope → ducking gain for music
    const w = Math.round(.01 * SR), nb = Math.ceil(N / w), env = new Float32Array(nb); let mx = 1e-6;
    for (let b = 0; b < nb; b++) { let s = 0; const e = Math.min(N, (b + 1) * w); for (let i = b * w; i < e; i++) s += S0[i] * S0[i]; env[b] = Math.sqrt(s / Math.max(1, e - b * w)); mx = Math.max(mx, env[b]); }
    const gb = new Float32Array(nb); let g = 1; const att = 1 - Math.exp(-1 / 3), rel = 1 - Math.exp(-1 / 30);
    for (let b = 0; b < nb; b++) { const tgt = 1 - M.duck * clamp(env[b] / (mx * .18)); g += (tgt - g) * (tgt < g ? att : rel); gb[b] = g; }
    const out = [new Float32Array(N), new Float32Array(N)]; let pk = 0;
    for (let ch = 0; ch < 2; ch++) {
      const s = ch ? S1 : S0, d = ducked.getChannelData(ch), p = plain.getChannelData(ch), o = out[ch];
      for (let i = 0; i < N; i++) { o[i] = (s[i] + d[i] * gb[(i / w) | 0] + p[i]) * M.master; const a = Math.abs(o[i]); if (a > pk) pk = a; }
    }
    if (pk > .98) for (const o of out) for (let i = 0; i < N; i++) o[i] *= .98 / pk;
    return wav(out);
  }
  function wav(ch){
    const N = ch[0].length, C = ch.length, buf = new ArrayBuffer(44 + N * 2 * C), dv = new DataView(buf), ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, 36 + N * 2 * C, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, C, true);
    dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2 * C, true); dv.setUint16(32, 2 * C, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, N * 2 * C, true);
    let o = 44; for (let i = 0; i < N; i++) for (let c = 0; c < C; c++) { dv.setInt16(o, Math.max(-1, Math.min(1, ch[c][i])) * 32767, true); o += 2; }
    return buf;
  }
  async function peaks(n){
    const b = await baseBuf(); if (!b) return null;
    const d = b.getChannelData(0), step = Math.max(1, Math.floor(d.length / n)), p = new Float32Array(n);
    for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step; j < (i + 1) * step && j < d.length; j += 8) m = Math.max(m, Math.abs(d[j])); p[i] = m; }
    return p;
  }
  async function bufPeaks(id, n){
    const b = await mediaBuf(id); if (!b) return null;
    const d = b.getChannelData(0), step = Math.max(1, Math.floor(d.length / n)), p = new Float32Array(n);
    for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step; j < (i + 1) * step && j < d.length; j += 16) m = Math.max(m, Math.abs(d[j])); p[i] = m; }
    return {p, dur: b.duration};
  }

  /* ---------- public API ---------- */
  const api = window.__post = {
    dur: baseDur, baseDur, T: 0, editing: false, sel: null, PRESETS,
    data: () => D,
    setData(d){ D = Object.assign(empty(), d); build(); },
    setMedia(id, url){ URLS[id] = url; delete AUD[id]; for (const k in ELS) if (k.startsWith(id + '|')) { ELS[k].src = url; } },
    render: T => frame(T, true, false),
    preview: (T, playing) => frame(T, false, playing),
    stop(){ const vo = document.getElementById('vo'); if (vo && !vo.paused) vo.pause(); document.querySelectorAll('#post-layer video').forEach(v => v.pause()); },
    clipAt: T => { build(); const c = clipAt(T); return {id: c.id, src: c.src, s: c.s, e: c.e, srcT: srcOf(c, T)}; },
    timeline: () => { build(); return TL.map(c => ({id: c.id, s: c.s, e: c.e, src: c.src, in: c.in, out: c.out, sp: c.sp})); },
    mix, peaks, bufPeaks,
    mediaUrl: id => URLS[id]
  };
  build();
  window.__postReady = (async () => {
    await loadMedia();
    await Promise.all(Object.keys(D.media || {}).map(id => new Promise(r => { const el = mediaEl(id, 'main'); if (!URLS[id]) return r(); if (el.tagName === 'IMG') { if (el.complete) r(); else { el.onload = r; el.onerror = r; } } else { el.onloadeddata = r; el.onerror = r; setTimeout(r, 5000); } })));
    // overlay text font: Tajawal, loaded before the first frame (never a thin fallback)
    try {
      if (!document.getElementById('post-font')) { const l = document.createElement('link'); l.id = 'post-font'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;900&display=block'; document.head.appendChild(l); await new Promise(r => { l.onload = r; l.onerror = r; setTimeout(r, 6000); }); }
      await Promise.race([Promise.all(['900', '700', '500'].map(w => document.fonts.load(w + ' 40px Tajawal', 'أبجد'))), new Promise(r => setTimeout(r, 6000))]);
    } catch (e) {}
    try { await document.fonts.ready; } catch (e) {}
    if (baseMixer) window.__mixAudio = async () => { const b = new Uint8Array(await mix()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
    return true;
  })();
  // pages without their own mixer still export the montage sound
  if (!baseMixer) window.__mixAudio = async () => { await window.__postReady; const b = new Uint8Array(await mix()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
})();
