#!/usr/bin/env node
/** CPU regression for the shared hood paint; no raster or visual acceptance. */
import assert from 'node:assert/strict';
import { applyHoodMaterial } from '../runtime/hood-material.js';

const cols = 8, rows = 16, stride = cols + 1;
const atlas = { left: .25, right: .55, top: .3, bottom: .55 };
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-6, `${label}: ${a} != ${b}`);
const index = (row, col) => row * stride + col;
const part = raw => {
  const count = raw.length / 2;
  return {
    xy: raw.slice(), uv: new Float32Array(raw.length).fill(.1),
    uv2: new Float32Array(raw.length).fill(.2), mix: new Float32Array(count).fill(.4),
    alpha: .75, vertexAlpha: Float32Array.from({ length: count }, (_, i) => (i % 4) / 3),
    rootUV: new Float32Array(raw.length).fill(NaN),
    rootUV2: new Float32Array(raw.length).fill(NaN),
    rootMix: new Float32Array(count).fill(.7), rootWeight: new Float32Array(count).fill(1),
  };
};
function fixture() {
  const headRaw = new Float32Array(stride * (rows + 1) * 2), frontUV = headRaw.slice();
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
    const u = col / cols, v = row / rows, n = index(row, col) * 2;
    const curve = Math.sin(Math.PI * v), left = 20 + 6 * curve, right = 100 - 4 * curve;
    headRaw[n] = left + (right - left) * u; headRaw[n + 1] = 10 + 80 * v;
    frontUV[n] = atlas.left + (atlas.right - atlas.left) * u;
    frontUV[n + 1] = atlas.top + (atlas.bottom - atlas.top) * v;
  }
  const head = part(headRaw), sharedIndices = [index(4, 0), index(8, cols)];
  const ears = sharedIndices.map((shared, side) => {
    // An attached point, an outboard point, and two free-ear points below the
    // head exercise both spatial sharing and valid zero-weight attributes.
    const raw = new Float32Array([
      headRaw[shared * 2], headRaw[shared * 2 + 1],
      side ? 120 : 0, 55, side ? 125 : -5, 110, side ? 130 : -10, 140,
    ]);
    const p = part(raw); p.rootWeight.set([1, .5, 0, 0]);
    return { part: p, raw };
  });
  return { head, headRaw, ears, frontUV, cols, rows, sharedIndices };
}
function unchangedFields(p) {
  return structuredClone({ xy: p.xy, uv: p.uv, uv2: p.uv2, mix: p.mix, alpha: p.alpha, vertexAlpha: p.vertexAlpha });
}
function run(angle) {
  const f = fixture(), parts = [f.head, ...f.ears.map(e => e.part)];
  const before = parts.map(unchangedFields), rawBefore = [f.headRaw, ...f.ears.map(e => e.raw)].map(a => a.slice());
  const earWeights = f.ears.map(e => e.part.rootWeight.slice()), frontBefore = f.frontUV.slice();
  applyHoodMaterial({ ...f, q: Math.abs(angle) / 75 });

  // This is the user-visible failure that the v1.3.3 q<=.01 opt-out misses.
  for (const shared of f.sharedIndices) {
    assert.ok(f.head.rootWeight[shared] > 0, `hood attachment material must be active at ${angle} degrees`);
    assert.ok(f.head.rootUV[shared * 2] > atlas.left && f.head.rootUV[shared * 2] < atlas.right,
      'attached head edge must sample interior paint, not extend the old boundary texel');
  }
  assert.equal(f.head.rootWeight[index(8, cols / 2)], 0, 'central face paint remains outside the attachment correction');
  for (let side = 0; side < f.ears.length; side++) {
    const ear = f.ears[side].part, shared = f.sharedIndices[side];
    for (const key of ['rootUV', 'rootUV2']) for (let k = 0; k < 2; k++) {
      close(ear[key][k], f.head[key][shared * 2 + k], 'coincident hood and ear material coordinates');
    }
    assert.deepEqual(ear.rootWeight, earWeights[side], 'ear attachment and free-segment weights remain intact');
  }
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    assert.deepEqual(unchangedFields(p), before[i], 'geometry, original texture and alpha must remain unchanged');
    assert.ok(p.rootWeight.some(w => w === 0), 'fixture must exercise zero-weight vertices');
    for (const key of ['rootUV', 'rootUV2']) for (let n = 0; n < p[key].length; n += 2) {
      const u = p[key][n], v = p[key][n + 1];
      assert.ok(Number.isFinite(u) && Number.isFinite(v), `${key}: every vertex needs finite coordinates`);
      assert.ok(u >= atlas.left - 1e-6 && u <= atlas.right + 1e-6 &&
        v >= atlas.top - 1e-6 && v <= atlas.bottom + 1e-6, `${key}: coordinates must stay inside the skin atlas cell`);
    }
    assert.ok(p.rootMix.every(w => w === 0), 'directional edge paint must not enter the shared root field');
  }
  assert.deepEqual([f.headRaw, ...f.ears.map(e => e.raw)], rawBefore, 'sampling must not deform raw geometry');
  assert.deepEqual(f.frontUV, frontBefore, 'source atlas coordinates remain unchanged');
  return parts.map(p => ({ rootUV: p.rootUV, rootUV2: p.rootUV2, rootMix: p.rootMix, rootWeight: p.rootWeight }));
}

const front = run(0), angles = [-75, -45, -1, -.00001, .00001, 1, 45, 75];
for (const angle of angles) {
  const turned = run(angle);
  // Holding geometry fixed isolates material continuity from mesh movement.
  // No angle threshold may switch the painted fabric back to an old seam.
  for (let p = 0; p < front.length; p++) for (const key of Object.keys(front[p])) {
    for (let n = 0; n < front[p][key].length; n++) close(turned[p][key][n], front[p][key][n], `${angle} degrees ${key}`);
  }
}
console.log('Hood material regression passed: front attachment, 9 fixed-geometry yaw samples, shared UVs, zero-weight coordinates, and geometry/alpha/free-ear invariance.');
