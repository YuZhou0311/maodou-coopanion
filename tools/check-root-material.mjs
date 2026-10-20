/** Offline contract checks for the optional, alpha-preserving material inputs. */
import assert from 'node:assert/strict';
import { createAtlasBatch } from '../runtime/atlas-renderer.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const triangle = (id, extra = {}) => ({
  id,
  xy: new Float32Array([0, 0, 1, 0, 0, 1]),
  uv: new Float32Array([.1, .2, .3, .2, .1, .4]),
  indices: [0, 1, 2],
  ...extra,
});

// Existing parts opt out. The optional UV fallback follows the original UV
// buffer even after an in-place edit, rather than retaining a stale copy.
const plain = triangle('plain');
const plainBatch = createAtlasBatch({ parts: [plain] });
const stride = plainBatch.inspect().strideFloats;
assert.equal(stride, 20);
let prepared = plainBatch.prepare();
assert.equal(prepared.vertexData.length, 3 * stride);
for (let n = 0; n < 3; n++) {
  const at = n * stride;
  assert.deepEqual(Array.from(prepared.vertexData.slice(at + 14, at + 18)),
    [plain.uv[n * 2], plain.uv[n * 2 + 1], plain.uv[n * 2], plain.uv[n * 2 + 1]]);
  assert.equal(prepared.vertexData[at + 18], 0);
  assert.equal(prepared.vertexData[at + 19], 0);
}
plain.uv[0] = .125;
assert.equal(plainBatch.prepare().vertexData[14], .125);

// The root material can be shared by the rear and foreground mesh. Changing
// it must not change the original alpha, clipping fields, or mask coverage.
const rootUV = new Float32Array([.5, .125, .75, .125, .5, .375]);
const rootUV2 = new Float32Array([.625, .5, .875, .5, .625, .75]);
const rootMix = new Float32Array([0, .4, 1]);
const rootWeight = new Float32Array([-1, .5, 2]);
const ear = triangle('ear', {
  alpha: .4, vertexAlpha: new Float32Array([.25, .75, 1]),
  rootUV, rootUV2, rootMix, rootWeight,
});
const front = triangle('front', {
  rootUV, rootUV2, rootMix, rootWeight,
  clip: { mask: 'solid', mode: 'inside', strength: .8 },
});
const batch = createAtlasBatch({ parts: [ear, front], masks: [{ id: 'solid', parts: ['ear'] }] });
prepared = batch.prepare();
assert.equal(prepared.needsMasks, true);
assert.equal(prepared.vertexData.length, 6 * stride);
assert.equal(prepared.maskVertexData.length, 3 * stride);
const maskBefore = prepared.maskVertexData.slice();
const originalFields = [0, 1, 2, 3, 4, 5].map(n => prepared.vertexData.slice(n * stride, n * stride + 14));
for (let n = 0; n < 3; n++) {
  const at = n * stride;
  close(prepared.vertexData[at + 6], [.1, .3, .4][n]);
  close(prepared.maskVertexData[at + 6], [.1, .3, .4][n]);
  close(prepared.vertexData[at + 18], [0, .4, 1][n]);
  assert.equal(prepared.vertexData[at + 19], [0, .5, 1][n]);
  assert.deepEqual(Array.from(prepared.maskVertexData.slice(at + 14, at + 20)), [0, 0, 0, 0, 0, 0]);
}
rootUV[0] = .375;
rootMix[1] = .875;
rootWeight[1] = .25;
prepared = batch.prepare();
assert.deepEqual(prepared.maskVertexData, maskBefore);
for (let n = 0; n < 6; n++) assert.deepEqual(prepared.vertexData.slice(n * stride, n * stride + 14), originalFields[n]);
for (const base of [0, 3 * stride]) {
  assert.equal(prepared.vertexData[base + 14], .375);
  assert.equal(prepared.vertexData[base + stride + 18], .875);
  assert.equal(prepared.vertexData[base + stride + 19], .25);
}

// Scalar updates, explicit fallback, clamping, and malformed patch rejection.
batch.updatePart('ear', { rootUV2: null, rootMix: 2, rootWeight: .75 });
prepared = batch.prepare();
assert.equal(prepared.vertexData[16], rootUV[0]);
assert.equal(prepared.vertexData[17], rootUV[1]);
assert.equal(prepared.vertexData[18], 1);
assert.equal(prepared.vertexData[19], .75);
assert.throws(() => batch.updatePart('ear', { rootWeight: 0, rootUV: [0, 1] }), /unexpected length/);
assert.equal(batch.prepare().vertexData[19], .75, 'invalid patch must be atomic');
assert.throws(() => batch.updatePart('ear', { rootMix: [0] }), /unexpected length/);
assert.throws(() => batch.updatePart('ear', { rootWeight: Number.NaN }), /finite/);
assert.throws(() => createAtlasBatch({ parts: [triangle('bad', { rootUV2: [0, 1] })] }), /unexpected length/);

// Borrowed root UVs have the same finite-data guard and recovery behavior as
// geometry. Shared invalid input removes both affected parts from both passes.
rootUV[0] = Number.NaN;
prepared = batch.prepare();
assert.deepEqual(prepared.invalidParts, ['ear', 'front']);
assert.equal(prepared.indexData.length, 0);
assert.equal(prepared.maskIndexData.length, 0);
rootUV[0] = .375;
prepared = batch.prepare();
assert.deepEqual(prepared.invalidParts, []);
assert.equal(prepared.indexData.length, 6);
assert.equal(prepared.maskIndexData.length, 3);

console.log('Root material batch contract passed: defaults, shared UVs, alpha/mask invariance, updates, validation, and recovery.');
