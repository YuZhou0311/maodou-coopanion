/**
 * Original, character-independent PNG atlas renderer. No authored head, rig,
 * motion clock, generated geometry, or Cubism binary is included here.
 *
 * Coordinates: xy and view=[left,top,right,bottom] use top-left, y-down model
 * space. All UVs are normalized, top-left atlas coordinates. page is 0 (main
 * artwork) or 1 (expression canvas), constant throughout each part. All UVs
 * sample that same page; premultiplied texels are mixed before compositing.
 *
 * Each part: {id,xy,uv,indices,uv2?,mix?,alpha?,vertexAlpha?,page?,z?,visible?,
 *            rootUV?,rootUV2?,rootMix?,rootWeight?,
 *            maskOnly?,clip?:{mask,mode:'inside'|'outside',strength?:1}}.
 * xy and UVs are flat Float32Array or numeric arrays. mix, rootMix and
 * rootWeight accept scalars or one value per vertex; their defaults are zero.
 * vertexAlpha is one value per vertex. indices is a triangle
 * list local to the part. Topology is static until setScene/updatePart(indices).
 * Borrowed Float32Arrays may be edited in place; prepare checks finite values.
 *
 * Optional rootUV/rootUV2 sample a shared material from the same page. rootUV
 * defaults to uv; rootUV2 defaults to rootUV. rootMix blends those two samples,
 * and rootWeight replaces only the original surface RGB. Source RGB is first
 * unpremultiplied, then multiplied by the ORIGINAL surface alpha. Transparent
 * root samples fall back to the original color; geometry, alpha, masks and
 * clipping therefore remain independent of this material correction. The
 * mask pass neither samples nor applies the root material. Six attributes and
 * five varying vectors stay within WebGL 1's minimum portable limits.
 *
 * Up to four masks: {id,parts:[partId,...],coreThreshold?,supportThreshold?}. Source alphas are
 * unioned into RGBA channels in one mask draw. Masks use the source's current
 * geometry, texel blend, alpha and visibility, without recursively applying
 * source clips. An optional coreThreshold in (0,1] maps the UNION's alpha
 * through smoothstep(threshold,1,alpha); 1 accepts only fully opaque pixels.
 * A value such as .995 gives a narrow soft core, not an exact alpha-invariance
 * guarantee. Core sources must be unclipped parts in the real color pass.
 * Alternatively supportThreshold in (0,1] maps smoothstep(0,threshold,alpha).
 * This includes a source's anti-aliased fringe when replacing its foreground
 * coverage. It does not promise invariant alpha at intersecting outer fringes.
 * The same visible, unclipped-source restriction applies. Both thresholds
 * cannot be specified for one mask. A negative uniform encodes support mode.
 * maskOnly keeps an ordinary mask source out of the color pass. A foreground ear
 * occludes the face by its real pixels and z; this module does not invent a
 * turn threshold or make an entire ear transparent to conceal an order pop.
 *
 * Main pass: one indexed draw, including the optional expression page. Optional
 * masks add one draw. The final eight-tap outline uses only the composed alpha,
 * so joins inside an opaque character acquire no extra stroke. Its scissor is
 * a conservative submitted-vertex AABB; the output is fully cleared each frame.
 * render() has no GPU readback, finish(), or getParameter(). The CPU timings
 * include command submission and possible driver stalls, not isolated GPU time.
 *
 * References consulted, implementation written independently:
 * https://registry.khronos.org/webgl/specs/1.0.3/
 * https://docs.live2d.com/en/cubism-editor-manual/performance/
 * https://docs.live2d.com/en/cubism-editor-manual/draworder/
 * https://docs.live2d.com/en/cubism-sdk-manual/ow-sdk-mask-premake/
 * Physics belongs above this renderer, with a separately controlled timestep:
 * https://docs.live2d.com/en/cubism-editor-manual/physics-operation/
 */

const STRIDE = 20;
const STRIDE_BYTES = STRIDE * 4;
const LIMIT_VERTICES = 65535; // Portable Uint16 element buffers, including WebGL 1.
const clamp01 = value => Math.min(1, Math.max(0, value));
const clock = () => globalThis.performance?.now?.() ?? Date.now();
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(label + ' must be finite.');
  return value;
}
function numericArray(value, length, label) {
  if (!Array.isArray(value) && !(ArrayBuffer.isView(value) && !(value instanceof DataView))) {
    throw new TypeError(label + ' must be a numeric array.');
  }
  if (length !== null && value.length !== length) throw new RangeError(label + ' has an unexpected length.');
  for (let i = 0; i < value.length; i++) finiteNumber(value[i], label + '[' + i + ']');
  return value instanceof Float32Array ? value : new Float32Array(value);
}
function scalarOrArray(value, count, label) {
  return typeof value === 'number' ? clamp01(finiteNumber(value, label)) : numericArray(value, count, label);
}
function normalizeView(value) {
  const view = Array.from(numericArray(value, 4, 'view'));
  if (view[2] <= view[0] || view[3] <= view[1]) throw new RangeError('view must have positive width and height.');
  return view;
}
function normalizeOutline(value = {}) {
  if (value === false) return { enabled: false, width: 0, color: [0, 0, 0, 0] };
  const color = Array.from(numericArray(value.color ?? [.49, .34, .39, 1], 4, 'outline.color'), clamp01);
  const width = finiteNumber(value.width ?? 1, 'outline.width');
  if (width < 0) throw new RangeError('outline.width must be nonnegative model units.');
  return { enabled: value.enabled !== false && width > 0 && color[3] > 0, width, color };
}

/** Pure size policy, also usable before creating a canvas. No automatic DPR. */
export function fitBackingSize(width, height, maxEdge = 512) {
  finiteNumber(width, 'width'); finiteNumber(height, 'height'); finiteNumber(maxEdge, 'maxEdge');
  if (width <= 0 || height <= 0 || maxEdge < 1 || maxEdge > 640) {
    throw new RangeError('Positive dimensions and maxEdge in [1,640] are required.');
  }
  const scale = Math.min(1, Math.floor(maxEdge) / Math.max(width, height));
  return [Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale))];
}

/**
 * The actual CPU batch builder used by the renderer. Exported to permit useful
 * offline checks of order, index offsets, UV mixing and invalid-input handling.
 * prepare() reuses buffers; its returned arrays must not be retained as frames.
 */
export function createAtlasBatch(scene = { parts: [], masks: [] }) {
  if (!Array.isArray(scene.parts)) throw new TypeError('scene.parts must be an array.');
  const masks = scene.masks ?? [];
  if (!Array.isArray(masks) || masks.length > 4) throw new RangeError('At most four independent masks are supported.');
  const maskSlots = new Map();
  const maskCoreThresholds = new Float32Array(4); // Zero retains ordinary soft-mask semantics.
  for (const [slot, mask] of masks.entries()) {
    if (typeof mask?.id !== 'string' || !mask.id || maskSlots.has(mask.id) || !Array.isArray(mask.parts)) {
      throw new TypeError('Each mask requires a unique id and a parts array.');
    }
    maskSlots.set(mask.id, slot);
    if (mask.coreThreshold !== undefined) {
      const threshold = finiteNumber(mask.coreThreshold, mask.id + '.coreThreshold');
      if (threshold <= 0 || threshold > 1) throw new RangeError('mask.coreThreshold must be in (0,1].');
      maskCoreThresholds[slot] = threshold;
    }
    if (mask.supportThreshold !== undefined) {
      if (mask.coreThreshold !== undefined) throw new RangeError('A mask cannot specify both coreThreshold and supportThreshold.');
      const threshold = finiteNumber(mask.supportThreshold, mask.id + '.supportThreshold');
      if (threshold <= 0 || threshold > 1) throw new RangeError('supportThreshold must be in (0,1].');
      maskCoreThresholds[slot] = -threshold;
    }
  }
  const parseClip = value => {
    if (value == null || value === false) return null;
    if (typeof value === 'string') value = { mask: value };
    const slot = maskSlots.get(value.mask);
    if (slot === undefined) throw new RangeError('Unknown mask: ' + value.mask);
    const mode = value.mode ?? 'inside';
    if (mode !== 'inside' && mode !== 'outside') throw new RangeError('clip.mode must be inside or outside.');
    return { mask: value.mask, slot, outside: mode === 'outside' ? 1 : 0,
      strength: clamp01(finiteNumber(value.strength ?? 1, 'clip.strength')) };
  };
  const parseIndices = (value, count, label) => {
    if ((!Array.isArray(value) && !ArrayBuffer.isView(value)) || !value.length || value.length % 3) {
      throw new TypeError(label + ' must contain complete triangles.');
    }
    for (const index of value) if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new RangeError(label + ' contains an out-of-range vertex.');
    }
    return new Uint16Array(value); // Own topology: in-place external edits cannot bypass dirty tracking.
  };
  const parts = [], byId = new Map();
  let vertexCount = 0, maskVertexCount = 0;
  for (const input of scene.parts) {
    if (typeof input?.id !== 'string' || !input.id || byId.has(input.id)) throw new TypeError('Parts require unique string ids.');
    const xy = numericArray(input.xy, null, input.id + '.xy');
    if (xy.length < 6 || xy.length % 2) throw new RangeError(input.id + '.xy must contain at least three 2D vertices.');
    const count = xy.length / 2;
    if (vertexCount + count > LIMIT_VERTICES) throw new RangeError('The scene exceeds the portable 65535-vertex budget.');
    const page = input.page ?? 0;
    if (page !== 0 && page !== 1) throw new RangeError('part.page must be 0 or 1.');
    const part = { id: input.id, count, base: vertexCount, ordinal: parts.length, xy,
      uv: numericArray(input.uv, xy.length, input.id + '.uv'),
      uv2: input.uv2 == null ? null : numericArray(input.uv2, xy.length, input.id + '.uv2'),
      mix: scalarOrArray(input.mix ?? 0, count, input.id + '.mix'),
      rootUV: input.rootUV == null ? null : numericArray(input.rootUV, xy.length, input.id + '.rootUV'),
      rootUV2: input.rootUV2 == null ? null : numericArray(input.rootUV2, xy.length, input.id + '.rootUV2'),
      rootMix: scalarOrArray(input.rootMix ?? 0, count, input.id + '.rootMix'),
      rootWeight: scalarOrArray(input.rootWeight ?? 0, count, input.id + '.rootWeight'),
      vertexAlpha: input.vertexAlpha == null ? null : numericArray(input.vertexAlpha, count, input.id + '.vertexAlpha'),
      alpha: clamp01(finiteNumber(input.alpha ?? 1, input.id + '.alpha')), page,
      z: finiteNumber(input.z ?? 0, input.id + '.z'), visible: input.visible !== false,
      maskOnly: input.maskOnly === true, clip: parseClip(input.clip),
      indices: parseIndices(input.indices, count, input.id + '.indices'), maskBits: 0, coreMaskBits: 0, maskBase: 0 };
    vertexCount += count; parts.push(part); byId.set(part.id, part);
  }
  for (const [slot, mask] of masks.entries()) for (const id of new Set(mask.parts)) {
    const part = byId.get(id);
    if (!part) throw new RangeError('Unknown mask source: ' + id);
    if (maskCoreThresholds[slot]) {
      // The mask pass does not recursively clip. Reject sources whose mask
      // coverage could therefore exceed their actually drawn color coverage.
      if (part.maskOnly || part.clip) throw new RangeError('Core mask source must be an unclipped color part: ' + id);
      part.coreMaskBits |= 1 << slot;
    }
    part.maskBits |= 1 << slot;
  }
  for (const part of parts) if (part.maskBits) { part.maskBase = maskVertexCount; maskVertexCount += part.count; }
  const vertexData = new Float32Array(vertexCount * STRIDE);
  const maskVertexData = new Float32Array(maskVertexCount * STRIDE);
  let ordered = parts.slice(), orderDirty = true, topologyDirty = true;
  let indexData = new Uint16Array(0), maskIndexData = new Uint16Array(0);
  let previousMain = [], previousMask = [], indexVersion = 0, maskIndexVersion = 0;
  let preparations = 0;
  const activeMain = [], activeMask = [], invalidParts = [];
  const bounds = [0, 0, 0, 0];

  function updatePart(id, patch) {
    const part = byId.get(id);
    if (!part) throw new RangeError('Unknown part: ' + id);
    if (!patch || typeof patch !== 'object') throw new TypeError('Part patch must be an object.');
    // Validate first, commit together; malformed patches do not leave half-updated parts.
    const next = {};
    for (const name of ['xy', 'uv']) if (own(patch, name)) next[name] = numericArray(patch[name], part.count * 2, id + '.' + name);
    for (const name of ['uv2', 'rootUV', 'rootUV2']) if (own(patch, name)) {
      next[name] = patch[name] == null ? null : numericArray(patch[name], part.count * 2, id + '.' + name);
    }
    if (own(patch, 'vertexAlpha')) next.vertexAlpha = patch.vertexAlpha == null ? null : numericArray(patch.vertexAlpha, part.count, id + '.vertexAlpha');
    for (const name of ['mix', 'rootMix', 'rootWeight']) if (own(patch, name)) {
      next[name] = scalarOrArray(patch[name], part.count, id + '.' + name);
    }
    if (own(patch, 'alpha')) next.alpha = clamp01(finiteNumber(patch.alpha, id + '.alpha'));
    if (own(patch, 'z')) next.z = finiteNumber(patch.z, id + '.z');
    if (own(patch, 'page')) {
      if (patch.page !== 0 && patch.page !== 1) throw new RangeError('part.page must be 0 or 1.');
      next.page = patch.page;
    }
    if (own(patch, 'visible')) next.visible = patch.visible !== false;
    if (own(patch, 'maskOnly')) next.maskOnly = patch.maskOnly === true;
    if (own(patch, 'clip')) next.clip = parseClip(patch.clip);
    if (own(patch, 'indices')) next.indices = parseIndices(patch.indices, part.count, id + '.indices');
    if (part.coreMaskBits && ((next.maskOnly ?? part.maskOnly) || (own(next, 'clip') ? next.clip : part.clip))) {
      throw new RangeError('Core mask source must remain an unclipped color part: ' + id);
    }
    if (own(next, 'z') && next.z !== part.z) orderDirty = true;
    if (own(next, 'indices')) topologyDirty = true;
    Object.assign(part, next);
    return api;
  }
  const sameParts = (a, b) => a.length === b.length && a.every((part, i) => part === b[i]);
  function indicesFor(list, baseName) {
    const out = new Uint16Array(list.reduce((count, part) => count + part.indices.length, 0));
    let at = 0;
    for (const part of list) for (const index of part.indices) out[at++] = part[baseName] + index;
    return out;
  }
  function prepare() {
    if (orderDirty) { ordered = parts.slice().sort((a, b) => a.z - b.z || a.ordinal - b.ordinal); orderDirty = false; }
    activeMain.length = 0; activeMask.length = 0; invalidParts.length = 0;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    let needsMasks = false, writtenVertices = 0;
    for (const part of ordered) {
      if (!part.visible || part.alpha <= .001 || (part.maskOnly && !part.maskBits)) continue;
      const uv2 = part.uv2 ?? part.uv;
      const rootUV = part.rootUV ?? part.uv, rootUV2 = part.rootUV2 ?? rootUV;
      let valid = true, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < part.count; i++) {
        const j = i * 2, at = (part.base + i) * STRIDE;
        const x = part.xy[j], y = part.xy[j + 1], u = part.uv[j], v = part.uv[j + 1], u2 = uv2[j], v2 = uv2[j + 1];
        const mix = typeof part.mix === 'number' ? part.mix : part.mix[i];
        const ru = rootUV[j], rv = rootUV[j + 1], ru2 = rootUV2[j], rv2 = rootUV2[j + 1];
        const rootMix = typeof part.rootMix === 'number' ? part.rootMix : part.rootMix[i];
        const rootWeight = typeof part.rootWeight === 'number' ? part.rootWeight : part.rootWeight[i];
        const alpha = part.alpha * (part.vertexAlpha ? part.vertexAlpha[i] : 1);
        if (!Number.isFinite(x + y + u + v + u2 + v2 + mix + alpha + ru + rv + ru2 + rv2 + rootMix + rootWeight)) {
          valid = false; break;
        }
        vertexData[at] = x; vertexData[at + 1] = y;
        vertexData[at + 2] = u; vertexData[at + 3] = v;
        vertexData[at + 4] = u2; vertexData[at + 5] = v2;
        vertexData[at + 6] = clamp01(alpha); vertexData[at + 7] = part.page;
        vertexData[at + 8] = clamp01(mix); vertexData[at + 9] = part.clip?.outside ?? 0;
        for (let k = 0; k < 4; k++) vertexData[at + 10 + k] = part.clip?.slot === k ? part.clip.strength : 0;
        vertexData[at + 14] = ru; vertexData[at + 15] = rv;
        vertexData[at + 16] = ru2; vertexData[at + 17] = rv2;
        vertexData[at + 18] = clamp01(rootMix); vertexData[at + 19] = clamp01(rootWeight);
        if (part.maskBits) {
          const mt = (part.maskBase + i) * STRIDE;
          for (let k = 0; k < 9; k++) maskVertexData[mt + k] = vertexData[at + k];
          maskVertexData[mt + 9] = 0;
          for (let k = 0; k < 4; k++) maskVertexData[mt + 10 + k] = (part.maskBits >> k) & 1;
          // Root material changes RGB only. Keep its mask attributes zero and
          // let MASK_FRAGMENT use the original surface alpha without sampling it.
        }
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      if (!valid) { invalidParts.push(part.id); continue; }
      writtenVertices += part.count;
      if (part.maskBits) activeMask.push(part);
      if (!part.maskOnly) {
        activeMain.push(part); needsMasks ||= !!part.clip?.strength;
        left = Math.min(left, minX); top = Math.min(top, minY); right = Math.max(right, maxX); bottom = Math.max(bottom, maxY);
      }
    }
    if (topologyDirty || !sameParts(activeMain, previousMain)) {
      indexData = indicesFor(activeMain, 'base'); previousMain = activeMain.slice(); indexVersion++;
    }
    if (topologyDirty || !sameParts(activeMask, previousMask)) {
      maskIndexData = indicesFor(activeMask, 'maskBase'); previousMask = activeMask.slice(); maskIndexVersion++;
    }
    topologyDirty = false; preparations++;
    bounds[0] = left; bounds[1] = top; bounds[2] = right; bounds[3] = bottom;
    return { vertexData, maskVertexData, indexData, maskIndexData, indexVersion, maskIndexVersion,
      maskCoreThresholds, needsMasks, bounds: activeMain.length ? bounds : null, invalidParts,
      visibleParts: activeMain.length, maskParts: activeMask.length, writtenVertices };
  }
  const api = { updatePart, prepare,
    inspect: () => ({ parts: parts.length, vertices: vertexCount, maskVertices: maskVertexCount,
      masks: masks.map(mask => mask.id), strideFloats: STRIDE, preparations,
      coreThresholds: Array.from(maskCoreThresholds),
      mainOrder: previousMain.map(part => part.id), maskSources: previousMask.map(part => part.id) }) };
  return api;
}

const MESH_VERTEX = `
precision highp float;
attribute vec2 aPosition;
attribute vec4 aUV;
attribute vec4 aStyle;
attribute vec4 aMask;
attribute vec4 aRootUV;
attribute vec2 aRootStyle;
uniform vec4 uView;
varying vec4 vUV;
varying vec4 vStyle;
varying vec4 vMask;
varying vec4 vRootUV;
varying vec2 vRootStyle;
void main() {
  vec2 p = (aPosition - uView.xy) * uView.zw;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
  vUV = aUV; vStyle = aStyle; vMask = aMask;
  vRootUV = aRootUV; vRootStyle = aRootStyle;
}`;
const SAMPLE_ART = `
uniform sampler2D uAtlas;
uniform sampler2D uExpression;
varying vec4 vUV;
varying vec4 vStyle;
varying vec4 vMask;
vec4 artwork(vec2 uv) {
  if (vStyle.y < 0.5) return texture2D(uAtlas, uv);
  return texture2D(uExpression, uv);
}
vec4 surface() {
  vec4 color = artwork(vUV.xy);
  if (vStyle.z > 0.00001) color = mix(color, artwork(vUV.zw), vStyle.z);
  return color * vStyle.x;
}`;
const MAIN_FRAGMENT = SAMPLE_ART + `
varying vec4 vRootUV;
varying vec2 vRootStyle;
uniform sampler2D uMasks;
uniform vec2 uPixelInv;
uniform vec4 uCoreThresholds;
void main() {
  vec4 color = surface();
  if (vRootStyle.y > 0.00001 && color.a > 0.0) {
    vec4 root = artwork(vRootUV.xy);
    if (vRootStyle.x > 0.00001) root = mix(root, artwork(vRootUV.zw), vRootStyle.x);
    // Reconstruct the shared material's RGB, preserving the original coverage.
    // An empty source texel is not a black material: retain the original color.
    if (root.a > 0.00001) color.rgb = mix(color.rgb, root.rgb / root.a * color.a, vRootStyle.y);
  }
  float strength = dot(vMask, vec4(1.0));
  if (strength > 0.00001) {
    float coverage = dot(texture2D(uMasks, gl_FragCoord.xy * uPixelInv), vMask) / strength;
    // Threshold after channel union, never each source separately: overlapping
    // translucent color sources can legitimately form a fully opaque core.
    float core = dot(uCoreThresholds, vMask) / strength;
    if (core < 0.0) {
      coverage = smoothstep(0.0, -core, coverage);
    } else if (core > 0.0) {
      if (core >= 1.0) coverage = step(1.0, coverage);
      else coverage = smoothstep(core, 1.0, coverage);
    }
    if (vStyle.w > 0.5) coverage = 1.0 - coverage;
    color *= mix(1.0, coverage, strength);
  }
  gl_FragColor = color;
}`;
const MASK_FRAGMENT = SAMPLE_ART + `
void main() { gl_FragColor = vMask * surface().a; }
`;
const QUAD_VERTEX = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUV;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); vUV = aPosition * 0.5 + 0.5; }
`;
const OUTLINE_FRAGMENT = `
uniform sampler2D uColor;
uniform vec2 uStep;
uniform vec4 uOutline;
varying vec2 vUV;
void main() {
  vec4 base = texture2D(uColor, vUV);
  if (base.a == 1.0) { gl_FragColor = base; return; }
  float a = base.a;
  a = max(a, texture2D(uColor, vUV + vec2(uStep.x, 0.0)).a);
  a = max(a, texture2D(uColor, vUV - vec2(uStep.x, 0.0)).a);
  a = max(a, texture2D(uColor, vUV + vec2(0.0, uStep.y)).a);
  a = max(a, texture2D(uColor, vUV - vec2(0.0, uStep.y)).a);
  vec2 d = uStep * 0.70710678118;
  a = max(a, texture2D(uColor, vUV + d).a);
  a = max(a, texture2D(uColor, vUV - d).a);
  a = max(a, texture2D(uColor, vUV + vec2(d.x, -d.y)).a);
  a = max(a, texture2D(uColor, vUV + vec2(-d.x, d.y)).a);
  // Stroke only newly covered alpha. A uniformly translucent interior must
  // not acquire the outline color merely because its base alpha is below one.
  float edge = max(0.0, a - base.a) * uOutline.a;
  gl_FragColor = base + vec4(uOutline.rgb * edge, edge);
}`;

/**
 * Owns this canvas's GL context. No other renderer may mutate the same context.
 * Atlas sources are decoded HTML images or 2D canvases/OffscreenCanvases; keep
 * them alive for context restoration. Canvas uploads use premultiplied alpha.
 * For a mutable expression canvas, call setExpressionAtlas(canvas,{version})
 * only after its pixels change. Reusing the same version performs no upload.
 * resize receives requested backing pixels and preserves the requested ratio.
 */
export function createAtlasRenderer(canvas, options = {}) {
  if (!canvas?.getContext || !canvas?.addEventListener) throw new TypeError('A canvas with WebGL context events is required.');
  let view = normalizeView(options.view ?? [0, 0, 1, 1]);
  let maxEdge = options.maxEdge ?? 512;
  fitBackingSize(1, 1, maxEdge);
  let outline = normalizeOutline(options.outline);
  const attributes = { alpha: true, premultipliedAlpha: true, antialias: false,
    depth: false, stencil: false, preserveDrawingBuffer: options.preserveDrawingBuffer === true,
    powerPreference: options.powerPreference ?? 'high-performance' };
  let gl = null, gl2 = false;
  if (options.webgl !== 1) { gl = canvas.getContext('webgl2', attributes); gl2 = !!gl; }
  if (!gl) gl = canvas.getContext('webgl', attributes);
  if (!gl) throw new Error('WebGL is unavailable; the atlas renderer could not be created.');
  let batch = createAtlasBatch();
  let resources = null, disposed = false, lost = false, width = 0, height = 0;
  let requestedWidth = canvas.width || 1, requestedHeight = canvas.height || 1;
  let currentIndexVersion = -1, currentMaskIndexVersion = -1;
  const uploads = [{ source: null, version: null }, { source: null, version: null }];
  const invalidReported = new Set();
  const stats = { frames: 0, contextLosses: 0, contextRestores: 0, resourceBuilds: 0,
    resizes: 0, atlasUploads: 0, expressionUploads: 0, textureUploadBytes: 0,
    bufferUploadBytes: 0, lastBufferUploadBytes: 0, lastCpuMilliseconds: 0, lastPackMilliseconds: 0,
    lastDrawCalls: { mask: 0, main: 0, outline: 0, total: 0 },
    lastVisibleParts: 0, lastInvalidParts: [], lastBounds: null, lastPostRectangle: null,
    lastError: null, errors: [], capabilities: null };
  function notify(callback, value) {
    if (typeof callback !== 'function') return;
    try { callback(value); } catch (error) { stats.lastError = 'Renderer callback: ' + error.message; }
  }
  function reportError(error) {
    const message = String(error?.message ?? error);
    stats.lastError = message; stats.errors.push(message);
    if (stats.errors.length > 12) stats.errors.shift();
    notify(options.onError, error instanceof Error ? error : new Error(message));
  }
  function assertUsable() { if (disposed) throw new Error('The atlas renderer is disposed.'); }
  function shaderSource(source, fragment, highPrecision) {
    let result = (fragment ? `precision ${highPrecision ? 'highp' : 'mediump'} float;\n` : '') + source;
    // Matching varying precision also permits the WebGL 1 mediump fallback;
    // vertex arithmetic itself remains highp for stable model coordinates.
    result = result.replace(/\bvarying\s+/g, `varying ${highPrecision ? 'highp' : 'mediump'} `);
    if (gl2) {
      result = result.replace(/\battribute\b/g, 'in').replace(/\bvarying\b/g, fragment ? 'in' : 'out')
        .replace(/\btexture2D\b/g, 'texture').replace(/\bgl_FragColor\b/g, 'fragmentColor');
      result = '#version 300 es\n' + (fragment ? 'out highp vec4 fragmentColor;\n' : '') + result;
    }
    return result;
  }
  function program(vertex, fragment, highPrecision) {
    const shaders = [], object = gl.createProgram();
    if (!object) throw new Error('Could not allocate a WebGL program.');
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, shaderSource(vertex, false, highPrecision)],
        [gl.FRAGMENT_SHADER, shaderSource(fragment, true, highPrecision)]]) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Could not allocate a WebGL shader.');
        shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader compilation: ' + gl.getShaderInfoLog(shader));
        gl.attachShader(object, shader);
      }
      for (const [index, name] of ['aPosition', 'aUV', 'aStyle', 'aMask', 'aRootUV', 'aRootStyle'].entries()) {
        gl.bindAttribLocation(object, index, name);
      }
      gl.linkProgram(object);
      if (!gl.getProgramParameter(object, gl.LINK_STATUS)) throw new Error('Shader link: ' + gl.getProgramInfoLog(object));
      const uniforms = {};
      for (const name of ['uView', 'uAtlas', 'uExpression', 'uMasks', 'uPixelInv', 'uCoreThresholds', 'uColor', 'uStep', 'uOutline']) {
        uniforms[name] = gl.getUniformLocation(object, name);
      }
      return { object, uniforms };
    } catch (error) { gl.deleteProgram(object); throw error; }
    finally { for (const shader of shaders) gl.deleteShader(shader); }
  }
  function newTexture() {
    const texture = gl.createTexture();
    if (!texture) throw new Error('Could not allocate a texture.');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return { texture, width: 1, height: 1 };
  }
  function newBuffer() {
    const object = gl.createBuffer();
    if (!object) throw new Error('Could not allocate a buffer.');
    return { object, capacity: 0 };
  }
  function target() {
    const image = newTexture(), framebuffer = gl.createFramebuffer();
    if (!framebuffer) { gl.deleteTexture(image.texture); throw new Error('Could not allocate a framebuffer.'); }
    return { ...image, framebuffer };
  }
  function destroyResources() {
    const r = resources; resources = null;
    if (!r || lost) return;
    for (const p of [r.main, r.mask, r.post]) if (p) gl.deleteProgram(p.object);
    for (const b of [r.vertices, r.elements, r.maskVertices, r.maskElements, r.quad]) if (b) gl.deleteBuffer(b.object);
    for (const t of [...r.atlases, r.colorTarget, r.maskTarget]) if (t) {
      gl.deleteTexture(t.texture); if (t.framebuffer) gl.deleteFramebuffer(t.framebuffer);
    }
  }
  function buildResources() {
    const highPrecision = gl2 || !!gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision;
    stats.capabilities = { webgl: gl2 ? 2 : 1, fragmentHighPrecision: highPrecision,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      contextAttributes: gl.getContextAttributes() };
    if (stats.capabilities.maxTextureUnits < 3) throw new Error('Three fragment texture units are required.');
    const r = resources = { atlases: [] };
    try {
      r.main = program(MESH_VERTEX, MAIN_FRAGMENT, highPrecision);
      r.mask = program(MESH_VERTEX, MASK_FRAGMENT, highPrecision);
      r.post = program(QUAD_VERTEX, OUTLINE_FRAGMENT, highPrecision);
      r.vertices = newBuffer(); r.elements = newBuffer();
      r.maskVertices = newBuffer(); r.maskElements = newBuffer(); r.quad = newBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, r.quad.object);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      r.quad.capacity = 24;
      r.atlases.push(newTexture()); r.atlases.push(newTexture());
      r.colorTarget = target(); r.maskTarget = target();
      currentIndexVersion = -1; currentMaskIndexVersion = -1;
      stats.resourceBuilds++;
      resizeTargets(true);
      for (let page = 0; page < 2; page++) if (uploads[page].source) upload(page, uploads[page].source, uploads[page].version, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } catch (error) { destroyResources(); throw error; }
  }
  function resizeTargets(force = false) {
    if (!resources || lost) return;
    for (const t of [resources.colorTarget, resources.maskTarget]) {
      if (!force && t.width === width && t.height === height) continue;
      gl.bindTexture(gl.TEXTURE_2D, t.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      t.width = width; t.height = height;
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('The render target is incomplete.');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function sourceSize(source) {
    // ImageBitmap ignores WebGL unpack flags. Require a canvas conversion first
    // rather than silently assuming the bitmap's alpha premultiplication mode.
    if (Object.prototype.toString.call(source) === '[object ImageBitmap]') {
      throw new TypeError('Copy ImageBitmap into a 2D canvas before atlas upload.');
    }
    const w = source?.naturalWidth ?? source?.width, h = source?.naturalHeight ?? source?.height;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) throw new TypeError('Atlas image/canvas must be decoded and nonempty.');
    if (w > stats.capabilities.maxTextureSize || h > stats.capabilities.maxTextureSize) throw new RangeError('Atlas exceeds MAX_TEXTURE_SIZE.');
    return [w, h];
  }
  function upload(page, source, version, force = false) {
    assertUsable(); const [w, h] = sourceSize(source), prior = uploads[page];
    if (!force && version !== undefined && prior.source === source && prior.version === version) return false;
    uploads[page] = { source, version };
    if (lost || !resources) return false;
    const t = resources.atlases[page];
    try {
      gl.activeTexture(gl.TEXTURE0 + page); gl.bindTexture(gl.TEXTURE_2D, t.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      if (t.width === w && t.height === h) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); t.width = w; t.height = h; }
      if (page) stats.expressionUploads++; else stats.atlasUploads++;
      stats.textureUploadBytes += w * h * 4;
      return true;
    } catch (error) { uploads[page] = prior; reportError(error); throw error; }
  }
  function resize(w, h, settings = {}) {
    assertUsable(); const nextEdge = settings.maxEdge ?? maxEdge;
    const [nextW, nextH] = fitBackingSize(w, h, nextEdge);
    requestedWidth = w; requestedHeight = h; maxEdge = nextEdge;
    if (nextW === width && nextH === height) return false;
    width = nextW; height = nextH;
    canvas.width = width; canvas.height = height;
    stats.resizes++;
    if (resources && !lost) resizeTargets();
    return true;
  }
  function bufferUpload(targetType, buffer, data) {
    gl.bindBuffer(targetType, buffer.object);
    if (!data.byteLength) return;
    if (buffer.capacity < data.byteLength) {
      buffer.capacity = 2 ** Math.ceil(Math.log2(Math.max(256, data.byteLength)));
      gl.bufferData(targetType, buffer.capacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(targetType, 0, data);
    stats.lastBufferUploadBytes += data.byteLength; stats.bufferUploadBytes += data.byteLength;
  }
  function meshAttributes(vertexBuffer, elementBuffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer.object);
    for (const [index, size, offset] of [[0, 2, 0], [1, 4, 2], [2, 4, 6], [3, 4, 10], [4, 4, 14], [5, 2, 18]]) {
      gl.enableVertexAttribArray(index); gl.vertexAttribPointer(index, size, gl.FLOAT, false, STRIDE_BYTES, offset * 4);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer.object);
  }
  function useMesh(programInfo) {
    gl.useProgram(programInfo.object);
    const u = programInfo.uniforms;
    gl.uniform4f(u.uView, view[0], view[1], 1 / (view[2] - view[0]), 1 / (view[3] - view[1]));
    gl.uniform1i(u.uAtlas, 0); gl.uniform1i(u.uExpression, 1);
  }
  function clearTarget(framebuffer) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, width, height); gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  }
  function postRectangle(bounds) {
    if (!bounds) return [0, 0, 0, 0];
    const sx = width / (view[2] - view[0]), sy = height / (view[3] - view[1]);
    const padX = Math.ceil(outline.width * sx) + 2, padY = Math.ceil(outline.width * sy) + 2;
    const x0 = Math.max(0, Math.floor((bounds[0] - view[0]) * sx) - padX);
    const x1 = Math.min(width, Math.ceil((bounds[2] - view[0]) * sx) + padX);
    const y0 = Math.max(0, Math.floor((view[3] - bounds[3]) * sy) - padY);
    const y1 = Math.min(height, Math.ceil((view[3] - bounds[1]) * sy) + padY);
    return [Math.min(width, x0), Math.min(height, y0), Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
  }
  function render() {
    assertUsable();
    if (lost || !resources || !uploads[0].source) return false;
    const began = clock();
    const calls = stats.lastDrawCalls = { mask: 0, main: 0, outline: 0, total: 0 };
    stats.lastBufferUploadBytes = 0;
    try {
      const prepared = batch.prepare(); stats.lastPackMilliseconds = clock() - began;
      stats.lastVisibleParts = prepared.visibleParts;
      stats.lastInvalidParts = prepared.invalidParts.slice();
      stats.lastBounds = prepared.bounds ? prepared.bounds.slice() : null;
      for (const id of prepared.invalidParts) if (!invalidReported.has(id)) {
        invalidReported.add(id); reportError(new Error('Non-finite vertex data; skipped part: ' + id));
      }
      for (const id of invalidReported) if (!prepared.invalidParts.includes(id)) invalidReported.delete(id);
      const r = resources;
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
      gl.blendEquation(gl.FUNC_ADD);
      for (let page = 0; page < 2; page++) {
        gl.activeTexture(gl.TEXTURE0 + page); gl.bindTexture(gl.TEXTURE_2D, r.atlases[page].texture);
      }
      if (prepared.needsMasks) {
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, null);
        clearTarget(r.maskTarget.framebuffer);
        if (prepared.maskIndexData.length) {
          bufferUpload(gl.ARRAY_BUFFER, r.maskVertices, prepared.maskVertexData);
          if (prepared.maskIndexVersion !== currentMaskIndexVersion) {
            bufferUpload(gl.ELEMENT_ARRAY_BUFFER, r.maskElements, prepared.maskIndexData);
            currentMaskIndexVersion = prepared.maskIndexVersion;
          }
          useMesh(r.mask); meshAttributes(r.maskVertices, r.maskElements);
          // Independent channel union: out = src + dst * (1-src).
          gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
          gl.drawElements(gl.TRIANGLES, prepared.maskIndexData.length, gl.UNSIGNED_SHORT, 0); calls.mask = 1;
        }
      }
      clearTarget(outline.enabled ? r.colorTarget.framebuffer : null);
      if (prepared.indexData.length) {
        bufferUpload(gl.ARRAY_BUFFER, r.vertices, prepared.vertexData);
        if (prepared.indexVersion !== currentIndexVersion) {
          bufferUpload(gl.ELEMENT_ARRAY_BUFFER, r.elements, prepared.indexData); currentIndexVersion = prepared.indexVersion;
        }
        useMesh(r.main); meshAttributes(r.vertices, r.elements);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, r.maskTarget.texture);
        gl.uniform1i(r.main.uniforms.uMasks, 2); gl.uniform2f(r.main.uniforms.uPixelInv, 1 / width, 1 / height);
        gl.uniform4fv(r.main.uniforms.uCoreThresholds, prepared.maskCoreThresholds);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawElements(gl.TRIANGLES, prepared.indexData.length, gl.UNSIGNED_SHORT, 0); calls.main = 1;
      }
      if (outline.enabled) {
        clearTarget(null); const rectangle = postRectangle(prepared.bounds); stats.lastPostRectangle = rectangle;
        if (rectangle[2] && rectangle[3]) {
          gl.enable(gl.SCISSOR_TEST); gl.scissor(...rectangle);
          gl.disable(gl.BLEND); gl.useProgram(r.post.object);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, r.colorTarget.texture);
          gl.uniform1i(r.post.uniforms.uColor, 0);
          gl.uniform2f(r.post.uniforms.uStep, outline.width / (view[2] - view[0]), outline.width / (view[3] - view[1]));
          gl.uniform4fv(r.post.uniforms.uOutline, outline.color);
          gl.bindBuffer(gl.ARRAY_BUFFER, r.quad.object); gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
          for (let i = 1; i < 6; i++) gl.disableVertexAttribArray(i);
          gl.drawArrays(gl.TRIANGLES, 0, 3); calls.outline = 1;
        }
      } else stats.lastPostRectangle = null;
      stats.frames++;
      return true;
    } catch (error) { reportError(error); return false; }
    finally {
      calls.total = calls.mask + calls.main + calls.outline;
      stats.lastCpuMilliseconds = clock() - began;
      gl.disable(gl.SCISSOR_TEST); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }
  function inspect() {
    return { ...stats, lastDrawCalls: { ...stats.lastDrawCalls }, errors: stats.errors.slice(),
      capabilities: stats.capabilities ? { ...stats.capabilities,
        contextAttributes: { ...stats.capabilities.contextAttributes } } : null,
      lastInvalidParts: stats.lastInvalidParts.slice(), lastBounds: stats.lastBounds?.slice() ?? null,
      lastPostRectangle: stats.lastPostRectangle?.slice() ?? null,
      ready: !disposed && !lost && !!resources && !!uploads[0].source,
      disposed, contextLost: lost, width, height, maxEdge, view: view.slice(),
      outline: { ...outline, color: outline.color.slice(), taps: 8 }, batch: batch.inspect(),
      atlases: uploads.map((record, page) => ({ page, present: !!record.source, version: record.version,
        width: resources?.atlases[page]?.width ?? 0, height: resources?.atlases[page]?.height ?? 0 })),
      timingNote: 'Synchronous CPU packing/submission wall time; not isolated GPU time or a frame-rate guarantee.' };
  }
  function onLost(event) {
    event.preventDefault(); lost = true; resources = null; stats.contextLosses++;
    notify(options.onContextLost, { message: 'WebGL context lost. Retained atlas sources will be re-uploaded on restoration.' });
  }
  function onRestored() {
    if (disposed) return;
    lost = false;
    try { buildResources(); stats.contextRestores++; notify(options.onContextRestored, inspect()); }
    catch (error) { reportError(error); }
  }
  function dispose() {
    if (disposed) return;
    canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored);
    destroyResources(); disposed = true;
    uploads[0].source = null; uploads[1].source = null;
  }
  canvas.addEventListener('webglcontextlost', onLost); canvas.addEventListener('webglcontextrestored', onRestored);
  try { resize(requestedWidth, requestedHeight); buildResources(); }
  catch (error) { canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored); destroyResources(); throw error; }
  const api = {
    setAtlas(source, settings = {}) { return upload(0, source, settings.version); },
    setExpressionAtlas(source, settings = {}) { return upload(1, source, settings.version); },
    setScene(scene) { assertUsable(); const next = createAtlasBatch(scene); batch = next; currentIndexVersion = -1; currentMaskIndexVersion = -1; invalidReported.clear(); return api; },
    updatePart(id, patch) { assertUsable(); batch.updatePart(id, patch); return api; },
    setView(value) { assertUsable(); view = normalizeView(value); return api; },
    setOutline(value) { assertUsable(); outline = normalizeOutline(value); return api; },
    resize, render, inspect, dispose,
  };
  return api;
}
