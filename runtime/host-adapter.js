/**
 * Maodou's API 2 body adapter. SPDX-License-Identifier: AGPL-3.0-or-later
 * The facade and kit styles follow Pal-AI-Lab/Coopanion web/kit/body.js,
 * pinned at 04ce022a8c1e96e6053d9cbbe8f6dc555aa93f33. Native code is unmodified.
 *
 * This module draws no character. It retains createPet's simulation and uses
 * a positive outer X scale; an authored figure consumes frame.viewYaw instead
 * of inheriting the native mirror/card flip. All coordinates remain logical
 * units before the positive-scale stage transform, not stage pixels.
 */
const ADAPTED = Symbol('maodou.api2.unmirrored');
const SVGNS = 'http://www.w3.org/2000/svg';
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const headingOf = p => p.facing === -1 ? -1 : 1;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const STYLE = `
:root{--shadow:rgba(27,22,38,.12);--tear:#5AAEF0;--heart:#F0567A;--dust:#A39DB0;--skin-eye:#00A870}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--shadow:rgba(0,0,0,.32);--tear:#6BBDF7;--heart:#FF6F93;--dust:#5B6472;--skin-eye:#2FD59B}}
:root[data-theme="dark"]{--shadow:rgba(0,0,0,.32);--tear:#6BBDF7;--heart:#FF6F93;--dust:#5B6472;--skin-eye:#2FD59B}
.shadow{fill:var(--shadow)} .tearf{fill:var(--tear)} .p-heart{stroke:var(--heart)} .p-dust{stroke:var(--dust)} .eye{stroke:var(--skin-eye)}
svg.kit{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible}
`;

/** Wrap options once before createMaodouFigure; do not mutate the host's kit. */
export function adaptNativeKit(nativeKit) {
  if (nativeKit?.[ADAPTED]) return nativeKit;
  if (typeof nativeKit?.createPet !== 'function') {
    throw new TypeError('Maodou requires the native Coopanion API 2 createPet kit');
  }
  const result = { ...nativeKit,
    createBody: (host, opts) => createUnmirroredBody(nativeKit, host, opts),
  };
  Object.defineProperty(result, ADAPTED, { value: true });
  return Object.freeze(result);
}

/**
 * Options retain createBody's figure/words/css/skinCss/roam contract.
 * orientation: { idleYaw:.2, walkYaw:.72, runYaw:.9, turnYaw:.8, omega:12 }
 * Values are signed screen yaw / 75 degrees; default idle is front, gaze ±15°.
 */
export function createUnmirroredBody(nativeKit, host, opts = {}) {
  if (!host?.root?.ownerDocument || typeof host.bounds !== 'function') {
    throw new TypeError('A native API 2 host with root and bounds() is required');
  }
  const figure = opts.figure;
  if (typeof figure?.draw !== 'function') throw new TypeError('figure.draw is required; no placeholder figure is created');
  const doc = host.root.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = STYLE + (opts.css ?? '');
  const skinStyle = doc.createElement('style');
  doc.head.appendChild(style); doc.head.appendChild(skinStyle);
  const svg = doc.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'kit'); svg.setAttribute('aria-hidden', 'true');
  const shadowEl = doc.createElementNS(SVGNS, 'ellipse');
  shadowEl.setAttribute('class', 'shadow');
  for (const name of ['cx', 'cy', 'rx', 'ry']) shadowEl.setAttribute(name, '0');
  const petG = doc.createElementNS(SVGNS, 'g');
  const fxG = doc.createElementNS(SVGNS, 'g');
  svg.appendChild(shadowEl); svg.appendChild(petG); svg.appendChild(fxG);
  host.root.appendChild(svg);

  const start = host.start ?? {};
  let disposed = false, dialogOpen = false, ctl;
  let renderContext = null, renderedFrames = 0, lastFrame = null, lastDt = 0;
  let overrideYaw = null, yaw = 0, yawV = 0, yawTarget = 0;
  let turnUntil = -Infinity, turnHeading = start.facing === -1 ? -1 : 1;
  let previousHeading = turnHeading;
  let activePointerId = null, lastPointer = null, lastRelease = null;
  const o = opts.orientation ?? {};
  const amount = (key, fallback) => Number.isFinite(o[key]) ? clamp(o[key], 0, 1) : fallback;
  const idleYaw = amount('idleYaw', .2), walkYaw = amount('walkYaw', .72);
  const runYaw = amount('runYaw', .9), turnYaw = amount('turnYaw', .8);
  const omega = Number.isFinite(o.omega) ? clamp(o.omega, 2, 30) : 12;

  function resolveYawTarget() {
    if (overrideYaw !== null) return overrideYaw;
    const p = ctl.pet, heading = headingOf(p);
    if (p.mode === 'walk' || p.mode === 'run') return heading * (p.mode === 'run' ? runYaw : walkYaw);
    if (ctl.time < turnUntil) return turnHeading * turnYaw;
    // Preserve the native look gesture's direction; do not invent a second clock.
    const gaze = clamp((p.look[0] || 0) * heading / 5, -1, 1);
    return gaze * (p.mode === 'look' ? turnYaw : idleYaw);
  }

  function advanceYaw(dt) {
    const heading = headingOf(ctl.pet);
    if (heading !== previousHeading) {
      turnHeading = heading; turnUntil = ctl.time + 1.1;
      previousHeading = heading;
    }
    yawTarget = resolveYawTarget();
    // Exact critically damped update for a constant target over this step.
    const d = yaw - yawTarget, b = yawV + omega * d, e = Math.exp(-omega * dt);
    const next = yawTarget + (d + b * dt) * e;
    yawV = (yawV - omega * b * dt) * e;
    yaw = clamp(next, -1, 1);
    if (next !== yaw) yawV = 0;
  }

  function wrappedDraw(group, face, frame) {
    const c = renderContext;
    if (!c) throw new Error('Native draw must run inside the positive-scale adapter');
    const heading = c.heading;
    // Native fields retain their original meaning. Corrected vectors are additional
    // fields, so a figure cannot accidentally mirror a field that was already fixed.
    const lookScreen = [(frame.look?.[0] || 0) * heading, frame.look?.[1] || 0];
    const legsScreen = (frame.legs || []).map(([hx, hy, fx, fy]) => [hx, hy, hx + (fx - hx) * heading, fy]);
    const out = { ...frame,
      facing: c.facing,
      lean: frame.lean * c.facing,
      heading, viewYaw: yaw, viewYawTarget: yawTarget, viewYawOverride: overrideYaw,
      lookScreen, legsScreen,
      swingScreen: (frame.swing || 0) * Math.sign(c.facing || 1),
      dt: lastDt,
    };
    lastFrame = out;
    figure.draw(group, face, out);
  }
  const proxyFigure = new Proxy(figure, {
    get(target, key) {
      if (key === 'draw') return wrappedDraw;
      if (key === 'groupTilt') return (mode, tilt, lean) => {
        const correctedLean = lean * (renderContext?.facing ?? 1);
        return typeof target.groupTilt === 'function'
          ? target.groupTilt(mode, tilt, correctedLean) : tilt + correctedLean;
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  try {
    if (opts.skinCss && start.skin) skinStyle.textContent = opts.skinCss(start.skin);
    ctl = nativeKit.createPet({ petG, shadowEl, fxG }, {
      ...opts, figure: proxyFigure,
      skin: start.skin ?? null, startX: start.x, enter: start.enter,
      bounds: host.bounds, onEvent: host.emit,
      sfx: { play: host.sound }, dialogOpen: () => dialogOpen,
    });
    if (start.facing === 1 || start.facing === -1) ctl.pet.facing = ctl.pet.faceVis = start.facing;
  } catch (error) {
    svg.remove(); style.remove(); skinStyle.remove();
    throw error;
  }

  function render() {
    const facing = ctl.pet.faceVis;
    renderContext = { facing, heading: headingOf(ctl.pet) };
    ctl.pet.faceVis = 1;
    try {
      // This computes pet.xf before draw; layout, hits and particle anchors all
      // retain the SAME actual positive-scale transform after faceVis is restored.
      ctl.render(); renderedFrames++;
    } finally {
      ctl.pet.faceVis = facing;
      renderContext = null;
    }
  }
  const pointerMatches = p => activePointerId === null || p?.pointerId == null || p.pointerId === activePointerId;
  const validPoint = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);
  function endPointer(p, reason, cancel = false) {
    if (!pointerMatches(p)) return false;
    const wasPressing = ctl.pressing, wasDragging = ctl.pet.mode === 'drag';
    if (cancel) {
      // A lost capture/focus or an observed buttons=0 is not an intentional
      // fling. Clear the native press without inventing a poke or old velocity.
      // dropAt uses a 220*S scruff-to-feet offset; preserve the actual foot point.
      const foot = ctl.toStage(128, 256), S = ctl.bounds.S;
      ctl.dropAt(wasDragging ? { x: foot.x, y: foot.y - 220 * S } : (p ?? lastPointer ?? { x: 0, y: 0 }));
      ctl.pet.cursor = '';
    } else ctl.pointerUp(p);
    activePointerId = null;
    if (wasPressing) lastRelease = { reason, cancel, wasDragging, time: ctl.time, pointerTime: Number.isFinite(p?.t) ? p.t : null };
    return wasPressing;
  }
  const onBlur = () => { if (ctl.pressing) endPointer(null, 'frame-blur', true); };
  const onVisibility = () => { if (doc.visibilityState === 'hidden' && ctl.pressing) endPointer(null, 'frame-hidden', true); };
  // These cover direct local hosts and focused frames. The opaque frame cannot
  // observe buttons omitted by an old parent; that parent must forward release.
  doc.defaultView?.addEventListener?.('blur', onBlur);
  doc.defaultView?.addEventListener?.('pagehide', onBlur);
  doc.addEventListener?.('visibilitychange', onVisibility);
  const body = {
    step(dt) {
      if (disposed) return;
      lastDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
      ctl.step(dt);
      if (lastDt) advanceYaw(lastDt);
      render();
    },
    layout() {
      const layout = ctl.layout();
      return { ...layout, moving: layout.moving || Math.abs(yaw - yawTarget) > .002 || Math.abs(yawV) > .01 };
    },
    resize: () => ctl.resize(),
    do(word) {
      const result = ctl.doWord(word);
      if (result && word === 'turn') { turnHeading = headingOf(ctl.pet); turnUntil = ctl.time + 1.1; }
      return result;
    },
    words: [...(nativeKit.KIT_EXPRESSIONS ?? []), ...(nativeKit.KIT_MOTIONS ?? []),
      ...Object.keys(opts.words ?? {}).filter(w => opts.words[w]?.expression || opts.words[w]?.motion)],
    walk: (x, run, id) => ctl.walkTo(x, run, id),
    stopWalk: id => ctl.stopWalk(id),
    pointer(type, p) {
      if (disposed || !pointerMatches(p)) return false;
      if (type === 'down') {
        if (!validPoint(p) || ctl.pressing || p?.isPrimary === false || (Number.isFinite(p?.button) && p.button !== 0)) return false;
        const accepted = ctl.pointerDown(p);
        if (accepted) { activePointerId = p.pointerId ?? null; lastPointer = { ...p }; }
        return accepted;
      }
      if (type === 'move') {
        if (!validPoint(p)) return false;
        // Missing metadata is unknown, never equivalent to a released button.
        if (ctl.pressing && p.buttons === 0) endPointer(p, 'move-buttons-zero', true);
        lastPointer = { ...p };
        return ctl.pointerMove(p);
      }
      if (type === 'up') return endPointer(p, 'up');
      if (type === 'cancel') return endPointer(p, p?.reason ?? 'cancel', true);
      if (type === 'leave') {
        if (ctl.pressing && p?.buttons === 0) endPointer(p, 'leave-buttons-zero', true);
        ctl.pointerLeave();
      }
    },
    drop(p) { activePointerId = null; lastRelease = { reason: 'host-drop', cancel: true, time: ctl.time }; return ctl.dropAt(p); },
    shift(dx, dy) { if (lastPointer) { lastPointer.x += dx; lastPointer.y += dy; } return ctl.shiftDrag(dx, dy); },
    place(x, facing) {
      if (ctl.pet.mode === 'drag' || ctl.pet.mode === 'air') return;
      const { minX, maxX } = ctl.bounds;
      ctl.pet.x = ctl.pet.target = clamp(x, minX, maxX);
      if (facing === 1 || facing === -1) ctl.pet.facing = ctl.pet.faceVis = facing;
    },
    set(s = {}) {
      if (s.roam) ctl.setRoam(s.roam);
      if (typeof s.hold === 'number') ctl.holdRoam(s.hold);
      if (typeof s.dialogOpen === 'boolean') dialogOpen = s.dialogOpen;
      if (typeof s.listening === 'boolean') ctl.setListening(s.listening);
      if (typeof s.thinking === 'boolean') ctl.setThinking(s.thinking);
      if (typeof s.thoughtShown === 'boolean') ctl.setThoughtShown(s.thoughtShown);
      if (s.skin) { ctl.setSkin(s.skin); if (opts.skinCss) skinStyle.textContent = opts.skinCss(s.skin); }
      if (s.theme) doc.documentElement.dataset.theme = s.theme;
      if (has(s, 'viewYaw')) {
        if (s.viewYaw !== null && !Number.isFinite(s.viewYaw)) throw new TypeError('viewYaw must be finite or null');
        overrideYaw = s.viewYaw === null ? null : clamp(s.viewYaw, -1, 1);
        yawTarget = resolveYawTarget();
        if (s.viewYawImmediate === true) { yaw = yawTarget; yawV = 0; }
      }
    },
    cue(kind) {
      if (kind === 'perk') { ctl.pet.sqv += .6; ctl.setExpr('surprised', .5); }
      else if (kind === 'heard') ctl.pet.sqv += .9;
      else if (kind === 'cheer') ctl.setExpr('happy');
      else if (kind === 'bounce') ctl.pet.sqv += 1.2;
    },
    talk: () => ctl.talk(),
    setScheme: (id, options) => figure.setScheme?.(id, options),
    get z() { return figure.colors?.z ?? null; },
    inspect() {
      return { adapter: 'maodou-api2-unmirrored-1.3.1', disposed, renderedFrames,
        pointer: { pressing: ctl.pressing, activePointerId, lastRelease: lastRelease ? { ...lastRelease } : null },
        time: ctl.time, mode: ctl.pet.mode, heading: headingOf(ctl.pet), nativeFacing: ctl.pet.faceVis,
        viewYaw: yaw, viewYawTarget: yawTarget, viewYawOverride: overrideYaw,
        xf: ctl.pet.xf ? { ...ctl.pet.xf } : null,
        frame: lastFrame ? { ...lastFrame } : null };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      doc.defaultView?.removeEventListener?.('blur', onBlur);
      doc.defaultView?.removeEventListener?.('pagehide', onBlur);
      doc.removeEventListener?.('visibilitychange', onVisibility);
      try { figure.dispose?.(); } finally { svg.remove(); style.remove(); skinStyle.remove(); }
    },
  };
  return body;
}
