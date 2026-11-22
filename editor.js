/* Motion Studio — montage editor (CapCut-style). Works on any of our pages (#reel + render(t)).
   Edits are stored as data (cut-data + media) and baked into the HTML with the post.js runtime,
   so the preview, the saved file and the cloud render are always the same. */
(function(){
const EDRE = /(<script type="application\/json" id="edit-data">)([\s\S]*?)(<\/script>)/;
const CUTRE = /<script type="application\/json" id="cut-data">[\s\S]*?<\/script>\s*/g;
const MEDRE = /<script type="text\/plain" class="post-media"[^>]*>[\s\S]*?<\/script>\s*/g;
const RTRE = /<script id="post-rt">[\s\S]*?<\/script>\s*/g;
const SFX_AR = {whoosh_fast: 'ووش سريع', whoosh_big: 'ووش كبير', swipe: 'سحبة', impact: 'خبطة', hit_small: 'خبطة صغيرة', stamp: 'ختم', pop: 'بوب', pencil: 'قلم', marker: 'ماركر', paper: 'ورق', coins: 'فلوس', ding: 'دينج', buzz: 'غلط', riser: 'رايزر', glitch: 'جليتش', typing: 'كتابة', count: 'عدّاد', click: 'كليك'};
const KEYS = [['عادي', 0, '#3a3f4d'], ['أصفر', 1, '#F5C518'], ['أحمر', 2, '#EF5350'], ['أخضر', 3, '#26A69A']];
const FILTERS = [['none', 'بدون'], ['cine', 'سينمائي'], ['warm', 'دافي'], ['cold', 'بارد'], ['vivid', 'حيوي'], ['drama', 'دراما'], ['gold', 'ذهبي'], ['bw', 'أبيض وأسود'], ['retro', 'قديم'], ['night', 'ليلي']];
const FCSS = {none: '', cine: 'contrast(1.15) saturate(.85) hue-rotate(-8deg)', warm: 'sepia(.3) saturate(1.2)', cold: 'hue-rotate(20deg) saturate(.9)', vivid: 'saturate(1.6) contrast(1.1)', drama: 'contrast(1.35) brightness(.9)', gold: 'sepia(.45) saturate(1.3)', bw: 'grayscale(1) contrast(1.2)', retro: 'sepia(.6) contrast(.9)', night: 'hue-rotate(25deg) brightness(.75) saturate(.7)'};
const TRS = [['none', 'بدون'], ['fade', 'إظلام'], ['flash', 'فلاش'], ['yellow', 'فلاش أصفر'], ['blur', 'بلور'], ['wipe', 'مسح']];
const ADJ = [['bri', 'سطوع', -.5, .5], ['con', 'تباين', -.5, .6], ['sat', 'تشبّع', -1, 1], ['light', 'إضاءة', 0, 1], ['shadow', 'رفع الظلال', 0, .5], ['temp', 'حرارة', -1, 1], ['tint', 'صبغة', -1, 1], ['hue', 'درجة اللون', -.5, .5], ['vig', 'فينيت', 0, 1], ['sepia', 'عتيق', 0, 1], ['blur', 'تنعيم', 0, 1]];
const TEXTP = [
  {n: 'عنوان ضخم', text: 'عنوان قوي', style: {size: 11, color: '#ffffff', stroke: '#000000', strokeW: 1.3}, anim: 'pop'},
  {n: 'كابشن أصفر', text: 'كلمة مهمة', style: {size: 8, color: '#F5C518', stroke: '#000000', strokeW: 1.1}, anim: 'pop'},
  {n: 'شريط أحمر', text: 'خلي بالك!', style: {size: 7, color: '#ffffff', bg: '#E5262B'}, anim: 'right'},
  {n: 'شريط أسود', text: 'معلومة سريعة', style: {size: 6.2, color: '#ffffff', bg: 'rgba(0,0,0,.78)'}, anim: 'up'},
  {n: 'ورقة بيضا', text: 'ملحوظة', style: {size: 6.5, color: '#111111', bg: '#ffffff', radius: .15, shadow: true}, anim: 'swing'},
  {n: 'نيون', text: 'NEON', style: {size: 9, color: '#22d3ee', shadow: false, glow: '#22d3ee'}, anim: 'zoom'},
  {n: 'كتابة آلة', text: 'بتتكتب حرف حرف…', style: {size: 6.5, color: '#ffffff', stroke: '#000000', strokeW: .8}, anim: 'type'},
  {n: 'رقم ضخم', text: '1000$', style: {size: 18, color: '#F5C518', stroke: '#000000', strokeW: 1.6}, anim: 'zoom'}
];
const PAD = 14;
const uid = p => p + Math.random().toString(36).slice(2, 8);
const clone = o => JSON.parse(JSON.stringify(o));
const r3 = v => Math.round(v * 1000) / 1000;
const fmt = t => { t = Math.max(0, t); const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
const clampv = (v, a, b) => Math.max(a, Math.min(b, v));

let POSTJS = '';
fetch('post.js?v=' + Date.now()).then(r => r.text()).then(t => POSTJS = t).catch(() => {});

/* ============ state ============ */
let P = null;            // {name, html, ed, cut, media:{id:{...,blob,url,thumb,peaks}}, colors, basePeaks}
let pvWin = null, PX = 90, SEL = null, UNDO = [], REDO = [], playing = false, T = 0, clockT0 = 0, clockP0 = 0;
let SNAP = true, mixUrl = null, mixDirty = true, mixT = null, saveT = null, rowY = {};
const mixA = new Audio(); mixA.preload = 'auto';
const post = () => pvWin && pvWin.__post;
const cut = () => P.cut;
const dur = () => (post() ? post().dur : 1);

/* ============ open / new ============ */
const BLANK = '<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Motion Studio</title>' +
  '<style>html,body{margin:0;background:#111;display:grid;place-items:center;min-height:100vh}#reel{position:relative;width:min(100vw,56.25vh);aspect-ratio:9/16;background:#000;overflow:hidden;container-type:size}</style></head>' +
  '<body><div class="reel" id="reel"></div><script>const DUR = 0.1;\nfunction render(t){}\n</script></body></html>';

async function blobFromB64(b64, mime){ return await (await fetch('data:' + mime + ';base64,' + b64)).blob(); }
window.openProject = async function(name, html, restore){
  if (!POSTJS) try { POSTJS = await (await fetch('post.js?v=' + Date.now())).text(); } catch (e) {}
  stop();
  const m = html.match(EDRE); let ed = null; try { ed = m ? JSON.parse(m[2]) : null; } catch (e) {}
  let cd = null; const cm = html.match(/<script type="application\/json" id="cut-data">([\s\S]*?)<\/script>/); try { cd = cm ? JSON.parse(cm[1]) : null; } catch (e) {}
  const media = {};
  if (restore && restore.media) Object.assign(media, restore.media);
  else for (const mm of html.matchAll(/<script type="text\/plain" class="post-media" data-id="([^"]+)" data-mime="([^"]+)">([\s\S]*?)<\/script>/g)) {
    try { const blob = await blobFromB64(mm[3].trim(), mm[2]); media[mm[1]] = {blob}; } catch (e) {}
  }
  const clean = html.replace(CUTRE, '').replace(MEDRE, '').replace(RTRE, '');
  P = {name: name.replace(/\.html?$/i, ''), html: clean, ed, cut: restore ? restore.cut : cd, media, colors: restore ? restore.colors || {} : {}, basePeaks: null, blank: /const DUR = 0\.1;\nfunction render\(t\)\{\}/.test(clean)};
  if (restore && restore.ed) P.ed = restore.ed;
  for (const [id, mm] of Object.entries(P.media)) { mm.url = URL.createObjectURL(mm.blob); Object.assign(mm, (P.cut && P.cut.media && P.cut.media[id]) || {}); }
  SEL = null; UNDO = []; REDO = []; T = 0;
  $('edEmpty').hidden = true; $('edApp').hidden = false; $('pName').value = P.name; $('pvLd').hidden = false;
  go('edit'); loadPreview(); drawMediaGrid(); drawSfxList();
};
function newProject(){ openProject('مشروع_جديد', BLANK); setTimeout(() => $('mediaIn').click(), 400); }
$('newProj').onclick = newProject; $('newProj2').onclick = newProject;

function previewHtml(){
  const fit = '<style id="__fit">html,body{margin:0!important;padding:0!important;background:#000!important;display:block!important;min-height:0!important;overflow:hidden!important}body>*:not(#reel){display:none!important}#reel{width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;border-radius:0!important;box-shadow:none!important;aspect-ratio:auto!important;position:fixed!important;left:0;top:0;margin:0!important}</style>';
  const cd = '<script type="application/json" id="cut-data">' + JSON.stringify(P.cut || {}).replace(/</g, '\\u003c') + '</script>';
  let h = P.html;
  if (P.ed) h = h.replace(EDRE, (x, a, b, c) => a + JSON.stringify(P.ed).replace(/</g, '\\u003c') + c);
  h = h.replace('</head>', fit + '</head>');
  return h.replace(/<\/body>(?![\s\S]*<\/body>)/i, cd + '<script id="post-rt">' + POSTJS + '</script></body>');
}
function reelAR(html){
  const c = ((html || '').match(/\.reel\s*\{[^}]*\}/) || [''])[0];
  const w = +((c.match(/(?:^|[;{\s])width:\s*(\d+)px/) || [])[1] || 0), h = +((c.match(/(?:^|[;{\s])height:\s*(\d+)px/) || [])[1] || 0);
  return w && h ? `${w}/${h}` : '9/16';
}
function loadPreview(){
  const pv = $('pv');
  { const ar = reelAR(P.html), [aw, ah] = ar.split('/').map(Number), bx = $('pvBox'); bx.style.aspectRatio = ar;
    if (aw > ah) { bx.style.height = 'auto'; bx.style.width = '100%'; bx.style.maxHeight = '100%'; } else { bx.style.height = ''; bx.style.width = ''; bx.style.maxHeight = ''; } }
  pv.onload = async () => {
    pvWin = pv.contentWindow;
    try { await pvWin.document.fonts.ready; } catch (e) {}
    const ps = post(); if (!ps) { $('pvLd').innerHTML = 'الملف ده مش من أكوادنا (مفيهوش #reel و render). افتحه من الرئيسية وهيروح للريندر على طول.'; return; }
    for (const [id, m] of Object.entries(P.media)) ps.setMedia(id, m.url);
    if (!P.cut) { P.cut = clone(ps.data()); if (P.blank) P.cut.main = []; }
    P.cut.media = P.cut.media || {};
    for (const [id, m] of Object.entries(P.media)) if (!P.cut.media[id]) P.cut.media[id] = {kind: m.kind, name: m.name, mime: m.blob.type, dur: m.dur};
    ps.setData(clone(P.cut));
    try { await pvWin.__postReady; } catch (e) {}
    ps.editing = true;
    ps.onSelect = id => { SEL = {k: 'ov', id}; drawTL(); showInsp(); };
    ps.onDrag = (id, x, y, end) => { const o = cut().ov.find(q => q.id === id); if (!o) return; if (end) { snapUndo(); o.x = x; o.y = y; changed({audio: false}); } else { o.x = x; o.y = y; updateInspXY(o); } };
    $('pvLd').hidden = true;
    await prepMediaMeta();
    buildColors();
    try { const n = Math.ceil(ps.baseDur * 80); P.basePeaks = await ps.peaks(n); } catch (e) {}
    for (const id of Object.keys(P.media)) loadPeaks(id);
    drawTL(); showInsp(); seek(0); remix();
  };
  pv.src = URL.createObjectURL(new Blob([previewHtml()], {type: 'text/html'}));
}

/* ============ media ============ */
async function probe(blob, kind){
  const url = URL.createObjectURL(blob);
  if (kind === 'image') return new Promise(r => { const i = new Image(); i.onload = () => r({url, w: i.naturalWidth, h: i.naturalHeight, dur: 3, thumb: url}); i.onerror = () => r({url, dur: 3}); i.src = url; });
  return new Promise(r => {
    const el = document.createElement(kind === 'audio' ? 'audio' : 'video'); el.preload = 'auto'; el.muted = true; el.src = url;
    let done = false; const fin = (o) => { if (done) return; done = true; r(Object.assign({url, dur: isFinite(el.duration) ? el.duration : 5}, o)); };
    el.onloadedmetadata = () => {
      if (kind === 'audio') return fin({});
      el.currentTime = Math.min(.5, el.duration / 3 || 0);
      el.onseeked = () => { try { const c = document.createElement('canvas'), s = 160 / Math.max(el.videoWidth, el.videoHeight); c.width = el.videoWidth * s; c.height = el.videoHeight * s; c.getContext('2d').drawImage(el, 0, 0, c.width, c.height); fin({w: el.videoWidth, h: el.videoHeight, thumb: c.toDataURL('image/jpeg', .7)}); } catch (e) { fin({}); } };
    };
    el.onerror = () => fin({}); setTimeout(() => fin({}), 8000);
  });
}
const kindOf = f => f.type.startsWith('image') ? 'image' : f.type.startsWith('audio') ? 'audio' : 'video';
async function importFiles(files, asMusic){
  if (!P) return;
  let big = 0;
  for (const f of files) {
    const kind = kindOf(f), id = uid('m'); big += f.size;
    const meta = await probe(f, kind);
    P.media[id] = {blob: f, kind, name: f.name, mime: f.type, ...meta};
    P.cut.media[id] = {kind, name: f.name, mime: f.type, dur: meta.dur, w: meta.w, h: meta.h};
    post().setMedia(id, meta.url);
    if (asMusic || kind === 'audio') addAudio(id); else if (P.blank && !cut().main.length) addMain(id);
    loadPeaks(id);
  }
  if (big > 60e6) toast('الملفات كبيرة — الملف النهائي هيبقى تقيل. يفضّل فيديوهات مضغوطة (720p).', true);
  drawMediaGrid(); changed();
}
$('mediaIn').onchange = e => { importFiles([...e.target.files]); e.target.value = ''; };
$('musicIn').onchange = e => { importFiles([...e.target.files], true); e.target.value = ''; };
async function prepMediaMeta(){
  for (const [id, m] of Object.entries(P.media)) if (!m.url || m.dur == null || (!m.thumb && m.kind !== 'audio')) { const kind = m.kind || (P.cut.media[id] || {}).kind || kindOf(m.blob); const meta = await probe(m.blob, kind); Object.assign(m, {kind}, meta); }
  drawMediaGrid();
}
async function loadPeaks(id){ const m = P.media[id]; if (!m || m.kind === 'image' || m.peaks) return; try { const r = await post().bufPeaks(id, 2000); if (r) { m.peaks = r.p; drawTL(); } } catch (e) {} }
function drawMediaGrid(){
  const g = $('mGrid'); if (!P) return;
  const list = Object.entries(P.media).filter(([, m]) => !m.sfx);
  g.innerHTML = list.length ? '' : '<p class="hint" style="grid-column:1/-1">لسه مفيش ميديا. استورد فيديوهات أو صور أو صوت.</p>';
  for (const [id, m] of list) {
    const d = document.createElement('div'); d.className = 'mi';
    const ic = m.kind === 'audio' ? '♫' : m.kind === 'image' ? '' : '';
    d.innerHTML = `<div class="th" style="${m.thumb ? `background-image:url('${m.thumb}')` : ''}">${ic}${m.kind !== 'image' ? `<span class="d">${(m.dur || 0).toFixed(1)}s</span>` : ''}</div><div class="nm"></div><div class="ac">` +
      (m.kind === 'audio' ? `<button type="button" data-a="au">＋ صوت</button>` : `<button type="button" data-a="main">＋ كليب</button><button type="button" data-a="ov">طبقة</button>`) + '</div>';
    d.querySelector('.nm').textContent = m.name || id;
    d.querySelectorAll('button').forEach(b => b.onclick = () => { if (b.dataset.a === 'main') addMain(id); else if (b.dataset.a === 'ov') addOverlayMedia(id); else addAudio(id); });
    g.appendChild(d);
  }
}
function drawSfxList(){
  const box = $('sfxList'); box.innerHTML = '';
  let names = [];
  try { names = Object.keys(JSON.parse(pvWin.document.getElementById('sfx-lib').textContent)); } catch (e) {}
  if (!names.length) { box.innerHTML = '<p class="hint" style="grid-column:1/-1">المؤثرات المدمجة بتظهر هنا لما الملف يكون فيه مكتبة مؤثرات.</p>'; return; }
  for (const n of names) {
    const d = document.createElement('div'); d.className = 'sfxi';
    d.innerHTML = `<button type="button" title="اسمع">▶</button><span>${SFX_AR[n] || n}</span><button class="add" type="button" title="ضيف عند المؤشر">＋</button>`;
    d.children[0].onclick = () => { try { const b = JSON.parse(pvWin.document.getElementById('sfx-lib').textContent)[n]; const a = new Audio('data:audio/mpeg;base64,' + b); a.volume = .6; a.play(); } catch (e) {} };
    d.children[2].onclick = () => addLibSfx(n);
    box.appendChild(d);
  }
}

/* ============ pro SFX library (site /sfx) ============ */
let PRO = [], PROCAT = 'all';
const CATS = [['all', 'الكل'], ['whoosh', 'ووش'], ['impact', 'خبطات'], ['ui', 'كليك وبوب'], ['money', 'فلوس'], ['result', 'نتيجة'], ['riser', 'رايزر'], ['fx', 'تأثيرات']];
fetch('sfx/index.json?v=1').then(r => r.json()).then(j => { PRO = j; drawPro(); }).catch(() => {});
function drawPro(){
  const cats = $('proCats'), list = $('proList'); if (!cats) return;
  cats.innerHTML = ''; for (const [k, n] of CATS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = n; if (k === PROCAT) b.className = 'on'; b.onclick = () => { PROCAT = k; drawPro(); }; cats.appendChild(b); }
  const q = ($('proQ').value || '').trim(); list.innerHTML = '';
  for (const s of PRO.filter(x => (PROCAT === 'all' || x.cat === PROCAT) && (!q || x.ar.includes(q) || x.id.includes(q)))) {
    const d = document.createElement('div'); d.className = 'sfxi';
    d.innerHTML = `<button type="button" title="اسمع">▶</button><span></span><button class="add" type="button" title="ضيف عند المؤشر">＋</button>`;
    d.querySelector('span').textContent = s.ar;
    d.children[0].onclick = () => { const a = new Audio('sfx/' + s.id + '.mp3'); a.volume = .7; a.play(); };
    d.children[2].onclick = () => addProSfx(s);
    list.appendChild(d);
  }
}
$('proQ').oninput = drawPro;
const PROMEDIA = {};
async function addProSfx(s){
  if (!P || !post()) return;
  let id = PROMEDIA[s.id];
  if (!id || !P.media[id]) {
    const blob = await (await fetch('sfx/' + s.id + '.mp3')).blob();
    id = PROMEDIA[s.id] = 'm' + s.id.replace(/[^a-z0-9]/gi, '');
    const url = URL.createObjectURL(blob);
    P.media[id] = {blob, kind: 'audio', name: s.ar, mime: 'audio/mpeg', url, dur: s.dur, sfx: true};
    P.cut.media[id] = {kind: 'audio', name: s.ar, mime: 'audio/mpeg', dur: s.dur};
    post().setMedia(id, url); loadPeaks(id);
  }
  snapUndo();
  const st = Math.max(0, T - s.peak), inn = Math.max(0, s.peak - T);
  const a = {id: uid('a'), mid: id, start: r3(st), in: r3(inn), dur: r3(s.dur - inn), vol: .7, fin: 0, fout: .05, duck: false, sfx: true};
  cut().au.push(a); SEL = {k: 'au', id: a.id}; changed(); drawMediaGrid();
}

/* ============ adding things ============ */
function splitMainAt(t){
  const tl = post().timeline(); const i = tl.findIndex(c => t > c.s + .03 && t < c.e - .03); if (i < 0) return tl.findIndex(c => t <= c.s + .03) < 0 ? cut().main.length : tl.findIndex(c => t <= c.s + .03);
  const c = cut().main[i], x = tl[i], st = x.in + (t - x.s) * x.sp;
  const a = Object.assign(clone(c), {out: r3(st)}), b = Object.assign(clone(c), {id: uid('c'), in: r3(st), tr: 'none'});
  cut().main.splice(i, 1, a, b); return i + 1;
}
function addMain(id){
  const m = P.media[id]; snapUndo();
  if (P.blank && cut().main.length === 0) T = 0;
  const at = splitMainAt(T);
  const c = {id: uid('c'), src: 'm:' + id, in: 0, out: r3(m.kind === 'image' ? 3 : m.dur), speed: 1, vol: 1, kb: m.kind === 'image'};
  cut().main.splice(at, 0, c); SEL = {k: 'main', id: c.id}; changed(); toast('اتضاف الكليب ✓');
}
function addOverlayMedia(id){
  const m = P.media[id]; snapUndo();
  const o = {id: uid('o'), type: 'media', mid: id, start: r3(T), dur: r3(Math.min(m.kind === 'image' ? 3 : m.dur, Math.max(1, dur() - T))), in: 0, x: 50, y: 42, w: 62, anim: 'pop', vol: 0};
  cut().ov.push(o); SEL = {k: 'ov', id: o.id}; changed(); toast('اتضاف كطبقة فوق الفيديو ✓');
}
function addAudio(id){
  const m = P.media[id]; snapUndo();
  const a = {id: uid('a'), mid: id, start: r3(T), in: 0, dur: r3(Math.min(m.dur || 5, Math.max(1, dur() - T))), vol: .8, fin: .4, fout: 1.2, duck: true};
  if (dur() - T < 1) a.dur = r3(m.dur || 5);
  cut().au.push(a); SEL = {k: 'au', id: a.id}; changed(); toast('اتضاف الصوت ✓');
}
async function addLibSfx(n){
  snapUndo(); const id = 'lib:' + n; let d = 1.2;
  try { const r = await post().bufPeaks(id, 400); if (r) { d = r.dur; P.libPeaks = P.libPeaks || {}; P.libPeaks[id] = r.p; } } catch (e) {}
  const a = {id: uid('a'), mid: id, start: r3(T), in: 0, dur: r3(d), vol: .7, fin: 0, fout: .05, duck: false};
  cut().au.push(a); SEL = {k: 'au', id: a.id}; changed();
}
function addText(p){
  p = p || TEXTP[0]; snapUndo();
  const o = {id: uid('o'), type: 'text', text: p.text, style: clone(p.style), anim: p.anim, start: r3(T), dur: 2.5, x: 50, y: 30};
  cut().ov.push(o); SEL = {k: 'ov', id: o.id}; changed({audio: false}); toast('اتضاف النص — عدّله من اليمين واسحبه في الشاشة');
}
(function textGrid(){
  const g = $('tGrid');
  TEXTP.forEach(p => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tp';
    const s = p.style;
    b.innerHTML = `<span style="display:inline-block;font:900 ${Math.min(26, s.size * 2.4)}px Tajawal;color:${s.color};${s.bg ? `background:${s.bg};padding:3px 10px;border-radius:6px;` : ''}${s.stroke ? `-webkit-text-stroke:1.5px ${s.stroke};paint-order:stroke fill;` : ''}${s.glow ? `text-shadow:0 0 10px ${s.glow},0 0 22px ${s.glow};` : ''}">${p.text}</span><div class="hint" style="margin:6px 0 0">${p.n}</div>`;
    b.onclick = () => addText(p); g.appendChild(b);
  });
})();
$('bAddText').onclick = () => addText();
$('bAddFx').onclick = () => { document.querySelector('.tab[data-t="audio"]').click(); toast('اختار مؤثر من القايمة واضغط ＋'); };

/* ============ undo / change ============ */
function state(){ return JSON.stringify({cut: P.cut, ed: P.ed}); }
function snapUndo(){ UNDO.push(state()); if (UNDO.length > 120) UNDO.shift(); REDO = []; updUndo(); }
function restoreState(s){ const o = JSON.parse(s); P.cut = o.cut; P.ed = o.ed; if (P.ed && pvWin.__setEdit) pvWin.__setEdit(clone(P.ed)); SEL = null; changed(); }
$('undo').onclick = () => { if (!UNDO.length) return; REDO.push(state()); restoreState(UNDO.pop()); updUndo(); };
$('redo').onclick = () => { if (!REDO.length) return; UNDO.push(state()); restoreState(REDO.pop()); updUndo(); };
function updUndo(){ $('undo').disabled = !UNDO.length; $('redo').disabled = !REDO.length; }
function changed(o = {}){
  if (!P || !post()) return;
  post().setData(clone(P.cut));
  T = clampv(T, 0, Math.max(0, dur() - .01));
  drawTL(); if (o.insp !== false) showInsp(); render();
  if (o.audio !== false) { mixDirty = true; clearTimeout(mixT); mixT = setTimeout(remix, 450); }
  $('savedLbl').textContent = 'تعديلات مش محفوظة';
  clearTimeout(saveT); saveT = setTimeout(autosave, 2500);
}

/* ============ audio preview ============ */
let mixing = false, mixAgain = false;
async function remix(){
  if (!post()) return; if (mixing) { mixAgain = true; return; }
  mixing = true;
  try {
    const buf = await post().mix(); const was = playing;
    if (mixUrl) URL.revokeObjectURL(mixUrl); mixUrl = URL.createObjectURL(new Blob([buf], {type: 'audio/wav'}));
    mixA.src = mixUrl; await new Promise(r => { mixA.onloadedmetadata = r; setTimeout(r, 1500); });
    mixA.currentTime = T; mixDirty = false; if (was) mixA.play().catch(() => {});
  } catch (e) { console.warn('mix', e); }
  mixing = false; if (mixAgain) { mixAgain = false; remix(); }
}

/* ============ playback ============ */
function render(){ if (post()) post().preview(T, playing); $('tcNow').textContent = fmt(T); $('tcDur').textContent = fmt(dur()); movePh(); }
function play(){
  if (!post()) return; if (T >= dur() - .05) T = 0;
  playing = true; $('tPlay').textContent = '❚❚'; $('tPlay').classList.add('on');
  clockT0 = T; clockP0 = performance.now();
  if (!mixDirty && mixA.src) { mixA.currentTime = T; mixA.play().catch(() => {}); }
}
function stop(){ playing = false; $('tPlay').textContent = '▶'; $('tPlay').classList.remove('on'); mixA.pause(); if (post()) post().stop(); }
function seek(t){ T = clampv(t, 0, Math.max(0, dur() - 1 / 60)); if (playing) { clockT0 = T; clockP0 = performance.now(); if (!mixA.paused) mixA.currentTime = T; } render(); }
$('tPlay').onclick = () => playing ? (stop(), render()) : play();
$('toStart').onclick = () => seek(0); $('toEnd').onclick = () => seek(dur());
$('fBack').onclick = () => seek(T - 1 / 30); $('fFwd').onclick = () => seek(T + 1 / 30);
(function loop(){
  if (playing && post()) {
    T = (!mixA.paused && mixA.readyState >= 2) ? mixA.currentTime : clockT0 + (performance.now() - clockP0) / 1000;
    if (T >= dur()) { T = dur(); stop(); }
    render();
    const sc = $('tsc'), x = PAD + T * PX; if (x > sc.scrollLeft + sc.clientWidth - 60 || x < sc.scrollLeft) sc.scrollLeft = x - 100;
  }
  requestAnimationFrame(loop);
})();

/* ============ timeline ============ */
const xOf = t => PAD + t * PX, tOf = x => (x - PAD) / PX;
function mainSrcToOut(st){ // first output time showing base source time st
  for (const c of post().timeline()) if (c.src === 'base' && st >= c.in - 1e-6 && st < c.out) return c.s + (st - c.in) / c.sp;
  return null;
}
function lanes(items){ const L = []; for (const it of items.slice().sort((a, b) => a.start - b.start)) { let k = L.findIndex(e => e <= it.start + 1e-3); if (k < 0) { k = L.length; L.push(0); } L[k] = it.start + it.dur; it._lane = k; } return Math.max(1, L.length); }
function drawTL(){
  if (!P || !post()) return;
  const tl = post().timeline(), D = dur(), W = Math.max($('tsc').clientWidth, xOf(D) + 200), tin = $('tin');
  const ovs = cut().ov || [], aus = cut().au || [];
  const nOv = lanes(ovs), nAu = lanes(aus);
  const rows = []; let y = 26;
  const addRow = (k, h, label) => { rows.push({k, y, h, label}); rowY[k] = y; y += h; };
  for (let i = nOv - 1; i >= 0; i--) addRow('ov' + i, 34, i === nOv - 1 ? 'طبقات' : '');
  addRow('main', 62, 'الفيديو');
  if (P.ed) { addRow('cap', 30, 'الكلام'); addRow('fx', 30, 'المؤثرات'); }
  for (let i = 0; i < nAu; i++) addRow('au' + i, 40, i === 0 ? 'صوت/موسيقى' : '');
  const H = y + 20;
  let h = `<div class="ru" id="ru" style="width:${W}px">`;
  const step = PX > 200 ? .5 : PX > 90 ? 1 : PX > 40 ? 2 : 5;
  for (let s = 0; s <= D + step; s += step / 2) { const big = Math.abs(s / step - Math.round(s / step)) < 1e-6; h += `<i class="${big ? 'b' : ''}" style="left:${xOf(s)}px"></i>`; if (big) h += `<span style="left:${xOf(s)}px">${fmt(s).replace(/\.\d+$/, '')}</span>`; }
  h += '</div>';
  for (const r of rows) h += `<div class="trk ${r.k === 'main' ? 'main' : ''}" data-row="${r.k}" style="top:${r.y}px;height:${r.h}px;width:${W}px"></div>`;
  // main clips
  tl.forEach((c, i) => {
    const mc = cut().main[i]; if (!mc) return;
    const isB = c.src === 'base', m = isB ? null : P.media[c.src.slice(2)] || {};
    const sel = SEL && SEL.k === 'main' && SEL.id === mc.id;
    const lab = isB ? 'الفيديو الأساسي' : (m.name || 'كليب');
    h += `<div class="clip ${isB ? 'base' : 'media'}${sel ? ' sel' : ''}" data-k="main" data-id="${mc.id}" style="left:${xOf(c.s)}px;width:${Math.max(6, (c.e - c.s) * PX - 1)}px;top:${rowY.main + 4}px;height:54px">` +
      (m && m.thumb ? `<div class="thb" style="background-image:url('${m.thumb}')"></div>` : '') + `<canvas data-wave="main:${mc.id}"></canvas>` +
      (mc.tr && mc.tr !== 'none' ? '<span class="trm"></span>' : '') + (c.sp !== 1 ? `<span class="sp">${c.sp}x</span>` : '') + (mc.vol === 0 ? '<span class="sp" style="inset-inline-end:auto;inset-inline-start:5px">🔇</span>' : '') +
      `<span class="lab">${esc(lab)} · ${(c.e - c.s).toFixed(1)}s</span><i class="h l"></i><i class="h r"></i></div>`;
  });
  // overlays
  for (const o of ovs) {
    const sel = SEL && SEL.k === 'ov' && SEL.id === o.id, isT = o.type === 'text', m = isT ? null : P.media[o.mid] || {};
    h += `<div class="clip ${isT ? 'text' : 'ovm'}${sel ? ' sel' : ''}" data-k="ov" data-id="${o.id}" style="left:${xOf(o.start)}px;width:${Math.max(6, o.dur * PX - 1)}px;top:${rowY['ov' + o._lane] + 3}px;height:28px;align-items:center">` +
      (m && m.thumb ? `<div class="thb" style="background-image:url('${m.thumb}')"></div>` : '') + `<span class="lab">${isT ? 'T  ' + esc((o.text || '').slice(0, 30)) : '▣ ' + esc(m.name || 'طبقة')}</span><i class="h l"></i><i class="h r"></i></div>`;
  }
  // audio clips
  for (const a of aus) {
    const sel = SEL && SEL.k === 'au' && SEL.id === a.id, m0 = P.media[a.mid] || {}, lib = a.mid.startsWith('lib:') || a.sfx || m0.sfx, m = a.mid.startsWith('lib:') ? null : m0;
    const lab = a.mid.startsWith('lib:') ? '♪ ' + (SFX_AR[a.mid.slice(4)] || a.mid.slice(4)) : (lib ? '♪ ' : '♫ ') + (m.name || 'صوت');
    h += `<div class="clip ${lib ? 'sfxc' : 'au'}${sel ? ' sel' : ''}" data-k="au" data-id="${a.id}" style="left:${xOf(a.start)}px;width:${Math.max(6, a.dur * PX - 1)}px;top:${rowY['au' + a._lane] + 4}px;height:32px">` +
      `<canvas data-wave="au:${a.id}"></canvas><span class="lab">${esc(lab)}${a.duck ? '' : ''}</span><i class="h l"></i><i class="h r"></i></div>`;
  }
  // captions + base sfx (mapped to output time)
  if (P.ed) {
    const W2 = P.ed.words, starts = pageStarts(W2);
    W2.forEach((w, i) => { const ot = mainSrcToOut(w[1]); if (ot == null) return; const nx = i + 1 < W2.length ? mainSrcToOut(W2[i + 1][1]) : null; const wd = Math.max(14, ((nx != null && nx > ot ? nx : ot + .5) - ot) * PX - 2);
      h += `<div class="wd${w[2] ? ' k' + w[2] : ''}${starts.has(i) ? ' pg' : ''}${SEL && SEL.k === 'w' && SEL.i === i ? ' sel' : ''}" data-k="w" data-i="${i}" style="left:${xOf(ot)}px;width:${wd}px;top:${rowY.cap + 4}px;height:22px">${esc(w[0])}</div>`; });
    P.ed.sfx.forEach((f, i) => { const ot = mainSrcToOut(f[1]); if (ot == null) return;
      h += `<div class="fxm${SEL && SEL.k === 'fx' && SEL.i === i ? ' sel' : ''}" data-k="fx" data-i="${i}" style="left:${xOf(ot)}px;top:${rowY.fx + 4}px">${esc(SFX_AR[f[0]] || f[0])}</div>`; });
  }
  h += `<div class="snapl" id="snapl" style="height:${H}px"></div><div class="ph" id="ph" style="height:${H}px"></div><div class="phh" id="phh"></div>`;
  tin.style.width = W + 'px'; tin.style.height = H + 'px'; tin.innerHTML = h;
  // labels
  $('lbls').innerHTML = rows.map(r => `<div class="lb" style="top:${r.y}px;height:${r.h}px">${r.label}</div>`).join('');
  drawWaves(); movePh();
}
function pageStarts(W){ const s = new Set([0]); let st = 0; for (let k = 1; k < W.length; k++) if (k - st >= 4 || W[k][1] - W[k - 1][1] > .42 || /[؟.،]$/.test(W[k - 1][0])) { s.add(k); st = k; } return s; }
function drawWaves(){
  const tl = post().timeline();
  $('tin').querySelectorAll('canvas[data-wave]').forEach(cv => {
    const [k, id] = cv.dataset.wave.split(':'); const w = Math.max(1, Math.min(8000, cv.parentNode.offsetWidth)), hgt = cv.parentNode.offsetHeight;
    cv.width = w; cv.height = hgt; const g = cv.getContext('2d'); g.fillStyle = 'rgba(255,255,255,.55)';
    if (k === 'main') {
      const i = cut().main.findIndex(c => c.id === id), c = tl[i], mc = cut().main[i]; if (!c) return;
      let pk, pdur; if (c.src === 'base') { pk = P.basePeaks; pdur = post().baseDur; } else { const m = P.media[c.src.slice(2)]; pk = m && m.peaks; pdur = m && m.dur; }
      if (!pk || !pdur) return;
      for (let x = 0; x < w; x++) { const st = c.in + x / PX * c.sp, v = pk[Math.min(pk.length - 1, Math.floor(st / pdur * pk.length))] || 0, hh = Math.max(1, v * hgt * .8 * (mc.vol == null ? 1 : Math.min(1.5, mc.vol))); g.fillRect(x, hgt - hh - 2, 1, hh); }
    } else {
      const a = cut().au.find(q => q.id === id); if (!a) return;
      const lib = a.mid.startsWith('lib:'), pk = lib ? (P.libPeaks || {})[a.mid] : (P.media[a.mid] || {}).peaks, pdur = lib ? a.dur + a.in : (P.media[a.mid] || {}).dur;
      if (!pk || !pdur) return;
      for (let x = 0; x < w; x++) { const st = a.in + x / PX, v = pk[Math.min(pk.length - 1, Math.floor(st / pdur * pk.length))] || 0, hh = Math.max(1, v * hgt * .9 * Math.min(1.4, a.vol)); g.fillRect(x, (hgt - hh) / 2, 1, hh); }
    }
  });
}
function movePh(){ const ph = $('ph'), hh = $('phh'); if (!ph) return; ph.style.left = xOf(T) + 'px'; hh.style.left = xOf(T) + 'px'; }
$('tsc').addEventListener('scroll', () => { $('lbls').style.transform = `translateY(${-$('tsc').scrollTop}px)`; });
$('tsc').addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); const z = $('zoom'); z.value = clampv(+z.value * (e.deltaY < 0 ? 1.12 : .89), 20, 400); z.oninput(); }, {passive: false});
$('zoom').oninput = () => { const sc = $('tsc'), mid = tOf(sc.scrollLeft + sc.clientWidth / 2); PX = +$('zoom').value; drawTL(); sc.scrollLeft = xOf(mid) - sc.clientWidth / 2; };
window.addEventListener('resize', () => { if (P) drawTL(); });
window.addEventListener('view', e => { if (e.detail === 'edit' && P) setTimeout(drawTL, 30); });

/* snapping */
function snapPts(exceptId){
  const pts = [0, T, dur()];
  for (const c of post().timeline()) pts.push(c.s, c.e);
  for (const o of cut().ov) if (o.id !== exceptId) pts.push(o.start, o.start + o.dur);
  for (const a of cut().au) if (a.id !== exceptId) pts.push(a.start, a.start + a.dur);
  return pts;
}
function snapT(t, pts){ if (!SNAP) return [t, null]; let best = null, bd = 9 / PX; for (const p of pts) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } } return best == null ? [t, null] : [best, best]; }
function showSnap(t){ const s = $('snapl'); if (!s) return; if (t == null) { s.style.display = 'none'; return; } s.style.display = 'block'; s.style.left = xOf(t) + 'px'; }
$('bSnap').onclick = () => { SNAP = !SNAP; $('bSnap').classList.toggle('on', SNAP); };

/* pointer interactions */
$('tin').addEventListener('pointerdown', e => {
  if (!P) return;
  const r = $('tin').getBoundingClientRect(), t0 = tOf(e.clientX - r.left);
  if (e.target.id === 'phh' || e.target.closest('#ru')) return scrub(e);
  const el = e.target.closest('.clip,.wd,.fxm');
  if (!el) { SEL = null; drawTL(); showInsp(); return scrub(e); }
  e.preventDefault(); el.setPointerCapture(e.pointerId);
  const k = el.dataset.k, id = el.dataset.id, idx = +el.dataset.i, handle = e.target.classList.contains('h') ? (e.target.classList.contains('l') ? 'l' : 'r') : null;
  SEL = k === 'w' || k === 'fx' ? {k, i: idx} : {k, id};
  const x0 = e.clientX; let moved = false, snapped = false;
  const before = state();
  const pts = snapPts(id);
  let item = null, orig = null;
  if (k === 'main') { item = cut().main.find(c => c.id === id); }
  else if (k === 'ov') item = cut().ov.find(c => c.id === id);
  else if (k === 'au') item = cut().au.find(c => c.id === id);
  orig = item ? clone(item) : null;
  const tlc = post().timeline(), mi = k === 'main' ? cut().main.findIndex(c => c.id === id) : -1, mInfo = mi >= 0 ? tlc[mi] : null;
  const srcLen = item && k === 'main' ? (item.src === 'base' ? post().baseDur : (P.media[item.src.slice(2)] || {}).dur || 3) : 0;
  const isImg = k === 'main' && item.src !== 'base' && (P.media[item.src.slice(2)] || {}).kind === 'image';
  const mv = ev => {
    const dx = ev.clientX - x0; if (!moved && Math.abs(dx) < 4) return; moved = true;
    if (!snapped) { UNDO.push(before); REDO = []; snapped = true; updUndo(); }
    const dt = dx / PX;
    if (k === 'main') {
      const sp = item.speed || 1;
      if (handle === 'l') { if (isImg) { item.out = r3(clampv(orig.out - dt, .2, 60)); } else item.in = r3(clampv(orig.in + dt * sp, 0, orig.out - .1)); }
      else if (handle === 'r') { item.out = r3(clampv(orig.out + dt * sp, item.in + .1, isImg ? 60 : srcLen)); }
      else { // reorder: move over neighbours
        const cx = mInfo.s + (mInfo.e - mInfo.s) / 2 + dt; const list = cut().main, cur = list.findIndex(c => c.id === id);
        const tl2 = post().timeline(); let to = tl2.findIndex(c => cx < c.s + (c.e - c.s) / 2); if (to < 0) to = list.length - 1;
        if (to !== cur && to >= 0) { const [c] = list.splice(cur, 1); list.splice(to, 0, c); post().setData(clone(P.cut)); drawTL(); }
        return;
      }
      post().setData(clone(P.cut)); drawTL(); render(); return;
    }
    if (k === 'ov' || k === 'au') {
      const mlen = k === 'au' ? (item.mid.startsWith('lib:') ? orig.in + orig.dur : (P.media[item.mid] || {}).dur || 999) : (item.type === 'media' && (P.media[item.mid] || {}).kind === 'video' ? (P.media[item.mid] || {}).dur : 999);
      if (handle === 'l') { let [ns, sn] = snapT(orig.start + dt, pts); ns = clampv(ns, Math.max(0, orig.start - (orig.in || 0)), orig.start + orig.dur - .1); item.start = r3(ns); item.dur = r3(orig.dur - (ns - orig.start)); if (item.in != null) item.in = r3((orig.in || 0) + (ns - orig.start)); showSnap(sn); }
      else if (handle === 'r') { let [ne, sn] = snapT(orig.start + orig.dur + dt, pts); ne = clampv(ne, orig.start + .1, orig.start + mlen - (orig.in || 0)); item.dur = r3(ne - orig.start); showSnap(sn); }
      else { let [ns, sn] = snapT(orig.start + dt, pts); if (sn == null) { const [ne, sn2] = snapT(orig.start + orig.dur + dt, pts); if (sn2 != null) { ns = ne - orig.dur; sn = sn2; } } item.start = r3(Math.max(0, ns)); showSnap(sn); }
      post().setData(clone(P.cut)); drawTL(); render(); return;
    }
    if (k === 'w' || k === 'fx') {
      const arr = k === 'w' ? P.ed.words : P.ed.sfx, ot0 = mainSrcToOut(arr[idx][1]);
      const tt = clampv(ot0 + dt, 0, dur() - .02), c = post().clipAt(tt); if (c.src !== 'base') return;
      let st = c.srcT; if (k === 'w') { const lo = idx ? arr[idx - 1][1] + .03 : 0, hi = idx + 1 < arr.length ? arr[idx + 1][1] - .03 : post().baseDur; st = clampv(st, lo, hi); }
      arr[idx][1] = r3(st); el.style.left = xOf(mainSrcToOut(arr[idx][1])) + 'px'; T = mainSrcToOut(arr[idx][1]); render();
    }
  };
  const up = () => {
    el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); showSnap(null);
    if (moved) { if (k === 'w' || k === 'fx') { pvWin.__setEdit(clone(P.ed)); } changed({audio: k !== 'ov'}); }
    else { if (k === 'w' || k === 'fx') { const arr = k === 'w' ? P.ed.words : P.ed.sfx; const ot = mainSrcToOut(arr[idx][1]); if (ot != null) T = ot; } else if (item && !(k === 'main')) { if (T < item.start || T > item.start + item.dur) T = item.start + .01; } else if (k === 'main' && mInfo && (T < mInfo.s || T >= mInfo.e)) T = mInfo.s + .01; drawTL(); showInsp(); render(); }
    if (post()) post().sel = SEL && SEL.k === 'ov' ? SEL.id : null;
  };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
});
function scrub(e){
  const tin = $('tin'), r0 = () => tin.getBoundingClientRect();
  const set = ev => { let t = tOf(ev.clientX - r0().left); seek(t); };
  set(e); if (playing) { stop(); }
  const mv = ev => set(ev), up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}

/* ============ tools ============ */
function selItem(){ if (!SEL) return null; if (SEL.k === 'main') return cut().main.find(c => c.id === SEL.id); if (SEL.k === 'ov') return cut().ov.find(c => c.id === SEL.id); if (SEL.k === 'au') return cut().au.find(c => c.id === SEL.id); return null; }
function split(){
  if (!P) return;
  const it = selItem();
  if (it && (SEL.k === 'ov' || SEL.k === 'au') && T > it.start + .05 && T < it.start + it.dur - .05) {
    snapUndo(); const b = clone(it); b.id = uid(SEL.k === 'ov' ? 'o' : 'a'); const cutAt = T - it.start; b.start = r3(T); b.dur = r3(it.dur - cutAt); if (b.in != null) b.in = r3((it.in || 0) + cutAt); it.dur = r3(cutAt);
    (SEL.k === 'ov' ? cut().ov : cut().au).push(b); SEL = {k: SEL.k, id: b.id}; changed(); return;
  }
  const tl = post().timeline(); const i = tl.findIndex(c => T > c.s + .03 && T < c.e - .03); if (i < 0) return toast('حط المؤشر جوه كليب علشان تقصه.', true);
  snapUndo(); const ni = splitMainAt(T); SEL = {k: 'main', id: cut().main[ni].id}; changed(); toast('اتقص ✓');
}
function del(){
  if (!P || !SEL) return toast('اختار حاجة من التايملاين الأول.', true);
  snapUndo();
  if (SEL.k === 'main') { if (cut().main.length <= 1 && !P.blank) { UNDO.pop(); return toast('لازم يفضل كليب واحد على الأقل.', true); } cut().main = cut().main.filter(c => c.id !== SEL.id); }
  else if (SEL.k === 'ov') cut().ov = cut().ov.filter(c => c.id !== SEL.id);
  else if (SEL.k === 'au') cut().au = cut().au.filter(c => c.id !== SEL.id);
  else if (SEL.k === 'fx') { P.ed.sfx.splice(SEL.i, 1); pvWin.__setEdit(clone(P.ed)); }
  else if (SEL.k === 'w') { P.ed.words[SEL.i][0] = ''; pvWin.__setEdit(clone(P.ed)); toast('الكلمة اتخفت من الكابشن'); }
  SEL = null; changed();
}
function dup(){
  const it = selItem(); if (!it) return toast('اختار كليب أو طبقة علشان تكررها.', true);
  snapUndo(); const b = clone(it); b.id = uid('d');
  if (SEL.k === 'main') { const i = cut().main.indexOf(it); cut().main.splice(i + 1, 0, b); }
  else { b.start = r3(it.start + it.dur); (SEL.k === 'ov' ? cut().ov : cut().au).push(b); }
  SEL = {k: SEL.k, id: b.id}; changed();
}
function trimSide(side){
  const tl = post().timeline(); const i = tl.findIndex(c => T > c.s + .02 && T < c.e - .02); if (i < 0) return toast('حط المؤشر جوه كليب.', true);
  snapUndo(); const c = cut().main[i], x = tl[i], st = r3(x.in + (T - x.s) * x.sp);
  if (side === 'l') { c.in = st; T = x.s; } else c.out = st;
  SEL = {k: 'main', id: c.id}; changed(); toast(side === 'l' ? 'اتشال اللي قبل المؤشر ✓' : 'اتشال اللي بعد المؤشر ✓');
}
function mute(){
  const it = selItem(); if (!it || (SEL.k !== 'main' && SEL.k !== 'au' && !(SEL.k === 'ov' && it.type === 'media'))) return toast('اختار كليب علشان تكتمه.', true);
  snapUndo(); it.vol = it.vol === 0 ? (it._v || 1) : (it._v = it.vol == null ? 1 : it.vol, 0); changed();
}
$('bSplit').onclick = split; $('bDel').onclick = del; $('bDup').onclick = dup;
$('bTrimL').onclick = () => trimSide('l'); $('bTrimR').onclick = () => trimSide('r');
$('bFreeze').textContent = '🔇 كتم'; $('bFreeze').title = 'كتم/فك كتم الكليب المختار'; $('bFreeze').onclick = mute;
document.addEventListener('keydown', e => {
  if (!P || !document.querySelector('.view.edit.on') || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (e.code === 'Space') { e.preventDefault(); $('tPlay').click(); }
  else if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); $('undo').click(); }
  else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); $('redo').click(); }
  else if (mod && k === 'd') { e.preventDefault(); dup(); }
  else if (mod && k === 's') { e.preventDefault(); $('saveHtml').click(); }
  else if (k === 's' && !mod) split();
  else if (k === 'q') trimSide('l'); else if (k === 'w') trimSide('r');
  else if (k === 'm') mute();
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(T - (e.shiftKey ? 1 : 1 / 30)); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); seek(T + (e.shiftKey ? 1 : 1 / 30)); }
  else if (e.key === 'Home') seek(0); else if (e.key === 'End') seek(dur());
});

/* ============ side panels ============ */
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.pane').forEach(x => x.classList.toggle('on', x.dataset.p === b.dataset.t));
  if (b.dataset.t === 'adjust') drawAdjust(); if (b.dataset.t === 'filters') drawFilters(); if (b.dataset.t === 'tr') drawTrs();
});
const gradeTarget = () => { const it = SEL && SEL.k === 'main' ? selItem() : null; return it ? {o: it, lbl: 'الكليب المختار بس'} : {o: cut(), lbl: 'الفيديو كله (اختار كليب علشان تضبطه لوحده)'}; };
function slider(lbl, val, min, max, step, on, fmtv){
  const d = document.createElement('div'); d.className = 'sl';
  d.innerHTML = `<span>${lbl}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><b>${fmtv ? fmtv(val) : val}</b>`;
  const inp = d.querySelector('input'); let first = true;
  inp.oninput = () => { if (first) { snapUndo(); first = false; } d.querySelector('b').textContent = fmtv ? fmtv(+inp.value) : inp.value; on(+inp.value, false); };
  inp.onchange = () => { first = true; on(+inp.value, true); };
  inp.ondblclick = () => { snapUndo(); const v = min < 0 ? 0 : (lbl.includes('صوت') || lbl.includes('سرعة') ? 1 : 0); inp.value = v; d.querySelector('b').textContent = fmtv ? fmtv(v) : v; on(v, true); };
  return d;
}
const pct = v => Math.round(v * 100) + '';
function drawAdjust(){
  if (!P) return; const {o, lbl} = gradeTarget(); $('aHint').textContent = 'بيتطبق على: ' + lbl;
  const box = $('adjBox'); box.innerHTML = ''; o.grade = o.grade || {};
  for (const [k, n, mn, mx] of ADJ) box.appendChild(slider(n, o.grade[k] || 0, mn, mx, .01, (v, end) => { o.grade[k] = v; changed({audio: false, insp: false}); }, pct));
}
$('adjReset').onclick = () => { if (!P) return; snapUndo(); const {o} = gradeTarget(); o.grade = {}; o.filter = o === cut() ? 'none' : undefined; changed({audio: false}); drawAdjust(); drawFilters(); };
function drawFilters(){
  if (!P) return; const {o, lbl} = gradeTarget(); $('fHint').textContent = 'بيتطبق على: ' + lbl;
  const g = $('fGrid'); g.innerHTML = '';
  for (const [k, n] of FILTERS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'fi' + ((o.filter || 'none') === k ? ' on' : '');
    b.innerHTML = `<div class="sw" style="filter:${FCSS[k]}"></div>${n}`; b.onclick = () => { snapUndo(); o.filter = k; changed({audio: false}); drawFilters(); }; g.appendChild(b); }
}
function drawTrs(){
  const it = SEL && SEL.k === 'main' ? selItem() : null, g = $('trGrid'); g.innerHTML = '';
  for (const [k, n] of TRS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tri' + (it && (it.tr || 'none') === k ? ' on' : '');
    b.textContent = n; b.onclick = () => { if (!it) return toast('اختار كليب من التايملاين الأول.', true); const i = cut().main.indexOf(it); if (i === 0 && k !== 'none') toast('الانتقال بيبان في أول الكليب، والكليب ده أول الفيديو.'); snapUndo(); it.tr = k; it.trd = it.trd || .4; changed({audio: false}); drawTrs(); }; g.appendChild(b); }
}

/* ============ inspector ============ */
function sec(title){ const s = document.createElement('div'); s.className = 'sec'; if (title) s.innerHTML = `<b>${title}</b>`; return s; }
function btns(list){ const r = document.createElement('div'); r.className = 'irow'; for (const [t, fn, cls] of list) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ib ' + (cls || ''); b.textContent = t; b.onclick = fn; r.appendChild(b); } return r; }
function segBtns(opts, cur, on){ const r = document.createElement('div'); r.className = 'seg'; for (const [v, n] of opts) { const b = document.createElement('button'); b.type = 'button'; b.textContent = n; if (String(v) === String(cur)) b.className = 'on'; b.onclick = () => { snapUndo(); on(v); }; r.appendChild(b); } return r; }
function colorRow(cur, list, on){ const r = document.createElement('div'); r.className = 'cols'; for (const c of list) { const b = document.createElement('button'); b.type = 'button'; b.style.background = c === 'none' ? 'repeating-linear-gradient(45deg,#444 0 4px,#222 4px 8px)' : c; if ((cur || 'none') === c) b.className = 'on'; b.onclick = () => { snapUndo(); on(c === 'none' ? '' : c); }; r.appendChild(b); }
  const ci = document.createElement('input'); ci.type = 'color'; ci.value = /^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#ffffff'; let f = true; ci.oninput = () => { if (f) { snapUndo(); f = false; } on(ci.value, true); }; r.appendChild(ci); return r; }
function kv(k, v){ const d = document.createElement('div'); d.className = 'kv'; d.innerHTML = `<span>${k}</span><b>${v}</b>`; return d; }
let inspXY = null;
function updateInspXY(o){ if (inspXY) inspXY(o); }
function showInsp(){
  const box = $('insp'); box.innerHTML = ''; inspXY = null; if (!P || !post()) return;
  const it = selItem();
  if (post()) post().sel = SEL && SEL.k === 'ov' ? SEL.id : null;
  if (!SEL || (!it && SEL.k !== 'w' && SEL.k !== 'fx')) {
    box.innerHTML = `<h3>المشروع <span class="chip">${fmt(dur())}</span></h3><p class="hint">اختار أي حاجة في التايملاين علشان تعدّلها. اسحب النصوص في الشاشة لمكانها.</p>`;
    const M = cut().mix = Object.assign({voice: 1, sfx: 1, music: .5, master: 1, duck: .6}, cut().mix || {});
    const s = sec('الصوت');
    s.appendChild(slider('صوت الكلام', M.voice, 0, 2, .01, v => { M.voice = v; changed({insp: false}); }, pct));
    s.appendChild(slider('المؤثرات', M.sfx, 0, 2, .01, v => { M.sfx = v; changed({insp: false}); }, pct));
    s.appendChild(slider('الموسيقى', M.music, 0, 1.5, .01, v => { M.music = v; changed({insp: false}); }, pct));
    s.appendChild(slider('خفض وقت الكلام', M.duck, 0, .95, .01, v => { M.duck = v; changed({insp: false}); }, pct));
    s.appendChild(slider('الصوت العام', M.master, 0, 1.5, .01, v => { M.master = v; changed({insp: false}); }, pct));
    box.appendChild(s);
    const g = sec('الشكل'); g.appendChild(btns([['✦ فلاتر', () => document.querySelector('.tab[data-t="filters"]').click()], ['☀ ألوان وإضاءة', () => document.querySelector('.tab[data-t="adjust"]').click()]])); box.appendChild(g);
    if (P.colBox) box.appendChild(P.colBox);
    return;
  }
  if (SEL.k === 'main') {
    const i = cut().main.indexOf(it), isB = it.src === 'base', m = isB ? null : P.media[it.src.slice(2)] || {}, x = post().timeline()[i];
    box.innerHTML = `<h3>${isB ? 'الفيديو الأساسي' : 'كليب'} <span class="chip">${(x.e - x.s).toFixed(2)}s</span></h3>`;
    box.appendChild(kv('من المصدر', `${it.in.toFixed(2)} → ${it.out.toFixed(2)}`));
    const s1 = sec('السرعة'); s1.appendChild(segBtns([[.5, '0.5x'], [.75, '0.75x'], [1, '1x'], [1.25, '1.25x'], [1.5, '1.5x'], [2, '2x']], it.speed || 1, v => { it.speed = v; changed(); }));
    s1.appendChild(slider('سرعة مخصصة', it.speed || 1, .25, 4, .05, v => { it.speed = v; changed({insp: false}); }, v => v.toFixed(2) + 'x')); box.appendChild(s1);
    if (isB || (m && m.kind === 'video')) { const s2 = sec('الصوت'); s2.appendChild(slider('مستوى الصوت', it.vol == null ? 1 : it.vol, 0, 2, .01, v => { it.vol = v; changed({insp: false}); }, pct)); box.appendChild(s2); }
    if (!isB) { const s3 = sec('الكادر');
      s3.appendChild(segBtns([['cover', 'ملء الشاشة'], ['contain', 'كامل بحواف']], it.fit || 'cover', v => { it.fit = v; changed({audio: false}); }));
      s3.appendChild(slider('زووم', it.zoom || 1, 1, 3, .01, v => { it.zoom = v; changed({audio: false, insp: false}); }, v => v.toFixed(2) + 'x'));
      s3.appendChild(slider('يمين/شمال', it.px || 0, -50, 50, .5, v => { it.px = v; changed({audio: false, insp: false}); }));
      s3.appendChild(slider('فوق/تحت', it.py || 0, -50, 50, .5, v => { it.py = v; changed({audio: false, insp: false}); }));
      s3.appendChild(segBtns([[true, 'حركة زووم بطيئة'], [false, 'ثابت']], !!it.kb, v => { it.kb = v; changed({audio: false}); }));
      if (m.kind === 'image') s3.appendChild(slider('المدة', it.out - it.in, .3, 20, .1, v => { it.out = r3(it.in + v); changed({insp: false}); }, v => v.toFixed(1) + 's'));
      box.appendChild(s3); }
    const s4 = sec('الانتقال في أوله'); s4.appendChild(segBtns(TRS, it.tr || 'none', v => { it.tr = v; it.trd = it.trd || .4; changed({audio: false}); }));
    if (it.tr && it.tr !== 'none') s4.appendChild(slider('مدة الانتقال', it.trd || .4, .15, 1.2, .05, v => { it.trd = v; changed({audio: false, insp: false}); }, v => v.toFixed(2) + 's'));
    box.appendChild(s4);
    const s5 = sec('الألوان'); s5.appendChild(btns([['✦ فلتر للكليب ده', () => document.querySelector('.tab[data-t="filters"]').click()], ['☀ ضبط ألوانه', () => document.querySelector('.tab[data-t="adjust"]').click()]])); box.appendChild(s5);
    box.appendChild(btns([['✂ قص', split], ['⧉ تكرار', dup], ['◀ لورا', () => move(-1)], ['▶ لقدام', () => move(1)], ['🗑 مسح', del, 'red']]));
    return;
  }
  if (SEL.k === 'ov') {
    const o = it, isT = o.type === 'text', s = o.style = o.style || {};
    box.innerHTML = `<h3>${isT ? 'نص' : 'طبقة صورة/فيديو'} <span class="chip">${o.dur.toFixed(2)}s</span></h3>`;
    if (isT) {
      const ta = document.createElement('textarea'); ta.value = o.text || ''; let f = true; ta.oninput = () => { if (f) { snapUndo(); f = false; } o.text = ta.value; changed({audio: false, insp: false}); }; box.appendChild(ta);
      const s1 = sec('الشكل');
      s1.appendChild(slider('الحجم', s.size || 7, 2, 24, .1, v => { s.size = v; changed({audio: false, insp: false}); }, v => v.toFixed(1)));
      s1.appendChild(document.createTextNode('')); const c1 = document.createElement('div'); c1.className = 'hint'; c1.textContent = 'لون الكلام'; s1.appendChild(c1);
      s1.appendChild(colorRow(s.color, ['#ffffff', '#F5C518', '#E5262B', '#111111', '#22d3ee', '#2fd27a'], v => { s.color = v || '#fff'; changed({audio: false}); }));
      const c2 = document.createElement('div'); c2.className = 'hint'; c2.textContent = 'الخلفية'; s1.appendChild(c2);
      s1.appendChild(colorRow(s.bg, ['none', '#E5262B', '#F5C518', '#ffffff', 'rgba(0,0,0,.78)', '#111111'], v => { s.bg = v; changed({audio: false}); }));
      const c3 = document.createElement('div'); c3.className = 'hint'; c3.textContent = 'الحدود'; s1.appendChild(c3);
      s1.appendChild(colorRow(s.stroke, ['none', '#000000', '#ffffff', '#E5262B', '#F5C518'], v => { s.stroke = v; changed({audio: false}); }));
      if (s.stroke) s1.appendChild(slider('سُمك الحدود', s.strokeW || .9, .2, 3, .05, v => { s.strokeW = v; changed({audio: false, insp: false}); }, v => v.toFixed(2)));
      s1.appendChild(segBtns([[900, 'تقيل'], [700, 'عريض'], [500, 'عادي']], s.weight || 900, v => { s.weight = v; changed({audio: false}); }));
      box.appendChild(s1);
    } else {
      const m = P.media[o.mid] || {};
      const s1 = sec('الحجم'); s1.appendChild(slider('العرض', o.w || 60, 10, 120, .5, v => { o.w = v; changed({audio: false, insp: false}); }, v => v.toFixed(0) + '%')); box.appendChild(s1);
      if (m.kind === 'video') { const s2 = sec('الصوت'); s2.appendChild(slider('صوت الطبقة', o.vol || 0, 0, 2, .01, v => { o.vol = v; changed({insp: false}); }, pct)); box.appendChild(s2); }
    }
    const s2 = sec('المكان');
    const sx = slider('أفقي', o.x != null ? o.x : 50, -10, 110, .1, v => { o.x = v; changed({audio: false, insp: false}); }, v => v.toFixed(0));
    const sy = slider('رأسي', o.y != null ? o.y : 50, -10, 110, .1, v => { o.y = v; changed({audio: false, insp: false}); }, v => v.toFixed(0));
    s2.appendChild(sx); s2.appendChild(sy);
    inspXY = q => { sx.querySelector('input').value = q.x; sx.querySelector('b').textContent = q.x.toFixed(0); sy.querySelector('input').value = q.y; sy.querySelector('b').textContent = q.y.toFixed(0); };
    s2.appendChild(slider('تكبير', o.sc || 1, .2, 3, .01, v => { o.sc = v; changed({audio: false, insp: false}); }, v => v.toFixed(2) + 'x'));
    s2.appendChild(slider('دوران', o.rot || 0, -45, 45, .5, v => { o.rot = v; changed({audio: false, insp: false}); }, v => v.toFixed(0) + '°'));
    s2.appendChild(slider('الشفافية', o.op != null ? o.op : 1, 0, 1, .01, v => { o.op = v; changed({audio: false, insp: false}); }, pct));
    s2.appendChild(btns([['⊙ في النص', () => { snapUndo(); o.x = 50; o.y = 50; changed({audio: false}); }], ['⬆ فوق', () => { snapUndo(); o.y = 18; changed({audio: false}); }], ['⬇ تحت', () => { snapUndo(); o.y = 80; changed({audio: false}); }]]));
    box.appendChild(s2);
    const s3 = sec('الحركة'); s3.appendChild(segBtns([['pop', 'بوب'], ['fade', 'ظهور'], ['up', 'لفوق'], ['down', 'لتحت'], ['right', 'من اليمين'], ['left', 'من الشمال'], ['zoom', 'زووم'], ['swing', 'تأرجح'], ['type', 'كتابة'], ['none', 'بدون']], o.anim || 'pop', v => { o.anim = v; changed({audio: false}); }));
    s3.appendChild(segBtns([['', 'ثابت'], ['pulse', 'نبض'], ['float', 'طفو']], o.loop || '', v => { o.loop = v; changed({audio: false}); }));
    s3.appendChild(slider('مدة الدخول', o.ain != null ? o.ain : .35, 0, 1.5, .05, v => { o.ain = v; changed({audio: false, insp: false}); }, v => v.toFixed(2) + 's'));
    s3.appendChild(slider('مدة الخروج', o.aout != null ? o.aout : .25, 0, 1.5, .05, v => { o.aout = v; changed({audio: false, insp: false}); }, v => v.toFixed(2) + 's'));
    box.appendChild(s3);
    box.appendChild(kv('من → لحد', `${o.start.toFixed(2)} → ${(o.start + o.dur).toFixed(2)}`));
    box.appendChild(btns([['✂ قص', split], ['⧉ تكرار', dup], ['🗑 مسح', del, 'red']]));
    return;
  }
  if (SEL.k === 'au') {
    const a = it, lib = a.mid.startsWith('lib:') || a.sfx;
    box.innerHTML = `<h3>${lib ? 'مؤثر صوتي' : 'صوت / موسيقى'} <span class="chip">${a.dur.toFixed(2)}s</span></h3>`;
    const s1 = sec('المستوى'); s1.appendChild(slider('الصوت', a.vol, 0, 2, .01, v => { a.vol = v; changed({insp: false}); }, pct));
    s1.appendChild(slider('ظهور تدريجي', a.fin || 0, 0, 5, .05, v => { a.fin = v; changed({insp: false}); }, v => v.toFixed(2) + 's'));
    s1.appendChild(slider('اختفاء تدريجي', a.fout || 0, 0, 5, .05, v => { a.fout = v; changed({insp: false}); }, v => v.toFixed(2) + 's'));
    s1.appendChild(segBtns([[true, 'يوطى وقت الكلام'], [false, 'ثابت']], a.duck !== false, v => { a.duck = v; changed(); }));
    box.appendChild(s1);
    box.appendChild(kv('من → لحد', `${a.start.toFixed(2)} → ${(a.start + a.dur).toFixed(2)}`));
    box.appendChild(btns([['✂ قص', split], ['⧉ تكرار', dup], ['🔇 كتم', mute], ['🗑 مسح', del, 'red']]));
    return;
  }
  if (SEL.k === 'w') {
    const w = P.ed.words[SEL.i];
    box.innerHTML = '<h3>كلمة في الكابشن</h3>';
    const ip = document.createElement('input'); ip.type = 'text'; ip.value = w[0]; ip.style.cssText = 'width:100%;font:800 18px Tajawal;direction:rtl'; let f = true;
    ip.oninput = () => { if (f) { snapUndo(); f = false; } w[0] = ip.value; pvWin.__setEdit(clone(P.ed)); drawTL(); render(); }; box.appendChild(ip);
    const s1 = sec('اللون'); const r = document.createElement('div'); r.className = 'keys4';
    KEYS.forEach(([n, k, c]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.style.background = c; b.style.color = k === 1 ? '#111' : '#fff'; if ((w[2] || 0) === k) b.className = 'on'; b.onclick = () => { snapUndo(); w[2] = k; pvWin.__setEdit(clone(P.ed)); drawTL(); showInsp(); render(); }; r.appendChild(b); });
    s1.appendChild(r); box.appendChild(s1);
    box.appendChild(btns([['−0.05', () => nudgeW(-.05)], ['+0.05', () => nudgeW(.05)], ['▶ اسمع', () => { seek(Math.max(0, (mainSrcToOut(w[1]) || 0) - .5)); play(); }]]));
    return;
  }
  if (SEL.k === 'fx') {
    const f = P.ed.sfx[SEL.i]; if (!f) return;
    box.innerHTML = '<h3>مؤثر صوتي (من الملف)</h3>';
    const sel = document.createElement('select'); let names = []; try { names = pvWin.SFX_NAMES(); } catch (e) { names = Object.keys(SFX_AR); }
    sel.innerHTML = names.map(n => `<option value="${n}"${n === f[0] ? ' selected' : ''}>${SFX_AR[n] || n}</option>`).join(''); sel.onchange = () => { snapUndo(); f[0] = sel.value; pvWin.__setEdit(clone(P.ed)); changed(); };
    box.appendChild(sel);
    const s1 = sec(''); s1.appendChild(slider('الصوت', Math.round(f[2] / .6 * 100), 5, 100, 1, v => { f[2] = r3(v / 100 * .6); pvWin.__setEdit(clone(P.ed)); changed({insp: false}); }, v => v + '%')); box.appendChild(s1);
    box.appendChild(btns([['−0.05', () => nudgeW(-.05)], ['+0.05', () => nudgeW(.05)], ['🗑 مسح', del, 'red']]));
  }
}
function nudgeW(d){ const arr = SEL.k === 'w' ? P.ed.words : P.ed.sfx, i = SEL.i; snapUndo(); let t = arr[i][1] + d; if (SEL.k === 'w') { const lo = i ? arr[i - 1][1] + .03 : 0, hi = i + 1 < arr.length ? arr[i + 1][1] - .03 : post().baseDur; t = clampv(t, lo, hi); } arr[i][1] = r3(Math.max(0, t)); pvWin.__setEdit(clone(P.ed)); changed(); }
function move(d){ const i = cut().main.findIndex(c => c.id === SEL.id), j = i + d; if (j < 0 || j >= cut().main.length) return; snapUndo(); const L = cut().main; [L[i], L[j]] = [L[j], L[i]]; changed(); }

/* ============ page palette ============ */
function buildColors(){
  let PAL = []; try { PAL = pvWin.eval('typeof PALETTE !== "undefined" ? PALETTE : []'); } catch (e) {}
  if (!PAL.length) { P.colBox = null; return; }
  const s = sec('ألوان الاستايل');
  PAL.forEach(p => {
    const cur = (P.colors[p.v] || pvWin.getComputedStyle(pvWin.document.getElementById('reel')).getPropertyValue(p.v).trim() || p.opts[0]).toUpperCase();
    const lb = document.createElement('div'); lb.className = 'hint'; lb.textContent = p.label; s.appendChild(lb);
    s.appendChild(colorRow(cur, p.opts, c => { if (!c) return; P.colors[p.v] = c.toUpperCase(); try { pvWin.applyCol ? pvWin.applyCol(p.v, c) : pvWin.document.getElementById('reel').style.setProperty(p.v, c); } catch (e) {} render(); }));
  });
  P.colBox = s;
}

/* ============ save / export ============ */
async function blobB64(b){ const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
async function bake(){
  if (!POSTJS) POSTJS = await (await fetch('post.js?v=' + Date.now())).text();
  const used = new Set(); for (const c of cut().main) if (c.src.startsWith('m:')) used.add(c.src.slice(2)); for (const o of cut().ov) if (o.mid) used.add(o.mid); for (const a of cut().au) if (!a.mid.startsWith('lib:')) used.add(a.mid);
  const cd = clone(P.cut); cd.media = {}; for (const id of used) cd.media[id] = P.cut.media[id];
  let h = P.html;
  if (P.ed) h = h.replace(EDRE, (x, a, b, c) => a + JSON.stringify(P.ed).replace(/</g, '\\u003c') + c);
  const cols = Object.entries(P.colors);
  if (cols.length) { const css = '<style id="baked">:root,#reel{' + cols.map(([k, v]) => `${k}:${v}`).join(';') + '}</style>'; h = /<style id="baked">[\s\S]*?<\/style>/.test(h) ? h.replace(/<style id="baked">[\s\S]*?<\/style>/, css) : h.replace('</head>', css + '</head>'); }
  let inj = '<script type="application/json" id="cut-data">' + JSON.stringify(cd).replace(/</g, '\\u003c') + '</script>\n';
  for (const id of used) { const m = P.media[id]; if (!m) continue; inj += `<script type="text/plain" class="post-media" data-id="${id}" data-mime="${m.blob.type || m.mime || 'application/octet-stream'}">${await blobB64(m.blob)}</script>\n`; }
  inj += '<script id="post-rt">' + POSTJS + '</script>\n';
  if (P.blank) h = h.replace('const DUR = 0.1;', 'const DUR = ' + dur().toFixed(3) + ';');
  return h.replace(/<\/body>(?![\s\S]*<\/body>)/i, inj + '</body>');
}
const showExp = (t, s) => { $('exp').hidden = false; $('expT').textContent = t; $('expS').textContent = s || ''; };
$('saveHtml').onclick = async () => {
  if (!P) return; stop(); showExp('بيجهّز الملف…');
  try { const h = await bake(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([h], {type: 'text/html'})); a.download = slugName() + '.html'; document.body.appendChild(a); a.click(); a.remove(); toast('✓ الملف نزل على جهازك'); $('savedLbl').textContent = 'اتحفظ ✓'; }
  catch (e) { toast('ما اتحفظش: ' + e.message, true); }
  $('exp').hidden = true;
};
const slugName = () => (($('pName').value || P.name).trim().replace(/\s+/g, '_') || 'video');
$('exportBtn').onclick = async () => {
  if (!P) return; stop();
  if (!TOKEN) { toast('اعمل الاتصال بجيتهاب من الإعدادات الأول.', true); go('set'); return; }
  showExp('بيجهّز الفيديو للتصدير…', 'القص والصوت والألوان والطبقات كلها بتتحفظ جوه الملف');
  try {
    const h = await bake(); $('expT').textContent = `بيرفع للريندر (${(h.length / 1048576).toFixed(1)} MB)…`;
    const ok = await upload([new File([h], slugName() + '_edit.html', {type: 'text/html'})]);
    $('exp').hidden = true; if (ok) { toast('✓ اتبعت للريندر — تابعه من «الريندر»'); go('queue'); }
  } catch (e) { $('exp').hidden = true; toast('التصدير ما تمّش: ' + e.message, true); }
};

/* ============ autosave (IndexedDB) ============ */
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('motion-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function autosave(){
  if (!P) return;
  try {
    const db = await idb(); const media = {}; for (const [id, m] of Object.entries(P.media)) media[id] = {blob: m.blob, kind: m.kind, name: m.name, mime: m.mime, dur: m.dur, w: m.w, h: m.h, thumb: m.thumb, sfx: m.sfx};
    const rec = {name: $('pName').value || P.name, html: P.html, ed: P.ed, cut: P.cut, colors: P.colors, media, at: Date.now()};
    await new Promise((res, rej) => { const tx = db.transaction('p', 'readwrite'); tx.objectStore('p').put(rec, 'last'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    $('savedLbl').textContent = 'محفوظ تلقائي ✓'; offerResume();
  } catch (e) { $('savedLbl').textContent = ''; }
}
async function loadLast(){ try { const db = await idb(); return await new Promise(res => { const r = db.transaction('p').objectStore('p').get('last'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); } catch (e) { return null; } }
async function offerResume(){
  const rec = await loadLast(); let b = $('resumeBtn');
  if (!rec) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('button'); b.id = 'resumeBtn'; b.type = 'button'; b.className = 'tile'; document.querySelector('.starts').appendChild(b); }
  b.innerHTML = `<div class="dz-ic">↺</div><b>كمّل آخر مشروع</b><span></span>`; b.querySelector('span').textContent = `${rec.name} · ${new Date(rec.at).toLocaleString('ar-EG')}`;
  b.onclick = async () => { const r = await loadLast(); if (!r) return; window.openProject(r.name, r.html, {cut: r.cut, ed: r.ed, colors: r.colors, media: r.media}); };
}
offerResume();
$('pName').onchange = () => { if (P) { P.name = $('pName').value; autosave(); } };
window.addEventListener('beforeunload', e => { if (P && UNDO.length && $('savedLbl').textContent === 'تعديلات مش محفوظة') { e.preventDefault(); e.returnValue = ''; } });
updUndo();
})();
