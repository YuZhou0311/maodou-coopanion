#!/usr/bin/env node
/** Runs actual upstream pointer handlers + native createPet against DOM records.
 * Synthetic CPU events, not trusted browser or real desktop acceptance. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as nativeKit from '../preview-host/vendor/coopanion/web/kit/body.js';
import { createUnmirroredBody } from '../runtime/host-adapter.js';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const hash = data => createHash('sha256').update(data).digest('hex');
class Target {
  constructor() { this.handlers = new Map(); this.style = {}; this.children = []; this.dataset = {}; this.captured = new Set(); }
  addEventListener(type, fn) { const list = this.handlers.get(type) ?? []; list.push(fn); this.handlers.set(type, list); }
  removeEventListener(type, fn) { this.handlers.set(type, (this.handlers.get(type) ?? []).filter(f => f !== fn)); }
  async emit(type, event = {}) { for (const fn of this.handlers.get(type) ?? []) await fn(event); }
  appendChild(n) { this.children.push(n); n.parentNode = this; return n; }
  setAttribute() {} remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this); }
  closest() { return null; } setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); void this.emit('lostpointercapture', { pointerId: id }); }
}
function fixture() {
  const doc = new Target(), win = new Target(); doc.defaultView = win; doc.visibilityState = 'visible';
  doc.createElement = doc.createElementNS = (...args) => { const n = new Target(); n.ownerDocument = doc; return n; };
  doc.head = new Target(); doc.documentElement = new Target(); const node = doc.createElement('div');
  const events = []; let ctl;
  const kit = { ...nativeKit, createPet(...args) { ctl = nativeKit.createPet(...args); return ctl; } };
  const figure = { draw() {}, extent: [34, 32, 222, 256], hits: [[128, 126, 32]], anchors: { gaze: [128, 118], bubble: [128, 28] } };
  const body = createUnmirroredBody(kit, { root: node, bounds: () => ({ W: 600, H: 400, floorY: 350, S: .55 }), start: { x: 280, facing: 1 }, emit: (kind, detail) => events.push({ kind, detail }), sound() {} }, { figure, roam: 'off' });
  body.set({ hold: 3600 }); body.step(0);
  return { body, ctl, doc, win, events };
}
const oldSource = await readFile(resolve(root, 'host-fix/pet-app.base.js'), 'utf8');
const newSource = await readFile(resolve(root, 'host-fix/pet-app.js'), 'utf8');
function handlers(source) { return source.slice(source.indexOf('const UI_SELECTOR ='), source.indexOf("stage.addEventListener('dblclick'")); }
function pageFixture(source) {
  const f = fixture(), stage = new Target(), doc = new Target(), win = new Target(), signals = [];
  doc.body = new Target(); doc.visibilityState = 'visible'; doc.elementFromPoint = () => stage;
  let now = 1000;
  const host = { onCursor() {}, onShown(cb) { this.shown = cb; }, async followCursor() { return null; } };
  const bridge = {
    hit: p => f.ctl.hitPet(p),
    pointer(type, p) { signals.push({ type, p: structuredClone(p) }); f.body.pointer(type, p); f.body.step(0); },
    drop(p) { signals.push({ type: 'drop', p }); f.body.drop(p); f.body.step(0); },
    shift(dx, dy) { signals.push({ type: 'shift', dx, dy }); f.body.shift(dx, dy); },
    set(s) { f.body.set(s); },
  };
  const ctx = vm.createContext({ body: bridge, stage, document: doc, window: win, host, cursor: {}, pointerSeen: false, lastPointer: { x: 0, y: 0 },
    at: () => f.body.layout(), bounds: () => f.ctl.bounds, innerWidth: 600, innerHeight: 400,
    closeMenu() {}, rendering: () => true, setInteractive() {}, logPointer() {},
    diag: { types: new Set(), type: '', move: null }, performance: { now: () => now }, requestAnimationFrame: cb => cb(now), console,
  });
  vm.runInContext(handlers(source), ctx);
  function event(x, y, buttons = 1, id = 1, t = now + 16) { now = t; return { clientX: x, clientY: y, buttons, button: 0, pointerId: id, pointerType: 'mouse', isPrimary: true, timeStamp: now, target: stage, preventDefault() {} }; }
  async function down() { const h = f.body.layout().hit[0]; await stage.emit('pointerdown', event(h.x, h.y)); return h; }
  async function grab() { const h = await down(); await doc.emit('pointermove', event(h.x + 70, h.y - 90)); assert.equal(f.body.inspect().mode, 'drag'); return h; }
  return { ...f, stage, pageDoc: doc, pageWin: win, host, signals, ctx, event, down, grab, state: () => vm.runInContext('({pressing})', ctx) };
}
const checks = [];
async function check(name, fn) { try { checks.push({ name, passed: true, details: await fn() }); } catch (error) { checks.push({ name, passed: false, error: String(error.stack ?? error) }); } }

await check('Original fork reproduces mismatch: buttons-zero clears page but native press stays and follows', async () => {
  const f = pageFixture(oldSource); const h = await f.grab(); await f.pageDoc.emit('pointermove', f.event(h.x + 140, h.y - 100, 0));
  assert.equal(f.state().pressing, false); assert.equal(f.body.layout().pressing, true); assert.equal(f.body.inspect().mode, 'drag');
  assert.equal(f.signals.at(-1).p.buttons, undefined);
  return { pagePressing: false, nativePressing: true, mode: 'drag', missingReleaseReproduced: true };
});
await check('Patched fork sends cancel on observed buttons-zero; native body releases', async () => {
  const f = pageFixture(newSource); const h = await f.grab(); await f.pageDoc.emit('pointermove', f.event(h.x + 140, h.y - 100, 0));
  assert.equal(f.state().pressing, false); assert.equal(f.body.layout().pressing, false); assert.equal(f.body.inspect().mode, 'air');
  assert.ok(f.signals.some(s => s.type === 'cancel' && s.p.reason === 'move-buttons-zero'));
  assert.equal(f.signals.at(-1).p.buttons, 0); assert.equal(f.ctl.pet.vx, 0);
  return { signals: f.signals, release: f.body.inspect().pointer.lastRelease };
});
await check('Thirty seconds holding still with buttons down does not time out or release', async () => {
  const f = pageFixture(newSource); const h = await f.grab();
  for (let i = 0; i < 600; i++) f.body.step(.05);
  await f.pageDoc.emit('pointermove', f.event(h.x + 72, h.y - 90, 1, 1, 32000));
  assert.equal(f.body.inspect().mode, 'drag'); assert.equal(f.body.layout().pressing, true);
  return { simulatedSeconds: 30, mode: f.body.inspect().mode };
});
await check('Window-level release outside the stage retains the normal throw path', async () => {
  const f = pageFixture(newSource); const h = await f.grab();
  await f.pageDoc.emit('pointermove', f.event(610, h.y - 100, 1));
  await f.pageWin.emit('pointerup', f.event(620, h.y - 100, 0));
  assert.equal(f.body.layout().pressing, false); assert.equal(f.body.inspect().mode, 'air');
  assert.ok(f.events.some(e => e.kind === 'touch' && e.detail.kind === 'throw'));
  return { mode: f.body.inspect().mode, events: f.events };
});
for (const [name, target, type] of [['lost capture', 'stage', 'lostpointercapture'], ['window cancel', 'pageWin', 'pointercancel'], ['window blur', 'pageWin', 'blur']]) {
  await check(`${name} ends a held body once without throwing`, async () => {
    const f = pageFixture(newSource); const h = await f.grab(); const foot = f.ctl.toStage(128, 256);
    await f[target].emit(type, type === 'blur' ? {} : f.event(h.x + 70, h.y - 90, 0));
    assert.equal(f.body.layout().pressing, false); assert.equal(f.body.inspect().mode, 'air');
    assert.equal(f.signals.filter(s => s.type === 'cancel').length, 1); assert.equal(f.ctl.pet.vx, 0);
    assert.ok(Math.abs(f.ctl.pet.fy - Math.min(350, foot.y)) < 1e-7);
    await f.pageWin.emit('pointerup', f.event(h.x + 70, h.y - 90, 0));
    assert.equal(f.signals.filter(s => s.type === 'cancel' || s.type === 'up').length, 1);
    return { lastRelease: f.body.inspect().pointer.lastRelease };
  });
}
await check('Hidden desktop window cancels, even if document itself remains visible', async () => {
  const f = pageFixture(newSource); await f.grab(); f.host.shown(false);
  assert.equal(f.body.layout().pressing, false); assert.equal(f.body.inspect().mode, 'air');
});
await check('Unrelated pointer cannot release the active mouse drag', async () => {
  const f = pageFixture(newSource); const h = await f.grab();
  await f.pageDoc.emit('pointermove', f.event(h.x, h.y, 0, 2)); await f.pageWin.emit('pointerup', f.event(h.x, h.y, 0, 2));
  assert.equal(f.body.layout().pressing, true); assert.equal(f.body.inspect().mode, 'drag');
});
await check('Leaving the window while held does not release; a later up does', async () => {
  const f = pageFixture(newSource); const h = await f.grab(); await f.pageDoc.emit('pointerleave', {});
  assert.equal(f.body.layout().pressing, true); await f.pageWin.emit('pointerup', f.event(h.x + 70, h.y - 90, 0));
  assert.equal(f.body.layout().pressing, false);
});
await check('Legacy messages without buttons remain held; explicit zero recovers', async () => {
  const f = fixture(), h = f.body.layout().hit[0];
  f.body.pointer('down', { ...h, t: 1000 }); f.body.pointer('move', { x: h.x + 70, y: h.y - 90, t: 1020 }); f.body.step(0);
  f.body.pointer('move', { x: h.x + 75, y: h.y - 90, t: 1030 }); assert.equal(f.body.layout().pressing, true);
  f.body.pointer('move', { x: h.x + 75, y: h.y - 90, t: 1040, buttons: 0 }); assert.equal(f.body.layout().pressing, false);
});
await check('A normal click still emits poke and a cancelled click emits none', async () => {
  const f = pageFixture(newSource), h = await f.down(); await f.pageWin.emit('pointerup', f.event(h.x, h.y, 0));
  assert.ok(f.events.some(e => e.kind === 'touch' && e.detail.kind === 'poke'));
  const g = pageFixture(newSource); await g.down(); await g.pageWin.emit('blur', {});
  assert.ok(!g.events.some(e => e.kind === 'touch' && e.detail.kind === 'poke'));
});
await check('Cross-display follow resolves before release, then native press is cleared', async () => {
  const f = pageFixture(newSource); await f.grab(); let finish;
  f.host.followCursor = () => new Promise(r => { finish = r; });
  await f.pageDoc.emit('pointermove', f.event(640, 180, 1));
  const releasing = f.pageWin.emit('pointerup', f.event(640, 180, 0));
  assert.equal(f.body.layout().pressing, true);
  finish({ x: 40, y: 180, w: 600, h: 400, dx: -600, dy: 0 }); await releasing;
  assert.ok(f.signals.some(s => s.type === 'shift')); assert.equal(f.body.layout().pressing, false);
});
await check('Blur cancels an explicit release waiting for cross-display IPC', async () => {
  const f = pageFixture(newSource); await f.grab(); let finish;
  f.host.followCursor = () => new Promise(r => { finish = r; });
  await f.pageDoc.emit('pointermove', f.event(640, 180, 1));
  const releasing = f.pageWin.emit('pointerup', f.event(640, 180, 0));
  await f.pageWin.emit('blur', {});
  assert.equal(f.body.layout().pressing, false); assert.equal(f.body.inspect().mode, 'air');
  finish({ x: 40, y: 180, w: 600, h: 400, dx: -600, dy: 0 }); await releasing;
  assert.equal(f.signals.filter(s => s.type === 'shift' || s.type === 'up').length, 0);
});
await check('A cancelled old cross-display follow cannot shift a newly held body', async () => {
  const f = pageFixture(newSource); await f.grab(); let finish;
  f.host.followCursor = () => new Promise(r => { finish = r; });
  await f.pageDoc.emit('pointermove', f.event(640, 180, 1));
  await f.pageWin.emit('blur', {}); f.body.step(0); await f.down();
  assert.equal(f.body.layout().pressing, true);
  const before = f.body.layout().x;
  finish({ x: 40, y: 180, w: 600, h: 400, dx: -600, dy: 0 });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.signals.filter(s => s.type === 'shift').length, 0); assert.equal(f.body.layout().x, before);
  assert.equal(f.body.layout().pressing, true);
});
const files = ['host-fix/pet-app.base.js', 'host-fix/pet-app.js', 'host-fix/pointer-lifecycle.contract.mjs', 'runtime/host-adapter.js', 'preview-host/vendor/coopanion/web/kit/body.js'];
const sourceHashes = {};
for (const path of files) sourceHashes[path] = hash(await readFile(resolve(root, path)));
const report = { checkedAt: new Date().toISOString(), passed: checks.every(c => c.passed), scope: 'Synthetic CPU events execute the exact extracted old/new desktop page pointer handlers and unchanged native createPet through the character adapter. No browser, OS capture, real desktop or trusted-event claim.', baseRepository: 'YuZhou0311/Coopanion', basePath: 'packages/cortico-world-desktop-pet/web/pet-app.js', baseGitBlobSha: 'ddd0a6a8bc6b35d345b9bea03bdedfa8d99b7d6d', sourceHashes, checks };
const directory = resolve(root, 'docs/qa/drag-release-v1_3_1'); await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, 'cpu-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, count: checks.length, failures: checks.filter(c => !c.passed), report: 'docs/qa/drag-release-v1_3_1/cpu-report.json' }));
if (!report.passed) process.exitCode = 1;
