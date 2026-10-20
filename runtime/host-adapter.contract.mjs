// CPU contract only: runs the pinned native simulation against recording-only DOM nodes.
// It creates no image, browser, WebGL context, or substitute character.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as nativeKit from '../preview-host/vendor/coopanion/web/kit/body.js';
import { adaptNativeKit, createUnmirroredBody } from './host-adapter.js';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = data => createHash('sha256').update(data).digest('hex');
class NodeRecord {
  constructor(doc, tag) { this.ownerDocument = doc; this.tagName = tag; this.children = []; this.attributes = {}; this.dataset = {}; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this); this.parentNode = null; }
}
function fixture(start = { x: 280, facing: -1 }) {
  const doc = { createElement: tag => new NodeRecord(doc, tag), createElementNS: (_, tag) => new NodeRecord(doc, tag) };
  doc.head = new NodeRecord(doc, 'head'); doc.documentElement = new NodeRecord(doc, 'html');
  const root = new NodeRecord(doc, 'div');
  const events = [], schemes = [], skins = [], sounds = [], frames = [];
  let controller, broken = false, disposed = 0, hitX = 166;
  const figure = {
    draw(_group, _face, frame) { if (broken) throw new Error('injected draw failure'); frames.push(structuredClone(frame)); },
    get extent() { return [34, 32, 222, 256]; },
    get hits() { return [[hitX, 126, 30]]; },
    get anchors() { return { gaze: [128, 118], bubble: [128, 28], tears: [[100, 144], [162, 144]] }; },
    colors: { z: '#667788' },
    setScheme(id, options) { schemes.push({ id, options }); },
    setSkin(skin) { skins.push(skin); },
    dispose() { disposed++; },
  };
  const recordingKit = { ...nativeKit, createPet(...args) { controller = nativeKit.createPet(...args); return controller; } };
  const host = { root, start, bounds: () => ({ W: 600, H: 400, floorY: 350, S: .55 }),
    emit: (kind, detail) => events.push({ kind, detail }), sound: (...s) => sounds.push(s) };
  const body = createUnmirroredBody(recordingKit, host, { figure, roam: 'off', words: { 'small-wave': { motion: { seconds: .8 } } } });
  body.set({ hold: 3600 }); body.step(0);
  return { body, controller, figure, doc, root, events, schemes, skins, sounds, frames,
    breakDraw(v) { broken = v; }, setHitX(v) { hitX = v; }, get disposed() { return disposed; } };
}
const checks = [];
function check(name, fn) {
  try { const details = fn(); checks.push({ name, passed: true, ...(details ? { details } : {}) }); }
  catch (error) { checks.push({ name, passed: false, error: String(error.stack || error) }); }
}
const f = fixture();
check('Facade preserves native exports and is idempotent', () => {
  const kit = adaptNativeKit(nativeKit);
  assert.equal(kit.createRig, nativeKit.createRig); assert.equal(kit.createPet, nativeKit.createPet);
  assert.equal(adaptNativeKit(kit), kit); assert.notEqual(kit.createBody, nativeKit.createBody);
});
check('Default idle remains front despite a left heading', () => {
  assert.equal(f.body.inspect().viewYaw, 0); assert.equal(f.body.inspect().heading, -1);
  assert.equal(f.body.inspect().nativeFacing, -1); assert.ok(f.body.inspect().xf.kx > 0);
});
check('Native mirror zero crossing never collapses the actual transform', () => {
  const sampled = [];
  for (const v of [1, .25, 0, -.25, -1]) {
    f.controller.pet.faceVis = v; f.body.step(0);
    const i = f.body.inspect();
    assert.equal(i.nativeFacing, v); assert.equal(i.frame.facing, v); assert.ok(i.xf.kx > .5);
    sampled.push({ nativeFacing: v, kx: i.xf.kx });
  }
  return sampled;
});
check('Render failure restores the native orientation in finally', () => {
  f.controller.pet.faceVis = -.4; f.breakDraw(true);
  assert.throws(() => f.body.step(0), /injected draw failure/);
  assert.equal(f.controller.pet.faceVis, -.4); f.breakDraw(false); f.body.step(0);
});
check('Raw look and legs survive; screen vectors undo the native local mirror once', () => {
  const p = f.controller.pet; p.facing = -1; p.faceVis = -1; p.look = [3, 2]; p.lean = 4;
  p.feet[0][0] += 9; f.body.step(0);
  const a = f.body.inspect().frame;
  assert.deepEqual(a.look, [3, 2]); assert.deepEqual(a.lookScreen, [-3, 2]);
  assert.equal(a.legsScreen[0][2] - a.legsScreen[0][0], -(a.legs[0][2] - a.legs[0][0]));
  assert.equal(a.lean, -4); assert.equal(a.groupRot, p.tilt - 4);
});
check('Dynamic hits and layout use the same positive transform as drawing', () => {
  f.controller.pet.lean = 0; f.setHitX(190); f.body.step(0);
  const x = f.body.inspect().xf, hit = f.body.layout().hit[0];
  assert.equal(hit.x, x.AX + (190 - x.ax) * x.kx);
  assert.ok(hit.x > x.AX); assert.equal(f.controller.hitPet(hit), true);
  const box = f.body.layout().box;
  assert.ok(hit.x >= box.x && hit.x <= box.x + box.w);
});
check('Explicit yaw moves continuously to a target and marks animation as moving', () => {
  f.body.set({ viewYaw: -1 }); const before = f.body.inspect().viewYaw;
  f.body.step(1 / 60); const first = f.body.inspect().viewYaw;
  assert.ok(Math.abs(first - before) < .05); assert.equal(f.body.layout().moving, true);
  let min = first, max = first;
  for (let i = 0; i < 90; i++) { f.body.step(1 / 60); const v = f.body.inspect().viewYaw; min = Math.min(min, v); max = Math.max(max, v); }
  assert.ok(min >= -1 && max <= 1); assert.ok(Math.abs(f.body.inspect().viewYaw + 1) < .001);
  return { first, final: f.body.inspect().viewYaw };
});
check('Immediate yaw is explicit; invalid values reject without mutating the target', () => {
  f.body.set({ viewYaw: 1, viewYawImmediate: true }); assert.equal(f.body.inspect().viewYaw, 1);
  assert.throws(() => f.body.set({ viewYaw: NaN }), /finite/); assert.equal(f.body.inspect().viewYawOverride, 1);
});
check('Releasing the override returns idle gaze to the intended 15 degree range', () => {
  f.controller.pet.mode = 'idle'; f.controller.pet.look = [5, 0];
  f.body.set({ viewYaw: null, viewYawImmediate: true }); assert.equal(f.body.inspect().viewYaw, -.2);
});
check('Native walk and listening interruption preserve the walk id', () => {
  f.body.walk(450, false, 'contract-walk');
  for (let i = 0; i < 12; i++) f.body.step(1 / 60);
  assert.equal(f.body.inspect().mode, 'walk'); assert.ok(f.body.layout().x > 280);
  assert.equal(f.body.inspect().viewYawTarget, .72);
  f.body.set({ listening: true });
  assert.ok(f.events.some(e => e.kind === 'interrupted' && e.detail.walkId === 'contract-walk'));
  assert.equal(f.controller.pet.listening, true); assert.equal(f.body.inspect().mode, 'idle');
});
check('Scheme, skin, thinking and talk keep the native body contract', () => {
  f.body.setScheme('test', { fade: .4 }); assert.deepEqual(f.schemes.at(-1), { id: 'test', options: { fade: .4 } });
  f.body.set({ skin: { id: 'record' }, thinking: true, theme: 'dark' });
  assert.equal(f.controller.pet.thinking, true); assert.equal(f.doc.documentElement.dataset.theme, 'dark');
  assert.deepEqual(f.skins.at(-1), { id: 'record' }); assert.equal(f.body.z, '#667788');
  f.body.talk(); assert.equal(f.controller.pet.talkK, 1); f.body.step(1 / 60);
  assert.ok(f.body.inspect().frame.talk > .8 && f.body.inspect().frame.talk < 1);
});
check('Only native or explicitly registered words are claimed by the body', () => {
  assert.equal(f.body.words.includes('small-wave'), true); assert.equal(f.body.words.includes('fabricated-word'), false);
  assert.equal(f.body.do('fabricated-word'), false);
});
check('CPU pointer hit follows positive geometry and preserves native timestamps', () => {
  const q = fixture(); const h = q.body.layout().hit[0];
  q.body.pointer('down', { x: h.x, y: h.y, t: 1000 }); q.body.pointer('up', { x: h.x, y: h.y, t: 1100 });
  assert.ok(q.events.some(e => e.kind === 'touch' && e.detail.kind === 'poke'));
  q.body.dispose();
  return { scope: 'Synthetic CPU input only; trusted browser input is pending.' };
});
check('Dispose releases owned nodes and figure once', () => {
  f.body.dispose(); f.body.dispose(); assert.equal(f.disposed, 1);
  assert.equal(f.root.children.length, 0); assert.equal(f.doc.head.children.length, 0);
});

const sources = {};
for (const path of ['runtime/host-adapter.js', 'runtime/host-adapter.contract.mjs', 'preview-host/vendor/coopanion/web/kit/body.js', 'preview-host/vendor/coopanion/web/kit/rig.js']) {
  sources[path] = sha(await readFile(resolve(project, path)));
}
const report = { checkedAt: new Date().toISOString(), scope: 'CPU contract with unchanged native createPet and recording-only DOM shim. No browser, images, WebGL, native importer, trusted pointer or smoothness result.',
  upstreamCommit: '04ce022a8c1e96e6053d9cbbe8f6dc555aa93f33', sourceHashes: sources,
  passed: checks.every(c => c.passed), checks };
const reportFile = resolve(project, 'preview-host/qa/host-adapter-contract.json');
await mkdir(dirname(reportFile), { recursive: true }); await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, checks: checks.length, failed: checks.filter(c => !c.passed), report: reportFile }));
if (!report.passed) process.exitCode = 1;
