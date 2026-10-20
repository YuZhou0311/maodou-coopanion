/** Local convenience preview. It intentionally does not claim an opaque iframe. */
import * as kit from './vendor/coopanion/web/kit/body.js';
import { onBody, readLayout, touchGate, knownScheme } from './vendor/coopanion/web/body-host.js';

const payload = JSON.parse(document.getElementById('maodou-embedded').textContent);
const manifest = JSON.parse(payload.manifestSource), model = JSON.parse(payload.modelSource);
const $ = selector => document.querySelector(selector), stage = $('#stage'), layer = $('#layer');
const records = { events: [], inputs: [], sounds: [], errors: [], scope: 'Direct local body calls; no opaque iframe or postMessage boundary.' };
const images = new Map(), assetURLs = new Map();
let body = null, factory = null, running = true, dead = false, generation = 0, rendered = 0;
let scale = 1.2, lastTime = performance.now(), lastMeter = 0, talking = null, pointerId = null, lastPointerPoint = null;
let listening = false, thinking = false, sweep = null, layout = null, touches = touchGate();
const frameTimes = [], base = new URL('maodou-embedded-pack/', location.href);
const bounds = () => ({ W: stage.clientWidth, H: stage.clientHeight, floorY: stage.clientHeight * .84, S: Math.min(scale, stage.clientWidth / 380) });
const point = e => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp, buttons: e.buttons, pointerId: e.pointerId, pointerType: e.pointerType }; };
function record(kind, detail) {
  records.events.push({ at: performance.now(), kind, detail });
  if (records.events.length > 100) records.events.shift();
  $('#events').textContent = records.events.slice(-12).map(e => `${e.kind} ${JSON.stringify(e.detail)}`).join('\n');
}
function fail(error) {
  dead = true; running = false; stopTalking(); records.errors.push(String(error?.stack ?? error));
  $('#empty-title').textContent = '角色运行遇到问题'; $('#empty-detail').textContent = String(error?.message ?? error);
  $('#empty-state').hidden = false; $('#subtitle').textContent = '错误已保留在本页诊断中。';
  for (const b of document.querySelectorAll('[data-requires-body]')) b.disabled = true;
}
function asset(path) {
  const url = new URL(String(path), base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.search || url.hash) throw new Error(`Unsupported embedded asset path: ${path}`);
  const key = decodeURIComponent(url.pathname.slice(base.pathname.length)), source = payload.assets[key];
  if (!source) throw new Error(`Asset is not embedded: ${key}`);
  if (!assetURLs.has(key)) assetURLs.set(key, `data:${source.mime};base64,${source.base64}`);
  return assetURLs.get(key);
}
function loadImage(url) {
  const source = String(url);
  if (!source.startsWith('data:image/')) return Promise.reject(new Error('This offline preview loads embedded images only.'));
  if (!images.has(source)) images.set(source, new Promise((resolve, reject) => {
    const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => resolve(image);
    image.onerror = () => { images.delete(source); reject(new Error('An embedded character image could not be decoded.')); };
    image.src = source;
  }));
  return images.get(source);
}
function drawStep(dt) {
  if (!body || dead) return;
  body.step(dt); rendered++; layout = readLayout(body.layout(), bounds());
  stage.style.cursor = layout?.cursor ?? ''; $('#mode').textContent = layout?.mode ?? '—';
  $('#rendered-frames').textContent = rendered;
}
function redraw() { if (!running && body && !dead) { try { drawStep(0); } catch (error) { fail(error); } } }
function setPaused(paused) { running = !paused; lastTime = performance.now(); $('#pause').textContent = paused ? '继续' : '暂停'; }
function setScale(value) {
  if (!Number.isFinite(value) || value <= 0 || value > 1.5) throw new Error('Scale must be in (0, 1.5].');
  scale = value; $('#scale').value = value; $('#scale-value').textContent = value.toFixed(2); body?.resize?.(); redraw();
}
function setYaw(value, immediate = false) {
  if (value !== null && (!Number.isFinite(value) || Math.abs(value) > 1)) throw new Error('Yaw must be null or in [-1, 1].');
  sweep = null; $('#sweep').setAttribute('aria-pressed', 'false'); body?.set({ viewYaw: value, viewYawImmediate: immediate });
  $('#yaw-slider').value = value === null ? 0 : value * 75;
  $('#yaw-value').textContent = value === null ? '自动' : `${value > 0 ? '+' : ''}${Math.round(value * 75)}°`;
  $('#scene-caption').textContent = value === null ? '自动转向 · 本地运行' : `转向 ${Math.round(value * 75)}° · 本地运行`; redraw();
}
function setSweep(enabled, seconds = 8) {
  if (!Number.isFinite(seconds) || seconds < 2 || seconds > 30) throw new Error('Sweep period must be 2–30 simulation seconds.');
  if (!enabled) { setYaw(null); return; }
  sweep = { phase: 0, seconds }; $('#sweep').setAttribute('aria-pressed', 'true'); setPaused(false);
  $('#scene-caption').textContent = '连续左右转向 · 本地运行';
}
function stopTalking() { clearInterval(talking); talking = null; $('#talk').setAttribute('aria-pressed', 'false'); }
function startTalking() {
  if (!body || talking || dead) return; body.talk?.(); talking = setInterval(() => body?.talk?.(), 90);
  $('#talk').setAttribute('aria-pressed', 'true'); record('mouth-simulation', { audio: false });
}
function populateControls() {
  const supported = new Set(body.words ?? []);
  for (const [kind, selector, count] of [['expression', '#expressions', '#expression-count'], ['motion', '#motions', '#motion-count']]) {
    const words = manifest.vocab.filter(w => w.kind === kind && supported.has(w.id)); $(selector).replaceChildren(); $(count).textContent = words.length;
    for (const word of words) {
      const button = document.createElement('button'); button.textContent = word.names?.zh?.[0] ?? word.id; button.title = word.about?.zh ?? word.id;
      button.dataset.word = word.id; button.addEventListener('click', () => { body.do(word.id); redraw(); }); $(selector).appendChild(button);
    }
  }
  const container = $('#schemes'); container.replaceChildren();
  const axes = manifest.axes ?? [], choices = axes.map(a => a.options[0]?.id);
  $('#scheme-section').hidden = !axes.length;
  for (const [i, axis] of axes.entries()) {
    const label = document.createElement('label'); label.textContent = axis.name?.zh ?? axis.id;
    const select = document.createElement('select');
    for (const option of axis.options) { const node = document.createElement('option'); node.value = option.id; node.textContent = option.name?.zh ?? option.id; select.appendChild(node); }
    select.addEventListener('change', () => { choices[i] = select.value; body.setScheme?.(knownScheme(manifest, choices.join('-'))); redraw(); });
    label.appendChild(select); container.appendChild(label);
  }
}
async function reset() {
  const serial = ++generation; stopTalking(); body?.dispose?.(); body = null; layout = null; dead = false; pointerId = null;
  rendered = 0; frameTimes.length = 0; touches = touchGate(); sweep = null; listening = thinking = false;
  $('#empty-title').textContent = '正在载入角色'; $('#empty-detail').textContent = '使用本文件内嵌的正式角色资产。'; $('#empty-state').hidden = false;
  for (const b of document.querySelectorAll('[data-requires-body]')) b.disabled = true;
  for (const id of ['listen', 'think', 'sweep']) $('#' + id).setAttribute('aria-pressed', 'false');
  try {
    const host = { root: layer, bounds, start: { x: bounds().W / 2, facing: 1, enter: null },
      emit: (kind, detail) => { if (kind === 'touch' && !touches.take(detail?.kind, performance.now())) return; record(kind, detail); },
      sound: (name, kind, ...args) => { records.sounds.push({ name, kind, args, played: false }); if (records.sounds.length > 100) records.sounds.shift(); },
    };
    const instance = await factory(base, { model, scheme: knownScheme(manifest, ''), kit, loadImage, asset, host });
    if (serial !== generation) { instance.dispose?.(); return; }
    for (const method of ['step', 'layout', 'do']) if (typeof instance?.[method] !== 'function') throw new Error(`Body method missing: ${method}`);
    body = instance; body.set?.({ roam: 'off', hold: 3600, theme: stage.dataset.background === 'dark' ? 'dark' : 'light' }); drawStep(0);
    $('#empty-state').hidden = true; $('#subtitle').textContent = '同一套正式角色代码与原图，已完整保存在这个文件中。';
    for (const b of document.querySelectorAll('[data-requires-body]')) b.disabled = false;
    populateControls(); setYaw(null); setPaused(false);
  } catch (error) { if (serial === generation) fail(error); }
}
function tick(now) {
  const dt = Math.max(0, Math.min(.05, (now - lastTime) / 1000)); lastTime = now;
  if (running && body && !dead) {
    try {
      if (sweep) { sweep.phase += dt / sweep.seconds; const value = Math.sin(sweep.phase * Math.PI * 2); body.set({ viewYaw: value }); $('#yaw-slider').value = value * 75; $('#yaw-value').textContent = `${Math.round(value * 75)}°`; }
      drawStep(dt); frameTimes.push(performance.now());
    } catch (error) { fail(error); }
  }
  while (frameTimes.length && frameTimes[0] < now - 4000) frameTimes.shift();
  if (now - lastMeter > 500) {
    lastMeter = now; const duration = frameTimes.at(-1) - frameTimes[0];
    $('#local-fps').textContent = running && duration > 0 ? `${((frameTimes.length - 1) * 1000 / duration).toFixed(1)} FPS` : '—';
  }
  requestAnimationFrame(tick);
}
function pointer(type, e) {
  const p = point(e); lastPointerPoint = p; records.inputs.push({ type, ...p, isTrusted: e.isTrusted }); if (records.inputs.length > 400) records.inputs.shift();
  touches.input(performance.now()); body.pointer?.(type, p); redraw();
}
stage.addEventListener('pointerdown', e => {
  if (!body || dead || pointerId !== null || e.button !== 0 || e.isPrimary === false || !onBody(layout, point(e))) return;
  pointerId = e.pointerId; pointer('down', e);
  try { stage.setPointerCapture(pointerId); } catch { /* window-level release remains available */ }
  e.preventDefault();
});
window.addEventListener('pointermove', e => {
  if (!body || dead || (pointerId !== null && pointerId !== e.pointerId)) return;
  if (pointerId !== null && e.buttons === 0) releasePointer(e, 'cancel', 'move-buttons-zero');
  if (pointerId !== null || stage.contains(e.target)) pointer('move', e);
});
function releasePointer(e, type, reason) {
  if (!body || pointerId === null || (e?.pointerId != null && pointerId !== e.pointerId)) return;
  const id = pointerId; pointerId = null;
  const p = e ? point(e) : { ...lastPointerPoint, t: performance.now(), buttons: 0, pointerId: id };
  records.inputs.push({ type, ...p, isTrusted: e?.isTrusted ?? false, ...(reason ? { reason } : {}) });
  if (records.inputs.length > 400) records.inputs.shift();
  touches.input(performance.now()); body.pointer?.(type, { ...p, ...(reason ? { reason } : {}) });
  if (stage.hasPointerCapture?.(id)) { try { stage.releasePointerCapture(id); } catch {} }
  redraw();
}
window.addEventListener('pointerup', e => releasePointer(e, 'up'), { capture: true });
window.addEventListener('pointercancel', e => releasePointer(e, 'cancel', 'pointercancel'), { capture: true });
stage.addEventListener('lostpointercapture', e => releasePointer(e, 'cancel', 'lostpointercapture'));
window.addEventListener('blur', () => releasePointer(null, 'cancel', 'window-blur'));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') releasePointer(null, 'cancel', 'document-hidden'); });
stage.addEventListener('pointerleave', () => { if (body && pointerId === null) body.pointer?.('leave', {}); });
$('#reload').addEventListener('click', reset); $('#pause').addEventListener('click', () => setPaused(running));
$('#scale').addEventListener('input', e => setScale(Number(e.target.value)));
$('#yaw-slider').addEventListener('input', e => setYaw(Number(e.target.value) / 75));
for (const button of document.querySelectorAll('[data-yaw]')) button.addEventListener('click', () => setYaw(button.dataset.yaw === 'auto' ? null : Number(button.dataset.yaw)));
$('#sweep').addEventListener('click', () => setSweep(!sweep));
for (const button of document.querySelectorAll('[data-background]')) button.addEventListener('click', () => {
  stage.dataset.background = button.dataset.background;
  for (const other of document.querySelectorAll('[data-background]')) other.setAttribute('aria-pressed', String(other === button));
  body?.set({ theme: button.dataset.background === 'dark' ? 'dark' : 'light' }); redraw();
});
$('#walk-left').addEventListener('click', () => body?.walk(bounds().W * .22, false, 'offline-left'));
$('#walk-right').addEventListener('click', () => body?.walk(bounds().W * .78, false, 'offline-right'));
$('#listen').addEventListener('click', () => { listening = !listening; body?.set({ listening }); $('#listen').setAttribute('aria-pressed', String(listening)); redraw(); });
$('#think').addEventListener('click', () => { thinking = !thinking; body?.set({ thinking }); $('#think').setAttribute('aria-pressed', String(thinking)); redraw(); });
$('#talk').addEventListener('pointerdown', e => { $('#talk').setPointerCapture(e.pointerId); startTalking(); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#talk').addEventListener(type, stopTalking);
$('#talk').addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) startTalking(); });
$('#talk').addEventListener('keyup', stopTalking); addEventListener('blur', stopTalking);
new ResizeObserver(() => { body?.resize?.(); redraw(); }).observe(stage);
addEventListener('beforeunload', () => { stopTalking(); body?.dispose?.(); });
addEventListener('error', e => fail(e.error ?? e.message)); addEventListener('unhandledrejection', e => fail(e.reason));
document.addEventListener('visibilitychange', () => { lastTime = performance.now(); if (document.hidden) stopTalking(); });
window.maodouStandalone = { get ready() { return !!body && !dead; }, get body() { return body; }, get layout() { return layout; },
  get renderedFrames() { return rendered; }, source: payload.provenance, records, bounds, setPaused, setYaw, setScale, setSweep, reset,
  async advance(frames = 1, dt = 1 / 60) {
    if (!body || dead || !Number.isInteger(frames) || frames < 1 || frames > 1800 || !Number.isFinite(dt) || dt < 0 || dt > .05) throw new Error('Invalid local advance request.');
    setPaused(true); for (let i = 0; i < frames; i++) { drawStep(dt); if ((i + 1) % 12 === 0) await new Promise(requestAnimationFrame); }
    await new Promise(requestAnimationFrame); return { renderedFrames: rendered, inspect: body.inspect?.() ?? null };
  },
};
$('#pack-version').textContent = `${manifest.name?.zh ?? manifest.id} · ${manifest.version}`;
$('#upstream').textContent = payload.provenance.upstreamCommit; $('#figure-sha').textContent = payload.provenance.figureSha256;
$('#license-notice').textContent = payload.licenseText;
requestAnimationFrame(tick);
(async () => {
  const url = URL.createObjectURL(new Blob([payload.figureSource], { type: 'text/javascript' }));
  try {
    const module = await import(/* @vite-ignore */ url); factory = module[manifest.export];
    if (typeof factory !== 'function') throw new Error(`Embedded module does not export ${manifest.export}`);
  } catch (error) { fail(error); return; }
  finally { URL.revokeObjectURL(url); }
  await reset();
})();
