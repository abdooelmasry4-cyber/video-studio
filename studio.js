/* Motion Studio — shell: navigation, GitHub connection, upload → render, queue, library */
const LS = {get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }};
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const AUTO = (location.hostname.endsWith('.github.io') && location.pathname.split('/')[1]) ? location.hostname.split('.')[0] + '/' + location.pathname.split('/')[1] : 'abdooelmasry4-cyber/video-studio';
let TOKEN = LS.get('vs_token'), REPO = LS.get('vs_repo') || AUTO;
const api = async (path, opt = {}) => {
  const r = await fetch('https://api.github.com/repos/' + REPO + path, {...opt, headers: {Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + TOKEN, 'X-GitHub-Api-Version': '2022-11-28', ...(opt.headers || {})}});
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.message || r.status), {status: r.status});
  return j;
};
const msg = (id, t, cls = '') => { const el = $(id); if (!el) return; el.textContent = t; el.className = 'msg ' + cls; };
let toastT = null;
function toast(t, bad){ const el = $('toast'); el.textContent = t; el.className = 'toast on' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = setTimeout(() => el.className = 'toast', 2800); }

/* ---- navigation ---- */
function go(v){
  document.querySelectorAll('.view').forEach(x => x.classList.toggle('on', x.dataset.view === v));
  document.querySelectorAll('.nav').forEach(x => x.classList.toggle('on', x.dataset.v === v));
  if (v === 'queue' || v === 'lib') refresh();
  window.dispatchEvent(new CustomEvent('view', {detail: v}));
}
document.querySelectorAll('.nav').forEach(b => b.onclick = () => go(b.dataset.v));
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));

/* ---- connection ---- */
function showSetup(){ const ok = !!TOKEN; $('setupDone').hidden = !ok; $('setupForm').hidden = ok; $('repoLbl').textContent = REPO; }
$('saveTok').onclick = async () => {
  TOKEN = $('tok').value.trim(); REPO = $('repo').value.trim() || AUTO;
  if (!TOKEN) return msg('setupMsg', 'الزق المفتاح الأول.', 'bad');
  try { await api(''); LS.set('vs_token', TOKEN); LS.set('vs_repo', REPO); msg('setupMsg', 'تمام، اتوصل بالريبو ✓', 'ok'); showSetup(); refresh(); }
  catch (e) { TOKEN = null; msg('setupMsg', 'المفتاح أو اسم الريبو غلط: ' + e.message, 'bad'); }
};
$('logout').onclick = () => { LS.set('vs_token', null); TOKEN = null; showSetup(); };

/* ---- upload → render ---- */
const slug = s => (s.replace(/\.html?$/i, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'video');
const b64buf = async (f) => { const buf = new Uint8Array(await f.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(bin); };
async function upload(files, opts = {}){
  if (!TOKEN) { toast('اعمل الاتصال بجيتهاب من الإعدادات الأول.', true); go('set'); return false; }
  files = files.filter(f => /\.html?$/i.test(f.name)); if (!files.length) return false;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const aud = $('oAud').files[0], [w, h] = $('oSize').value.split('x').map(Number), dur = +$('oDur').value || 0;
  try {
    msg('upMsg', `بيرفع ${files.length} ملف…`);
    const ref = await api('/git/ref/heads/main'), base = await api('/git/commits/' + ref.object.sha);
    const tree = [], blob = async (p, content) => { const b = await api('/git/blobs', {method: 'POST', body: JSON.stringify({content, encoding: 'base64'})}); tree.push({path: p, mode: '100644', type: 'blob', sha: b.sha}); };
    for (const f of files) {
      const name = opts.exact ? slug(f.name) : `${slug(f.name)}_${stamp}`, html = await f.text();
      const ours = /id="reel"/.test(html) && /function\s+render\s*\(/.test(html);
      if (!ours) { const side = {w, h}; if (dur) side.dur = dur;
        if (aud) { const ext = (aud.name.split('.').pop() || 'mp3').toLowerCase(); side.audio = `${name}.${ext}`; await blob(`input/${side.audio}`, await b64buf(aud)); }
        await blob(`input/${name}.json`, btoa(JSON.stringify(side))); }
      await blob(`input/${name}.html`, await b64buf(f));
    }
    const t = await api('/git/trees', {method: 'POST', body: JSON.stringify({base_tree: base.tree.sha, tree})});
    const c = await api('/git/commits', {method: 'POST', body: JSON.stringify({message: 'Render ' + files.map(f => f.name).join(', '), tree: t.sha, parents: [ref.object.sha]})});
    await api('/git/refs/heads/main', {method: 'PATCH', body: JSON.stringify({sha: c.sha})});
    msg('upMsg', `✓ اترفع ${files.length} ملف للريندر.`, 'ok'); toast('اتبعت للريندر ✓');
    setTimeout(refresh, 5000); return true;
  } catch (e) { msg('upMsg', 'الرفع ما تمّش: ' + e.message, 'bad'); toast('الرفع ما تمّش: ' + e.message, true); return false; }
}
const drop = $('drop'), fi = $('file');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); routeFiles([...e.dataTransfer.files]); });
fi.addEventListener('change', () => { routeFiles([...fi.files]); fi.value = ''; });
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
async function routeFiles(files){
  const html = files.filter(f => /\.html?$/i.test(f.name));
  if (!html.length) return toast('افتح ملف HTML.', true);
  if (html.length === 1) {
    const s = await html[0].text();
    if (/id="reel"/.test(s) && /function\s+render\s*\(/.test(s)) { window.openProject(html[0].name, s); return; }
  }
  upload(html);
}

/* ---- queue + library ---- */
const fmtMin = s => s < 60 ? `${Math.round(s)} ث` : `${Math.floor(s / 60)} د ${Math.round(s % 60)} ث`;
let ISSUE = null, LAST = '', ASSETS = [];
async function refresh(){
  if (!TOKEN) return;
  const st = $('status'), jobs = $('jobs');
  try {
    const runs = await api('/actions/workflows/render.yml/runs?per_page=5');
    const active = (runs.workflow_runs || []).filter(r => r.status !== 'completed');
    const r = (runs.workflow_runs || [])[0];
    $('runDot').hidden = !active.length;
    if (active.length) st.innerHTML = `<div class="spin"></div><span class="pill run">بيترندر</span><span class="muted">${active.length > 1 ? active.length + ' طلبات في الطابور' : 'شغال دلوقتي'}</span>`;
    else if (!r) st.innerHTML = '<span class="pill idle">مستني</span><span class="muted">لسه مفيش ريندر.</span>';
    else if (r.conclusion === 'success') st.innerHTML = `<span class="pill ok">خلص ✓</span><span class="muted">آخر ريندر خلص ${new Date(r.updated_at).toLocaleString('ar-EG')}</span>`;
    else st.innerHTML = `<span class="pill bad">حصل خطأ</span><a href="${r.html_url}" target="_blank" rel="noopener">افتح التفاصيل على جيتهاب</a>`;
    const ids = new Set(active.map(x => x.id).concat(r ? [r.id] : []));
    if (!ISSUE) { const is = await api('/issues?state=open&per_page=30').catch(() => []); const f = (is || []).find(i => i.title === 'render-status'); ISSUE = f ? f.number : null; }
    if (ISSUE) {
      const cs = await api(`/issues/${ISSUE}/comments?per_page=100`).catch(() => []);
      const list = (cs || []).map(c => { try { return JSON.parse(c.body); } catch (e) { return null; } }).filter(j => j && ids.has(j.run));
      jobs.innerHTML = list.map(j => { const now = Date.now() / 1000, el = (j.end || now) - j.start, p = Math.max(0, Math.min(100, j.p || 0));
        const eta = p > 3 && !j.state ? ` · فاضل حوالي ${fmtMin(el * (100 - p) / p)}` : '';
        const cls = j.state ? (j.state === 'success' ? 'done' : 'fail') : '';
        const lbl = j.state ? (j.state === 'success' ? 'جاهز ✓' : 'وقف ✕') : p + '%';
        return `<div class="job ${cls}"><div class="top"><span class="nm">${esc(j.name)}</span><span>${lbl}</span></div><div class="bar"><i style="width:${j.state ? 100 : p}%"></i></div><div class="muted" style="font-size:13px;margin-top:4px">بقاله ${fmtMin(el)}${eta}</div></div>`; }).join('');
    }
  } catch (e) { st.innerHTML = `<span class="pill bad">مش متوصل</span><span class="muted">${esc(e.message)}</span>`; }
  try {
    const rel = await api('/releases/tags/videos');
    const all = rel.assets || [];
    const sig = all.map(a => a.id + ':' + a.updated_at).join(','); if (sig === LAST) return; LAST = sig;
    ASSETS = all; drawLib();
  } catch (e) { if (e.status !== 404) $('vids').innerHTML = `<p class="muted">مش قادر أجيب الفيديوهات: ${esc(e.message)}</p>`; }
}
function drawLib(){
  const all = ASSETS, by = n => all.find(a => a.name === n), q = ($('libQ').value || '').toLowerCase();
  const assets = all.filter(a => a.name.endsWith('.mp4') && !a.name.endsWith('.preview.mp4') && a.name.toLowerCase().includes(q)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  $('libCount').textContent = `${all.filter(a => a.name.endsWith('.mp4') && !a.name.endsWith('.preview.mp4')).length} فيديو في المكتبة.`;
  $('vids').innerHTML = assets.length ? '' : '<p class="muted">مفيش فيديوهات.</p>';
  assets.forEach(a => {
    const base = a.name.slice(0, -4), pv = by(base + '.preview.mp4'), jpg = by(base + '.jpg');
    const d = document.createElement('div'); d.className = 'vid';
    d.innerHTML = `<button class="po" type="button" aria-label="شغّل"></button><div class="meta"><span class="n"></span><span class="muted" style="font-size:12px">${(a.size / 1048576).toFixed(1)} MB · ${new Date(a.created_at).toLocaleDateString('ar-EG')}</span><div class="acts"><a href="${a.browser_download_url}" download>⬇ تحميل</a><button type="button">مسح</button></div></div>`;
    d.querySelector('.n').textContent = base;
    const po = d.querySelector('.po'); if (jpg) po.style.backgroundImage = `url("${jpg.browser_download_url}")`;
    po.onclick = () => { const v = $('mv'); v.src = (pv || a).browser_download_url; $('modal').classList.add('on'); v.play().catch(() => {}); };
    const del = d.querySelector('.acts button');
    del.onclick = async () => { if (del.dataset.s !== '1') { del.dataset.s = '1'; del.textContent = 'متأكد؟'; setTimeout(() => { del.dataset.s = ''; del.textContent = 'مسح'; }, 3000); return; }
      try { for (const x of [a, pv, jpg].filter(Boolean)) await api('/releases/assets/' + x.id, {method: 'DELETE'}); LAST = ''; refresh(); } catch (e) { del.textContent = 'ما اتمسحش'; } };
    $('vids').appendChild(d);
  });
}
$('libQ').oninput = drawLib;
const closeM = () => { const v = $('mv'); v.pause(); v.removeAttribute('src'); v.load(); $('modal').classList.remove('on'); };
$('mx').onclick = closeM; $('modal').onclick = e => { if (e.target.id === 'modal') closeM(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeM(); });
$('secLink').href = 'https://github.com/' + REPO + '/settings/secrets/actions/new';
$('repo').value = REPO;
showSetup(); refresh(); setInterval(refresh, 10000);
