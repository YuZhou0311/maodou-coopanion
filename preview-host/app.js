import { loadBody } from '/web/body-host.js';

const $ = s => document.querySelector(s);
const stage = $('#stage'), layer = $('#layer');
let body = null, pack = null, running = true, inFlight = false, completed = 0;
let scale = .6, lastSubmitAt = 0, generation = 0, talking = null, latestStatus = null;
let pointerId = null, lastPointerPoint = null, listening = false, thinking = false;
let sweep = null, measurement = null, lastMeter = 0;
const rafTimes = [], frameTimes = [], frameWaiters = [];
const records = { events: [], inputs: [], errors: [], sounds: [], originNullObserved: false };
const bounds = () => ({ W: stage.clientWidth, H: stage.clientHeight, floorY: stage.clientHeight * .84, S: Math.min(scale, stage.clientWidth / 440) });
const point = e => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp, buttons: e.buttons, pointerId: e.pointerId, pointerType: e.pointerType }; };
const record = (kind, detail) => {
  records.events.push({ at: performance.now(), kind, detail });
  if (records.events.length > 80) records.events.shift();
  $('#events').textContent = records.events.slice(-16).map(e => `${e.kind} ${JSON.stringify(e.detail)}`).join('\n');
};
function requestStaticFrame() { if (body && !running && !inFlight) { inFlight = true; body.tick(0); } }
function setPaused(paused) {
  running = !paused; lastSubmitAt = performance.now();
  $('#pause').textContent = paused ? '继续' : '暂停';
}
function setYaw(value, immediate = false) {
  sweep = null; $('#sweep').setAttribute('aria-pressed', 'false');
  body?.set({ viewYaw: value, viewYawImmediate: immediate }); requestStaticFrame();
  $('#yaw-slider').value = value === null ? 0 : Math.round(value * 75);
  $('#yaw-value').textContent = value === null ? '自动' : `${value > 0 ? '+' : ''}${Math.round(value * 75)}°`;
  $('#scene-caption').textContent = value === null ? '自动转向' : `${value < 0 ? '画面左侧' : value > 0 ? '画面右侧' : '正面'}${value ? ` · ${Math.round(Math.abs(value) * 75)}°` : ''}`;
}
function setSweep(enabled, seconds = 8) {
  if (!Number.isFinite(seconds) || seconds < 2 || seconds > 30) throw new Error('Sweep period must be 2–30 simulation seconds');
  sweep = enabled ? { phase: 0, seconds } : null;
  $('#sweep').setAttribute('aria-pressed', String(!!sweep));
  if (sweep) { setPaused(false); $('#scene-caption').textContent = '连续左右转向'; }
  else setYaw(null);
}
function timingStats(times) {
  const intervals = times.slice(1).map((t, i) => t - times[i]);
  if (!intervals.length) return { samples: times.length, fps: null, p95Ms: null, intervalsMs: [] };
  const sorted = [...intervals].sort((a, b) => a - b), durationMs = times.at(-1) - times[0];
  return { samples: times.length, fps: durationMs > 0 ? intervals.length * 1000 / durationMs : null,
    durationMs, p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], intervalsMs: intervals };
}
function waitFrame(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const waiter = { resolve, reject }, timer = setTimeout(() => {
      const at = frameWaiters.indexOf(waiter); if (at >= 0) frameWaiters.splice(at, 1);
      reject(new Error('Timed out waiting for an actual native frame'));
    }, timeoutMs);
    waiter.resolve = value => { clearTimeout(timer); resolve(value); };
    waiter.reject = error => { clearTimeout(timer); reject(error); };
    frameWaiters.push(waiter);
  });
}
async function advance(frames = 1, dt = 1 / 60) {
  if (!body) throw new Error('Character is not ready');
  if (!Number.isInteger(frames) || frames < 1 || frames > 1800 || !Number.isFinite(dt) || dt < 0 || dt > .05) throw new Error('Invalid advance parameters');
  setPaused(true); if (inFlight) await waitFrame();
  for (let i = 0; i < frames; i++) { const next = waitFrame(); inFlight = true; body.tick(dt); await next; }
  return { completedFrames: completed, layout: body.layout };
}
async function measure({ seconds = 6.5, label = 'unspecified' } = {}) {
  if (!body || !running) throw new Error('A running character is required');
  if (measurement) throw new Error('A measurement is already active');
  if (!Number.isFinite(seconds) || seconds < 2 || seconds > 60) throw new Error('Measurement duration must be 2–60 seconds');
  const initialGeneration = generation;
  const sourceBefore = await (await fetch('/api/preview')).json();
  const m = { label, raf: [], frames: [], startedAt: performance.now(), visibilityAtStart: document.visibilityState };
  measurement = m;
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  measurement = null;
  const endedAt = performance.now(), sourceAfter = await (await fetch('/api/preview')).json();
  return { label, requestedSeconds: seconds, elapsedMs: endedAt - m.startedAt, pageRaf: timingStats(m.raf), characterFrames: timingStats(m.frames),
    readyThroughout: !!body && initialGeneration === generation, visibilityAtStart: m.visibilityAtStart, visibilityAtEnd: document.visibilityState,
    bounds: bounds(), sourceBefore, sourceAfter, errors: [...records.errors],
    scope: 'Actual RAF callbacks and completed native frame messages in this fixed window. No smoothness threshold or pass is inferred; no offline video frames are counted.' };
}
function stopTalking() {
  clearInterval(talking); talking = null; $('#talk').setAttribute('aria-pressed', 'false');
}
function startTalking() {
  if (!body || talking) return;
  body.talk(); talking = setInterval(() => body?.talk(), 90);
  $('#talk').setAttribute('aria-pressed', 'true'); record('mouth-simulation', { audio: false });
}
function fillWords() {
  const supported = body?.words;
  for (const [kind, selector, count] of [['expression', '#expressions', '#expression-count'], ['motion', '#motions', '#motion-count']]) {
    const items = (pack?.vocab ?? []).filter(w => w.kind === kind && (!Array.isArray(supported) || supported.includes(w.id)));
    const container = $(selector); container.replaceChildren(); $(count).textContent = items.length;
    for (const item of items) {
      const b = document.createElement('button'); b.textContent = item.names?.zh?.[0] ?? item.id;
      b.title = item.about?.zh ?? item.id; b.dataset.word = item.id;
      b.addEventListener('click', () => { body?.do(item.id); requestStaticFrame(); }); container.appendChild(b);
    }
    if (!items.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = `清单尚未登记可执行${kind === 'expression' ? '表情' : '动作'}。`; container.appendChild(p); }
  }
}
function fillSchemes() {
  const container = $('#schemes'); container.replaceChildren();
  const axes = pack?.axes ?? [], presets = pack?.presets ?? [];
  $('#scheme-section').hidden = !axes.length && !presets.length;
  const picks = new Map(axes.map(a => [a.id, a.options[0]?.id]));
  for (const axis of axes) {
    const label = document.createElement('label'); label.textContent = axis.name?.zh ?? axis.id;
    const select = document.createElement('select');
    for (const option of axis.options) { const o = document.createElement('option'); o.value = option.id; o.textContent = option.name?.zh ?? option.id; select.appendChild(o); }
    select.addEventListener('change', () => { picks.set(axis.id, select.value); body?.setScheme(axes.map(a => picks.get(a.id)).join('-')); requestStaticFrame(); });
    label.appendChild(select); container.appendChild(label);
  }
  for (const preset of presets) { const b = document.createElement('button'); b.textContent = preset.name?.zh ?? preset.id; b.addEventListener('click', () => body?.setScheme(preset.id)); container.appendChild(b); }
}
async function reload() {
  const thisGeneration = ++generation;
  stopTalking(); body?.dispose(); body = null; pack = null; inFlight = false; completed = 0; pointerId = null; sweep = null;
  listening = thinking = false; $('#listen').setAttribute('aria-pressed', 'false'); $('#think').setAttribute('aria-pressed', 'false'); $('#sweep').setAttribute('aria-pressed', 'false');
  for (const waiter of frameWaiters.splice(0)) waiter.reject(new Error('Preview reloaded'));
  for (const b of document.querySelectorAll('[data-requires-body]')) b.disabled = true;
  $('#empty-state').hidden = false; $('#empty-detail').textContent = '正在读取接入状态。';
  try {
    const status = await (await fetch('/api/preview')).json(); if (thisGeneration !== generation) return;
    latestStatus = status; $('#upstream').textContent = status.upstreamCommit;
    $('#manifest-version').textContent = `${status.source.manifest?.manifest ?? '—'} / ${status.source.manifest?.api ?? '—'}`;
    $('#technical-status').textContent = JSON.stringify(status, null, 2);
    if (!status.ready) {
      const paths = status.source.missing.map(m => m.path).join('、');
      $('#subtitle').textContent = '原生接入壳已准备；实际角色代码与图像尚未完成打包。';
      $('#empty-detail').textContent = paths ? `等待 ${paths}。完成真实资产打包后，点击“重新载入”。` : '尚无与当前源文件一致的角色包。请先完成打包，再重新载入。';
      fillWords(); return;
    }
    pack = status.pack;
    const b = bounds();
    const instance = await loadBody({ layer, pack, start: { x: b.W / 2, facing: 1, enter: null }, theme: stage.dataset.background === 'dark' ? 'dark' : 'light', bounds: b,
      onEvent: record,
      onSound: (...args) => { records.sounds.push(args); },
      onError: error => { records.errors.push(String(error)); $('#empty-detail').textContent = String(error.message ?? error); $('#empty-state').hidden = false; body = null; inFlight = false; },
    });
    if (thisGeneration !== generation) { instance.dispose(); return; }
    body = instance; body.set({ roam: 'off', hold: 3600, thoughtShown: false });
    $('#empty-state').hidden = true; $('#subtitle').textContent = '真实角色运行于 Coopanion 的原生隔离页面。';
    $('#scene-caption').textContent = '自动转向';
    for (const b of document.querySelectorAll('[data-requires-body]')) b.disabled = false;
    fillWords(); fillSchemes(); lastSubmitAt = performance.now(); requestStaticFrame();
  } catch (error) {
    records.errors.push(String(error)); $('#empty-detail').textContent = `接入失败：${error.message ?? error}`;
    $('#subtitle').textContent = '角色未完成载入。具体错误保留在接入记录中。';
  }
}

addEventListener('message', e => {
  const frame = layer.querySelector('iframe');
  if (!frame || e.source !== frame.contentWindow || e.data?.t !== 'frame') return;
  inFlight = false; completed++; records.originNullObserved ||= e.origin === 'null';
  const time = performance.now(); frameTimes.push(time); measurement?.frames.push(time);
  $('#message-origin').textContent = e.origin === 'null' ? 'null（不透明源）' : e.origin;
  $('#completed-frames').textContent = completed;
  // The native host sanitizes layout in its own listener; read it after dispatch.
  queueMicrotask(() => {
    $('#mode').textContent = body?.layout?.mode ?? '—'; stage.style.cursor = body?.layout?.cursor ?? '';
    for (const waiter of frameWaiters.splice(0)) waiter.resolve({ time, layout: body?.layout ?? null });
  });
});
function tick(now) {
  rafTimes.push(now); measurement?.raf.push(now);
  while (rafTimes.length && rafTimes[0] < now - 4000) rafTimes.shift();
  while (frameTimes.length && frameTimes[0] < now - 4000) frameTimes.shift();
  if (now - lastMeter > 500) {
    lastMeter = now; const r = timingStats(rafTimes), f = timingStats(frameTimes);
    $('#raf-fps').textContent = r.fps === null ? '—' : `${r.fps.toFixed(1)} FPS`;
    $('#body-fps').textContent = !body || !running || f.fps === null ? '—' : `${f.fps.toFixed(1)} FPS`;
    $('#body-p95').textContent = !body || !running || f.p95Ms === null ? '—' : `${f.p95Ms.toFixed(1)} ms`;
  }
  if (running && body && !inFlight) {
    const dt = Math.max(0, Math.min(.05, (now - lastSubmitAt) / 1000 || 1 / 60));
    if (sweep) {
      sweep.phase += dt / sweep.seconds;
      const value = Math.sin(sweep.phase * Math.PI * 2); body.set({ viewYaw: value });
      $('#yaw-slider').value = value * 75; $('#yaw-value').textContent = `${value > 0 ? '+' : ''}${Math.round(value * 75)}°`;
    }
    lastSubmitAt = now; inFlight = true; body.tick(dt);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
new ResizeObserver(() => { body?.set({ bounds: bounds() }); requestStaticFrame(); }).observe(stage);
$('#reload').addEventListener('click', reload);
$('#pause').addEventListener('click', () => setPaused(running));
$('#scale').addEventListener('input', e => { scale = Number(e.target.value); $('#scale-value').textContent = scale.toFixed(2); body?.set({ bounds: bounds() }); requestStaticFrame(); });
for (const b of document.querySelectorAll('button[data-background]')) b.addEventListener('click', () => {
  stage.dataset.background = b.dataset.background;
  for (const q of document.querySelectorAll('button[data-background]')) q.setAttribute('aria-pressed', String(q === b));
  body?.set({ theme: b.dataset.background === 'dark' ? 'dark' : 'light' });
});
for (const b of document.querySelectorAll('[data-yaw]')) b.addEventListener('click', () => setYaw(b.dataset.yaw === 'auto' ? null : Number(b.dataset.yaw), $('#instant-yaw').checked));
$('#yaw-slider').addEventListener('input', e => setYaw(Number(e.target.value) / 75, $('#instant-yaw').checked));
$('#sweep').addEventListener('click', () => setSweep(!sweep));
$('#walk-left').addEventListener('click', () => body?.walk(bounds().W * .22, false, 'preview-left'));
$('#walk-right').addEventListener('click', () => body?.walk(bounds().W * .78, false, 'preview-right'));
$('#listen').addEventListener('click', () => { listening = !listening; body?.set({ listening }); $('#listen').setAttribute('aria-pressed', String(listening)); });
$('#think').addEventListener('click', () => { thinking = !thinking; body?.set({ thinking }); $('#think').setAttribute('aria-pressed', String(thinking)); });
$('#talk').addEventListener('pointerdown', e => { $('#talk').setPointerCapture(e.pointerId); startTalking(); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#talk').addEventListener(type, stopTalking);
$('#talk').addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) startTalking(); });
$('#talk').addEventListener('keyup', stopTalking); addEventListener('blur', stopTalking);
stage.addEventListener('pointerdown', e => {
  if (!body || pointerId !== null || e.button !== 0 || e.isPrimary === false || !body.hit(point(e))) return;
  pointerId = e.pointerId; input('down', e); body.pointer('down', point(e));
  try { stage.setPointerCapture(pointerId); } catch { /* window-level release remains available */ }
  e.preventDefault(); requestStaticFrame();
});
function input(type, e) {
  lastPointerPoint = point(e);
  records.inputs.push({ type, ...lastPointerPoint, isTrusted: e.isTrusted }); if (records.inputs.length > 400) records.inputs.shift();
}
window.addEventListener('pointermove', e => {
  if (!body || (pointerId !== null && pointerId !== e.pointerId)) return;
  if (pointerId !== null && e.buttons === 0) release(e, 'cancel', 'move-buttons-zero');
  if (pointerId !== null || stage.contains(e.target)) { input('move', e); body.pointer('move', point(e)); requestStaticFrame(); }
});
function release(e, type, reason) {
  if (!body || pointerId === null || (e?.pointerId != null && pointerId !== e.pointerId)) return;
  const id = pointerId; pointerId = null;
  const p = e ? point(e) : { ...lastPointerPoint, t: performance.now(), buttons: 0, pointerId: id };
  records.inputs.push({ type, ...p, isTrusted: e?.isTrusted ?? false, ...(reason ? { reason } : {}) });
  if (records.inputs.length > 400) records.inputs.shift();
  body.pointer(type, { ...p, ...(reason ? { reason } : {}) });
  if (stage.hasPointerCapture?.(id)) { try { stage.releasePointerCapture(id); } catch {} }
  requestStaticFrame();
}
window.addEventListener('pointerup', e => release(e, 'up'), { capture: true });
window.addEventListener('pointercancel', e => release(e, 'cancel', 'pointercancel'), { capture: true });
stage.addEventListener('lostpointercapture', e => release(e, 'cancel', 'lostpointercapture'));
window.addEventListener('blur', () => release(null, 'cancel', 'window-blur'));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') release(null, 'cancel', 'document-hidden'); });
stage.addEventListener('pointerleave', () => { if (pointerId === null) body?.pointer('leave', {}); });
addEventListener('beforeunload', () => { stopTalking(); body?.dispose(); });
window.maodouPreview = { get body() { return body; }, get ready() { return !!body; }, get status() { return latestStatus; }, get completedFrames() { return completed; }, records,
  setPaused, setYaw, setSweep, advance, measure, timingStats, bounds, reload,
  setScale(value) {
    if (!Number.isFinite(value) || value <= 0 || value > 1.5) throw new Error('Scale must be a finite number in (0, 1.5]');
    scale = value; $('#scale').value = value; $('#scale-value').textContent = scale.toFixed(2); body?.set({ bounds: bounds() }); requestStaticFrame();
  } };
await reload();
