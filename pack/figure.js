/** SPDX-License-Identifier: AGPL-3.0-or-later */
import { adaptNativeKit } from '../runtime/host-adapter.js';
import { CUSTOM_WORDS } from '../runtime/words.js';
import { createPaintedFigure } from '../runtime/painted-figure.js';

export async function createMaodouBody(base, opts) {
  const kit = adaptNativeKit(opts.kit);
  const figure = await createPaintedFigure(base, opts);
  let body;
  try { body = kit.createBody(opts.host, { figure, words: CUSTOM_WORDS }); }
  catch (e) { figure.dispose(); throw e; }
  const nativeInspect = body.inspect.bind(body), nativeSet = body.set.bind(body);
  body.inspect = () => ({ ...nativeInspect(), figure: figure.inspect() });
  body.set = (settings = {}) => {
    if (Number.isFinite(settings.renderEdge)) figure.setRenderEdge(settings.renderEdge);
    nativeSet(settings);
  };
  // Optional operator-side instrumentation. The normal native frame installs
  // no hook and sends no diagnostics across its opaque origin boundary.
  globalThis.__maodouQARegister?.(body);
  return body;
}
