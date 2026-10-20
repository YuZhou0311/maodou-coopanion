/**
 * Continuous pose controller for the adopted painted Maodou assets.
 * No DOM, drawing, geometry, random clock, audio analysis, or head scaling.
 *
 * Model units: Y points down; positive earLift/footLift points up. handIn and
 * earIn are positive towards the centre. armL positive / armR negative lifts
 * the paws outwards. Positive earCurl bends either ear inward. earTip is a
 * small LOCAL outward displacement, never a lag on the whole ear or its root.
 * footX is a SCREEN-SIGNED logical displacement taken from native legsScreen;
 * it must not be mirrored by heading again. earRaise [0,1] is a fixed-root
 * authored whole-ear lift (1 = broadly raised), not a vertical translation.
 * earSpread [-1,1] opens either ear outwards for positive values and gathers it
 * inwards for negative values. Both controls leave the root attachment fixed.
 * browTilt positive is a worried inner-brow lift; the rig mirrors its sides.
 * viewYaw and yawOffset are common signed screen yaw, never planar mirroring.
 */

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const unit = value => clamp(finite(value), 0, 1);
const TAU = Math.PI * 2;
const smooth = value => { const x = unit(value); return x * x * (3 - 2 * x); };
const envelope = (k, rise = .2, release = .8) => smooth(k / rise) * (1 - smooth((k - release) / (1 - release)));
const bell = value => value <= 0 || value >= 1 ? 0 : Math.sin(Math.PI * value) ** 2;
const mix = (a, b, k) => a + (b - a) * k;
const SHAPES = ['smile', 'open', 'o', 'sad'];
const oneMouth = shape => Object.fromEntries(SHAPES.map(key => [key, key === shape ? 1 : 0]));

const BASE = Object.freeze({
  eyeL: 1, eyeR: 1, happyL: 0, happyR: 0, eyeTiltL: 0, eyeTiltR: 0,
  browY: 0, browTilt: 0, mouthW: 9, mouthH: 2.4, blush: 0, tear: 0,
  headTilt: 0, headY: 0, bodyY: 0, bodySX: 1, bodySY: 1, bodyTilt: 0,
  armL: 0, armR: 0, handIn: 0, earLiftL: 0, earLiftR: 0,
  earRaiseL: 0, earRaiseR: 0, earSpreadL: 0, earSpreadR: 0,
  earInL: 0, earInR: 0, earCurlL: 0, earCurlR: 0, earTipL: 0, earTipR: 0,
  footLiftL: 0, footLiftR: 0, footXL: 0, footXR: 0, tail: 0, yawOffset: 0,
});
const LIMITS = Object.freeze({
  eyeL: [0, 1.15], eyeR: [0, 1.15], happyL: [0, 1], happyR: [0, 1],
  eyeTiltL: [-14, 14], eyeTiltR: [-14, 14], browY: [-4, 4], browTilt: [-18, 18],
  mouthW: [3, 15], mouthH: [.8, 11], blush: [0, 1], tear: [0, 1],
  headTilt: [-7, 7], headY: [-3.2, 4.8], bodyY: [-3.5, 5.5],
  bodySX: [.96, 1.045], bodySY: [.96, 1.055], bodyTilt: [-4, 4],
  armL: [-36, 52], armR: [-52, 36], handIn: [0, 10],
  earLiftL: [-8, 32], earLiftR: [-8, 32], earInL: [-10, 22], earInR: [-10, 22],
  earRaiseL: [0, 1], earRaiseR: [0, 1], earSpreadL: [-1, 1], earSpreadR: [-1, 1],
  earCurlL: [-18, 38], earCurlR: [-18, 38], earTipL: [-4, 4], earTipR: [-4, 4],
  footLiftL: [0, 14], footLiftR: [0, 14], footXL: [-18, 18], footXR: [-18, 18], tail: [-20, 20], yawOffset: [-1, 1],
});
const EXPRESSIONS = Object.freeze({
  neutral: {},
  happy: { eyeL: .02, eyeR: .02, happyL: 1, happyR: 1, mouthShape: 'open', mouthW: 9.6, mouthH: 4.3, blush: .34, earLiftL: 2, earLiftR: 2, headY: -.35 },
  wink: { eyeL: 1, eyeR: .02, happyR: 1, mouthW: 9.3, mouthH: 3, blush: .2, headTilt: -1.7, earLiftR: 2.8 },
  love: { eyeL: .84, eyeR: .84, happyL: .85, happyR: .85, mouthShape: 'open', mouthW: 8.7, mouthH: 3.4, blush: .62, handIn: 2.8, earInL: 2.5, earInR: 2.5, earCurlL: 4, earCurlR: 4, headTilt: -1 },
  shy: { eyeL: .78, eyeR: .78, eyeTiltL: -3, eyeTiltR: 3, mouthW: 7.3, mouthH: 2.1, blush: .78, headY: 1.2, headTilt: -2.7, handIn: 2.6, earInL: 3.1, earInR: 3.1, browY: .35 },
  surprised: { eyeL: 1.14, eyeR: 1.14, browY: -2.2, mouthShape: 'o', mouthW: 5.9, mouthH: 7.5, headY: -.85, earLiftL: 4.2, earLiftR: 4.2, armL: 5, armR: -5 },
  angry: { eyeL: .68, eyeR: .68, eyeTiltL: 9, eyeTiltR: -9, browY: 1.25, browTilt: -12, mouthShape: 'sad', mouthW: 7.3, mouthH: 1.4, handIn: 2.2, earLiftL: 3.1, earLiftR: 3.1, earCurlL: 7, earCurlR: 7, blush: .12 },
  sad: { eyeL: .83, eyeR: .83, eyeTiltL: -3, eyeTiltR: 3, browY: -.2, browTilt: 11, mouthShape: 'sad', mouthW: 6.8, mouthH: 2.4, headY: 1.3, bodyY: .35, earLiftL: -2.2, earLiftR: -2.2, tail: -2 },
  sleepy: { eyeL: .46, eyeR: .46, mouthW: 7, mouthH: 1.8, browY: .4, headY: 1.25, earLiftL: -1.4, earLiftR: -1.4, earCurlL: 1.8, earCurlR: 1.8 },
  thinking: { eyeL: .86, eyeR: .91, browTilt: 5, mouthShape: 'o', mouthW: 4.6, mouthH: 2.1, headTilt: 3.9, headY: -.55, earLiftL: .5, earLiftR: 3.5, armR: -7, handIn: 1.2 },
  smug: { eyeL: .61, eyeR: .65, happyL: .65, happyR: .65, browY: -.3, mouthW: 9.6, mouthH: 2.7, blush: .2, headTilt: -1.5, headY: -.75, earLiftL: 1.7 },
  pout: { eyeL: .79, eyeR: .79, browY: .6, mouthShape: 'o', mouthW: 4.8, mouthH: 2.8, blush: .47, headTilt: 1.6, handIn: 2.2, earInL: 2.5, earInR: 2.5 },
  worried: { eyeL: .95, eyeR: .95, browY: -.8, browTilt: 12, mouthShape: 'sad', mouthW: 6.1, mouthH: 2.2, headY: .5, handIn: 2.7, earInL: 2, earInR: 2, earLiftL: -1, earLiftR: -1 },
  determined: { eyeL: .81, eyeR: .81, eyeTiltL: 6, eyeTiltR: -6, browY: .7, browTilt: -9, mouthW: 7.2, mouthH: 1.7, handIn: 2.4, bodyY: -.15, earLiftL: 1.8, earLiftR: 1.8 },
  flustered: { eyeL: .5, eyeR: .38, happyL: .75, happyR: .75, eyeTiltL: 7, eyeTiltR: -7, mouthShape: 'open', mouthW: 6.9, mouthH: 3.7, blush: .87, browY: .5, handIn: 3.5, earLiftL: 3.8, earLiftR: 2.5, earCurlL: 8, earCurlR: 8 },
  scared: { eyeL: 1.1, eyeR: 1.1, browY: -1.8, browTilt: 13, mouthShape: 'o', mouthW: 5.4, mouthH: 6.7, headY: 1.05, bodySX: .989, bodySY: 1.01, handIn: 5.5, earInL: 5.7, earInR: 5.7, earCurlL: 10, earCurlR: 10 },
  excited: { eyeL: 1.07, eyeR: 1.07, happyL: .8, happyR: .8, browY: -1, mouthShape: 'open', mouthW: 9.7, mouthH: 4.8, blush: .39, headY: -.7, bodySY: 1.009, earLiftL: 3.7, earLiftR: 3.7, armL: 4, armR: -4 },
  cry: { eyeL: .94, eyeR: .94, browY: -.8, browTilt: 15, mouthShape: 'sad', mouthW: 6.1, mouthH: 2.6, tear: .84, blush: .28, handIn: 2, headY: 1.3, earLiftL: -2.2, earLiftR: -2.2 },
  confused: { eyeL: .97, eyeR: .63, eyeTiltL: -2, eyeTiltR: 5, browY: -.35, browTilt: 5.5, mouthShape: 'o', mouthW: 5.1, mouthH: 3.6, headTilt: -3.2, earLiftL: 4.2, earLiftR: -.5 },
  cozy: { eyeL: .19, eyeR: .19, happyL: .64, happyR: .64, mouthW: 8.2, mouthH: 2, blush: .18, headTilt: -.65, headY: .45, earLiftL: -1, earLiftR: -1, earCurlL: 2.5, earCurlR: 2.5 },
  curious: { eyeL: 1.04, eyeR: 1.04, browY: -1.6, browTilt: 2, mouthW: 7.9, mouthH: 2.6, headTilt: 2.6, headY: -.8, earLiftL: .7, earLiftR: 4.5, armR: -5 },
  bashful: { eyeL: .18, eyeR: .27, happyL: 1, happyR: 1, mouthShape: 'open', mouthW: 7.8, mouthH: 3.2, blush: .82, headTilt: -2.1, headY: .65, handIn: 4.2, earInL: 3.8, earInR: 3.8, earCurlL: 5.5, earCurlR: 5.5 },
  pleading: { eyeL: 1.03, eyeR: 1.03, browY: -1.35, browTilt: 14, mouthShape: 'o', mouthW: 5.4, mouthH: 2.1, tear: .2, blush: .24, headY: .7, handIn: 4, earLiftL: -1.1, earLiftR: -1.1, earInL: 2.7, earInR: 2.7 },
  proud: { eyeL: .76, eyeR: .76, happyL: .65, happyR: .65, browY: -.5, mouthW: 9.8, mouthH: 2.6, headY: -1.65, headTilt: -1, bodySY: 1.012, earLiftL: 1.5, earLiftR: 1.5, armL: 2.5, armR: -2.5 },
  sparkle: { eyeL: 1.15, eyeR: 1.15, happyL: .35, happyR: .35, browY: -2, mouthShape: 'open', mouthW: 8.6, mouthH: 5.6, blush: .43, headY: -1.1, bodyY: -.45, bodyTilt: .55, handIn: 1.3, earLiftL: 4.2, earLiftR: 4.2 },
});
const ALIASES = Object.freeze({ content: 'cozy', waking: 'sleepy', listening: 'curious', run: 'excited', dragged: 'flustered', dizzy: 'confused', sleep: 'sleepy', bowing: 'neutral', squeeze: 'neutral' });
const SCHEMES = Object.freeze({ gentle: { movement: .84, tipOmega: 10.7, tipIdle: .12 }, lively: { movement: 1.08, tipOmega: 12.1, tipIdle: .2 } });
const BODY_KEYS = ['headTilt', 'headY', 'bodyY', 'bodySX', 'bodySY', 'bodyTilt', 'armL', 'armR', 'handIn', 'earLiftL', 'earLiftR', 'earRaiseL', 'earRaiseR', 'earSpreadL', 'earSpreadR', 'earInL', 'earInR', 'earCurlL', 'earCurlR', 'footLiftL', 'footLiftR', 'footXL', 'footXR', 'tail'];
const TIPS = new Set(['earTipL', 'earTipR']);
const add = (pose, values) => { for (const [key, value] of Object.entries(values)) pose[key] += value; };
function mouth(pose, shape, width, height, weight = 1) {
  weight = unit(weight);
  pose.mouthW = mix(pose.mouthW, width, weight); pose.mouthH = mix(pose.mouthH, height, weight);
  for (const key of SHAPES) pose._mouthMix[key] = mix(pose._mouthMix[key], key === shape ? 1 : 0, weight);
}
function keypath(k, stops) {
  for (let i = 1; i < stops.length; i++) if (k <= stops[i][0]) {
    const [a, av] = stops[i - 1], [b, bv] = stops[i];
    return mix(av, bv, smooth((k - a) / (b - a)));
  }
  return stops.at(-1)[1];
}

// Each track uses the host's normalized k, including the exact end at k=1.
// Several core wait times differ from actual native pulse durations; no track
// infers k from the manifest or continues a second action clock after its pulse.
const GESTURES = {
  nod(p, k) { const e = bell(k); add(p, { headY: 1.9 * e, headTilt: 1.1 * e, bodyY: .25 * e, armL: 1.5 * e, armR: -1.5 * e, earCurlL: 2.7 * e, earCurlR: 2.7 * e, tail: 1.5 * e }); },
  shake(p, k) { const e = envelope(k, .16, .76), w = Math.sin(TAU * 2 * k) * e; add(p, { yawOffset: .055 * w, headTilt: 2.1 * w, bodyTilt: -.45 * w, armL: 1.8 * w, armR: 1.8 * w, earInL: 1.4 * w, earInR: -1.4 * w, earLiftL: .7 * w, earLiftR: -.7 * w }); },
  spin(p, k) { const e = envelope(k, .12, .87), w = Math.sin(TAU * k) * e; add(p, { yawOffset: .24 * w, headTilt: 1.1 * w, bodyTilt: .55 * w, earLiftL: 1.5 * Math.max(w, 0), earLiftR: 1.5 * Math.max(-w, 0), earInL: -.8 * w, earInR: .8 * w, armL: 2.5 * w, armR: 2.5 * w, tail: 3 * w }); },
  wave(p, k) { const e = envelope(k, .2, .78), w = Math.sin(TAU * 2.1 * k) * e; add(p, { armL: 39 * e + 5.5 * w, armR: -3.5 * e, earLiftL: 8 * e + 1.7 * w, earLiftR: 1.8 * e, earCurlL: -3 * e, headTilt: -1.5 * e, bodyY: -.35 * e, handIn: .4 * e, footLiftR: .3 * e, tail: 3 * w }); },
  bow(p, k) { const e = envelope(k, .25, .66); add(p, { headY: 3.1 * e, headTilt: 2.6 * e, bodyY: .7 * e, bodySY: -.011 * e, bodySX: .007 * e, armL: 5 * e, armR: -5 * e, earLiftL: -1.3 * e, earLiftR: -1.3 * e, earInL: 2 * e, earInR: 2 * e, tail: -3.2 * e }); p.eyeL *= 1 - .98 * e; p.eyeR *= 1 - .98 * e; p.happyL *= 1 - e; p.happyR *= 1 - e; },
  shiver(p, k) { const e = envelope(k, .16, .74), w = Math.sin(TAU * 4 * k) * e; add(p, { bodySX: -.009 * e, bodySY: .007 * e, bodyY: .4 * e, headTilt: .48 * w, handIn: 3.4 * e, armL: -5 * e, armR: 5 * e, earLiftL: 2.6 * e + .5 * w, earLiftR: 2.6 * e - .5 * w, earCurlL: 8 * e, earCurlR: 8 * e, tail: 1.3 * w }); },
  flap(p, k) { const e = envelope(k, .12, .84), w = Math.sin(TAU * 1.5 * k), beat = w * w * e; add(p, { earLiftL: 13.5 * beat, earLiftR: 13.5 * beat, earInL: -2 * e, earInR: -2 * e, earCurlL: -5 * beat, earCurlR: -5 * beat, armL: 14 * e, armR: -14 * e, bodyY: -.35 * beat, headY: -.2 * beat, footLiftL: .7 * e, footLiftR: .7 * e, tail: 2.5 * w * e }); },
  'ear-wave'(p, k) { const e = envelope(k, .24, .75), w = Math.sin(TAU * 2 * k) * e; add(p, { earLiftL: 18 * e + 3.2 * w, earLiftR: 2.5 * e, earInL: 2.2 * e + .9 * w, earInR: -.8 * e, earCurlL: -9 * e + 3.5 * w, earCurlR: 2 * e, armL: 11 * e, armR: -2 * e, headTilt: -1.9 * e, bodyTilt: .65 * e, bodyY: -.35 * e, footLiftR: .3 * e, tail: 3.7 * w }); },
  'ear-fold'(p, k) { const e = envelope(k, .27, .69); add(p, { earLiftL: 5 * e, earLiftR: 5 * e, earInL: 14.5 * e, earInR: 14.5 * e, earCurlL: 25 * e, earCurlR: 25 * e, handIn: 6.4 * e, armL: -7 * e, armR: 7 * e, bodySY: -.012 * e, bodySX: .009 * e, headY: .9 * e, headTilt: .45 * e, blush: .15 * e, tail: 3.2 * e }); },
  cuddle(p, k) { const e = envelope(k, .3, .73), prepare = bell(k / .24); add(p, { bodyY: .5 * prepare - .85 * e, bodySY: .021 * e, bodySX: .01 * e, headY: -.55 * e, headTilt: -1.2 * e, handIn: 5.4 * e, armL: -10 * e, armR: 10 * e, earInL: 9 * e, earInR: 9 * e, earCurlL: 16 * e, earCurlR: 16 * e, earLiftL: 5 * e, earLiftR: 5 * e, blush: .13 * e, tail: 5 * e + Math.sin(TAU * k) * e }); },
  peek(p, k) { const e = envelope(k, .14, .86), y = keypath(k, [[0, 0], [.26, -.45], [.37, -.45], [.64, .51], [.77, .51], [1, 0]]); add(p, { yawOffset: y, headTilt: 2.4 * y, headY: -.3 * e, bodyTilt: .85 * y, earLiftL: 4.5 * Math.max(y, 0), earLiftR: 4.5 * Math.max(-y, 0), earInL: -.8 * e, earInR: -.8 * e, earCurlL: 2.2 * e, earCurlR: 2.2 * e, armL: 3 * e, armR: -3 * e, handIn: 1.2 * e, tail: -4 * y }); },
  stretch(p, k) { const e = envelope(k, .38, .66); add(p, { bodySY: .034 * e, bodySX: -.021 * e, bodyY: -.5 * e, headY: -.5 * e, armL: 28 * e, armR: -28 * e, earLiftL: 21 * e, earLiftR: 21 * e, earInL: -3.7 * e, earInR: -3.7 * e, earCurlL: -7 * e, earCurlR: -7 * e, tail: 7 * e }); p.eyeL *= 1 - .86 * e; p.eyeR *= 1 - .86 * e; p.happyL *= 1 - e; p.happyR *= 1 - e; mouth(p, 'o', 6.1, 6.8, e); },
  sway(p, k) { const e = envelope(k, .18, .84), w = Math.sin(TAU * 2 * k) * e; add(p, { bodyTilt: 1.8 * w, headTilt: -1.3 * w, bodyY: -.18 * w * w, earLiftL: 2.8 * w, earLiftR: -2.8 * w, earInL: w, earInR: -w, armL: 4 * e + 2.5 * w, armR: -4 * e + 2.5 * w, footLiftL: .5 * Math.max(w, 0), footLiftR: .5 * Math.max(-w, 0), tail: 6.5 * w }); },
  bounce(p, k) { const e = envelope(k, .1, .86), w = Math.sin(TAU * 2 * (k - .11)), up = Math.max(w, 0) * envelope(k, .23, .84), settle = Math.max(-w, 0) * e; add(p, { tail: 11 * Math.sin(TAU * 2.5 * k) * e, bodyY: -1.7 * up + .35 * settle, bodySY: .021 * up - .007 * settle, bodySX: -.01 * up + .006 * settle, headY: -.2 * up, earLiftL: 4.5 * up, earLiftR: 4.5 * up, earCurlL: 3 * up, earCurlR: 3 * up, armL: 7 * up, armR: -7 * up, footLiftL: .5 * up, footLiftR: .5 * up }); },
  doze(p, k) { const e = envelope(k, .42, .77), recover = bell((k - .71) / .24); add(p, { headY: 2.8 * e - .5 * recover, headTilt: 1.8 * e, bodyY: .65 * e, bodySY: -.007 * e, earLiftL: -2.8 * e, earLiftR: -2.8 * e, earInL: 2.5 * e, earInR: 2.5 * e, earCurlL: 3.5 * e, earCurlR: 3.5 * e, handIn: 1.6 * e, tail: -2 * e }); p.eyeL = mix(p.eyeL * (1 - .94 * e), .9, recover * .8); p.eyeR = mix(p.eyeR * (1 - .94 * e), .9, recover * .8); p.happyL *= 1 - e; p.happyR *= 1 - e; mouth(p, 'o', 5.3, 4.9, .72 * bell((k - .18) / .52)); },
  greet(p, k, frame) { const e = envelope(k, .22, .8), w = Math.sin(TAU * 2 * k) * e, nod = bell(k / .3); add(p, { armL: 28 * e + 6 * w, armR: -4 * e, earLiftL: 11 * e + 1.8 * w, earLiftR: 3 * e, earCurlL: -3 * e, headY: -.8 * e + .35 * nod, headTilt: -1.15 * e, bodyY: -.3 * e, handIn: .45 * e, yawOffset: -.18 * clamp(finite(frame.viewYaw), -1, 1) * e, footLiftR: .25 * e, tail: 4 * w }); },
  celebrate(p, k) { const e = envelope(k, .17, .84), w = Math.sin(TAU * 3 * k), left = Math.max(w, 0) * e, right = Math.max(-w, 0) * e; add(p, { armL: 19 * e + 13 * left, armR: -19 * e - 13 * right, earLiftL: 8 * e + 9 * left, earLiftR: 8 * e + 9 * right, earInL: -1.3 * e, earInR: -1.3 * e, earCurlL: 5 * e + 3 * left, earCurlR: 5 * e + 3 * right, bodyY: -.85 * e - .45 * Math.abs(w) * e, bodySY: .015 * e, bodyTilt: 1.05 * w * e, headTilt: -1.2 * w * e, footLiftL: left, footLiftR: right, tail: 8 * w * e }); mouth(p, 'open', 9.4, 5.3 + .6 * Math.abs(w), e * .7); },
};

// Whole-ear actions are separate from facial expression tracks. These weights
// drive a rig-authored raised/spread silhouette about a FIXED covered root;
// the old local lift/curl cannot produce the official broad raised-ear shape.
// Every waveform consumes the same native pulse k as the matching body track.
const EAR_ACTIONS = {
  nod(p, k) { const e = bell(k); add(p, { earRaiseL: .27 * e, earRaiseR: .27 * e, earSpreadL: -.14 * e, earSpreadR: -.14 * e }); },
  shake(p, k) { const e = envelope(k, .16, .76), w = Math.sin(TAU * 2 * k) * e; add(p, { earRaiseL: .24 * e + .12 * Math.max(w, 0), earRaiseR: .24 * e + .12 * Math.max(-w, 0), earSpreadL: .32 * w, earSpreadR: -.32 * w }); },
  spin(p, k) { const e = envelope(k, .12, .87), w = Math.sin(TAU * k) * e; add(p, { earRaiseL: .36 * e + .2 * Math.max(w, 0), earRaiseR: .36 * e + .2 * Math.max(-w, 0), earSpreadL: .44 * w, earSpreadR: -.44 * w }); },
  wave(p, k) { const e = envelope(k, .2, .78), w = Math.sin(TAU * 2.1 * k) * e; add(p, { earRaiseL: .68 * e + .2 * w, earRaiseR: .23 * e, earSpreadL: .48 * e + .12 * w, earSpreadR: .18 * e }); },
  bow(p, k) { const e = envelope(k, .25, .66), release = bell((k - .65) / .35); add(p, { earRaiseL: .15 * e + .2 * release, earRaiseR: .15 * e + .2 * release, earSpreadL: -.28 * e, earSpreadR: -.28 * e, earCurlL: 8 * e, earCurlR: 8 * e }); },
  shiver(p, k) { const e = envelope(k, .16, .74), w = Math.sin(TAU * 4 * k) * e; add(p, { earRaiseL: .32 * e + .06 * w, earRaiseR: .32 * e - .06 * w, earSpreadL: -.24 * e + .13 * w, earSpreadR: -.24 * e - .13 * w }); },
  flap(p, k) { const e = envelope(k, .12, .84), beat = Math.sin(TAU * 1.5 * k) ** 2 * e; add(p, { earRaiseL: .14 * e + 1.02 * beat, earRaiseR: .14 * e + 1.02 * beat, earSpreadL: .2 * e + .62 * beat, earSpreadR: .2 * e + .62 * beat }); },
  'ear-wave'(p, k) { const e = envelope(k, .24, .75), w = Math.sin(TAU * 2 * k) * e; add(p, { earRaiseL: .88 * e + .22 * w, earRaiseR: .22 * e + .08 * Math.max(-w, 0), earSpreadL: .55 * e + .2 * w, earSpreadR: .16 * e - .08 * w }); },
  'ear-fold'(p, k) { const e = envelope(k, .27, .69); add(p, { earRaiseL: .3 * e, earRaiseR: .3 * e, earSpreadL: -.7 * e, earSpreadR: -.7 * e }); },
  cuddle(p, k) { const e = envelope(k, .3, .73); add(p, { earRaiseL: .22 * e, earRaiseR: .22 * e, earSpreadL: -.48 * e, earSpreadR: -.48 * e }); },
  peek(p, k) { const e = envelope(k, .14, .86), y = keypath(k, [[0, 0], [.26, -.45], [.37, -.45], [.64, .51], [.77, .51], [1, 0]]); add(p, { earRaiseL: .2 * e + .4 * Math.max(y / .51, 0), earRaiseR: .2 * e + .4 * Math.max(-y / .45, 0), earSpreadL: .13 * e + .22 * y, earSpreadR: .13 * e - .22 * y }); },
  stretch(p, k) { const e = envelope(k, .38, .66); add(p, { earRaiseL: .98 * e, earRaiseR: .98 * e, earSpreadL: .76 * e, earSpreadR: .76 * e }); },
  sway(p, k) { const e = envelope(k, .18, .84), w = Math.sin(TAU * 2 * k) * e; add(p, { earRaiseL: .32 * e + .26 * w, earRaiseR: .32 * e - .26 * w, earSpreadL: .4 * w, earSpreadR: -.4 * w }); },
  bounce(p, k) { const e = envelope(k, .1, .86), up = Math.max(Math.sin(TAU * 2 * (k - .11)), 0) * envelope(k, .23, .84); add(p, { earRaiseL: .13 * e + .65 * up, earRaiseR: .13 * e + .65 * up, earSpreadL: .14 * e + .4 * up, earSpreadR: .14 * e + .4 * up }); },
  doze(p, k) { const e = envelope(k, .42, .77), recover = bell((k - .71) / .24); add(p, { earRaiseL: .1 * e + .35 * recover, earRaiseR: .1 * e + .35 * recover, earSpreadL: -.22 * e + .18 * recover, earSpreadR: -.22 * e + .18 * recover }); },
  greet(p, k) { const e = envelope(k, .22, .8), w = Math.sin(TAU * 2 * k) * e; add(p, { earRaiseL: .77 * e + .18 * w, earRaiseR: .32 * e + .08 * Math.max(-w, 0), earSpreadL: .48 * e + .13 * w, earSpreadR: .22 * e }); },
  celebrate(p, k) { const e = envelope(k, .17, .84), w = Math.sin(TAU * 3 * k), left = Math.max(w, 0) * e, right = Math.max(-w, 0) * e; add(p, { earRaiseL: .43 * e + .72 * left, earRaiseR: .43 * e + .72 * right, earSpreadL: .28 * e + .5 * left, earSpreadR: .28 * e + .5 * right }); },
};

// Recover the host's single phase from its opposed, filtered endpoints. The
// signed lift DIFFERENCE is cos(phase); the horizontal difference is sin(phase).
// This keeps host acceleration, heading and pauses, without a second gait clock.
// A cubic swing joins a constant-speed support stroke with matching velocity.
// During support the sole is exactly on the floor; sin² gives zero vertical
// velocity at takeoff/landing. A short double-support interval reads as walking
// rather than two feet perpetually bobbing above the floor.
function groundCycle(phase, swingFraction) {
  const u = ((phase / TAU + .25) % 1 + 1) % 1;
  if (u >= swingFraction) return { x: 1 - 2 * (u - swingFraction) / (1 - swingFraction), lift: 0, support: true };
  const k = u / swingFraction, tangent = -2 * swingFraction / (1 - swingFraction);
  return { x: -1 + 2 * smooth(k) + tangent * (2 * k * k * k - 3 * k * k + k),
    lift: Math.sin(Math.PI * k) ** 2, support: false };
}

function modePose(p, frame, t) {
  const mode = typeof frame.mode === 'string' ? frame.mode : 'idle';
  const sit = unit(frame.sit), drowse = unit(frame.drowse), mt = Math.max(0, finite(frame.modeT));
  // Native low/sit/outer breathing are already applied by the host and rig.
  add(p, { bodyY: .5 * sit, bodySX: .005 * sit, bodySY: -.007 * sit, handIn: .45 * sit, earCurlL: 1.4 * sit, earCurlR: 1.4 * sit });
  p.eyeL *= 1 - .5 * drowse; p.eyeR *= 1 - .5 * drowse;
  const look = Array.isArray(frame.lookScreen) ? frame.lookScreen : [0, 0];
  p.headTilt += clamp(finite(look[0]), -6, 6) * .085;
  p.headY += clamp(finite(look[1]), -6, 6) * .025;
  const looking = clamp(finite(look[0]) / 5, -1, 1), lookUp = unit(-finite(look[1]) / 4);
  // The adapter owns turn timing. Following its CURRENT yaw error gives the
  // ears a turn response without a second pulse timer or another yaw mirror.
  const turning = clamp(finite(frame.viewYawTarget, finite(frame.viewYaw)) - finite(frame.viewYaw), -1, 1);
  const turnEnergy = Math.abs(turning);
  add(p, { earRaiseL: .14 * turnEnergy + .12 * Math.max(turning, 0), earRaiseR: .14 * turnEnergy + .12 * Math.max(-turning, 0),
    earSpreadL: -.24 * turning, earSpreadR: .24 * turning, earCurlL: 5 * turning, earCurlR: -5 * turning });
  if (sit) add(p, { earSpreadL: -.16 * sit, earSpreadR: -.16 * sit, earCurlL: 1.8 * sit, earCurlR: 1.8 * sit });
  if (mode === 'walk' || mode === 'run' || mode === 'dance') {
    const legs = Array.isArray(frame.legsScreen) ? frame.legsScreen : [];
    const left = legs[0] ?? [], right = legs[1] ?? [];
    // These are the actual native foot endpoints, already in screen direction.
    // Native full-speed stride/lift: walk 10/8, run 17/15, dance 5/10. Preserve
    // their phase and acceleration ramp while authoring a grounded sole path.
    // FOOT_Y is 256 - native LEG_W/2 = 241, not the sprite's sole at 256.
    const run = mode === 'run', dance = mode === 'dance';
    const nominalStride = run ? 17 : dance ? 5 : 10, nominalLift = run ? 15 : dance ? 10 : 8;
    const dxL = clamp(finite(left[2], finite(left[0])) - finite(left[0]), -24, 24);
    const dxR = clamp(finite(right[2], finite(right[0])) - finite(right[0]), -24, 24);
    const liftL = clamp(241 - finite(left[3], 241), 0, 24), liftR = clamp(241 - finite(right[3], 241), 0, 24);
    let strideL = clamp(dxL / nominalStride, -1, 1), strideR = clamp(dxR / nominalStride, -1, 1);
    let stepL = unit(liftL / nominalLift), stepR = unit(liftR / nominalLift);
    const liftGain = run ? 1.05 : dance ? 1.15 : 1.2, strideGain = run ? 1.05 : dance ? 1.8 : 1.4;
    if (dance) {
      p.footLiftL += liftL * liftGain; p.footLiftR += liftR * liftGain;
      p.footXL += dxL * strideGain; p.footXR += dxR * strideGain;
    } else {
      const heading = finite(frame.heading, finite(frame.viewYaw) < 0 ? -1 : 1) < 0 ? -1 : 1;
      const sine = (dxL - dxR) * heading / (2 * nominalStride), cosine = (liftL - liftR) / nominalLift;
      const amplitude = clamp(Math.hypot(sine, cosine), 0, 1.05), phase = Math.atan2(sine, cosine);
      const swingFraction = run ? .48 : .44;
      const leftCycle = groundCycle(phase, swingFraction), rightCycle = groundCycle(phase + Math.PI, swingFraction);
      strideL = clamp(leftCycle.x * amplitude * heading, -1.1, 1.1);
      strideR = clamp(rightCycle.x * amplitude * heading, -1.1, 1.1);
      stepL = leftCycle.lift * amplitude; stepR = rightCycle.lift * amplitude;
      p.footXL += strideL * nominalStride * strideGain; p.footXR += strideR * nominalStride * strideGain;
      p.footLiftL += stepL * nominalLift * liftGain; p.footLiftR += stepR * nominalLift * liftGain;
      p._gait = { source: 'native endpoint phase', phase, amplitude, heading, swingFraction,
        supportL: leftCycle.support, supportR: rightCycle.support, kinematicBlend: smooth(mt / .18) };
    }
    const armGain = run ? 30 : dance ? 27 : 24, armOpen = dance ? 12 : 7;
    // Both arm angles are ordinary screen rotations: a positive angle swings
    // a hanging paw LEFT. The same-side forward foot therefore needs a positive
    // arm angle. Mirroring the right arm's phase as well made both paws swing
    // together; only the small outward rest angle is mirrored here.
    p.armL += armOpen + armGain * strideL; p.armR += -armOpen + armGain * strideR;
    // A modest raised base reveals the alternating paws; the opposite foot
    // leads each ear, and the slower spread/tip responses arrive behind it.
    const baseRaise = run ? .37 : dance ? .24 : .30, beatRaise = run ? .34 : dance ? .43 : .27;
    p.earRaiseL += baseRaise + beatRaise * stepR + .07 * stepL;
    p.earRaiseR += baseRaise + beatRaise * stepL + .07 * stepR;
    const baseSpread = run ? .21 : dance ? .27 : .16, spreadBeat = run ? .23 : dance ? .27 : .18;
    p.earSpreadL += baseSpread + spreadBeat * strideR; p.earSpreadR += baseSpread + spreadBeat * strideL;
    p.earLiftL += (run ? 6 : 4) * stepR; p.earLiftR += (run ? 6 : 4) * stepL;
    p.earCurlL += (run ? 8 : 6) * strideL; p.earCurlR += (run ? 8 : 6) * strideR;
    p.tail += (strideL - strideR) * (run ? 5 : dance ? 4.5 : 3.2);
  } else if (mode === 'look') {
    add(p, { earRaiseL: .14 + .22 * lookUp + .2 * Math.max(looking, 0), earRaiseR: .14 + .22 * lookUp + .2 * Math.max(-looking, 0),
      earSpreadL: .13 - .2 * looking, earSpreadR: .13 + .2 * looking });
  } else if (mode === 'wake') {
    const e = envelope(unit(mt / 1.8), .38, .72);
    add(p, { earRaiseL: .7 * e, earRaiseR: .7 * e, earSpreadL: .45 * e, earSpreadR: .45 * e,
      earLiftL: 5 * e, earLiftR: 5 * e, armL: 10 * e, armR: -10 * e });
  } else if (mode === 'sit') {
    const e = bell(mt / 1.1);
    add(p, { earRaiseL: .2 * e, earRaiseR: .2 * e, earSpreadL: -.08 * e, earSpreadR: -.08 * e });
  } else if (mode === 'idle') {
    // stand resets native modeT; this short settling perk is shared with an
    // ordinary return to idle. It is not an independently timed stand action.
    const e = bell(mt / .8);
    add(p, { earRaiseL: .2 * e + .06 * lookUp, earRaiseR: .2 * e + .06 * lookUp,
      earSpreadL: .11 * e, earSpreadR: .11 * e });
  } else if (mode === 'crouch') {
    add(p, { bodyY: .45, bodySX: .006, bodySY: -.008, handIn: 1.2, earLiftL: 1.5, earLiftR: 1.5, earInL: .7, earInR: .7, tail: -2.2 });
    add(p, { earRaiseL: .22, earRaiseR: .22, earSpreadL: -.17, earSpreadR: -.17 });
  } else if (mode === 'air') {
    add(p, { armL: 9, armR: -9, earInL: 2.2, earInR: 2.2, earLiftL: 3.5, earLiftR: 3.5, earCurlL: -3, earCurlR: -3, footLiftL: 1.2, footLiftR: 1.2, tail: -3.5 });
    const flapping = frame.gesture?.kind === 'flap', raise = flapping ? .06 : .61 + .15 * bell(mt / .55);
    add(p, { earRaiseL: raise, earRaiseR: raise, earSpreadL: flapping ? .04 : .5, earSpreadR: flapping ? .04 : .5,
      footLiftL: 3.5, footLiftR: 3.5, footXL: -3, footXR: 3 });
  } else if (mode === 'land') {
    const e = Math.exp(-9 * mt);
    add(p, { bodyY: .55 * e, headY: .25 * e, earLiftL: -2.8 * e, earLiftR: -2.8 * e, tail: 2.8 * e });
    const rebound = bell(mt / .4);
    add(p, { earRaiseL: .3 * rebound, earRaiseR: .3 * rebound, earSpreadL: .2 * rebound, earSpreadR: .2 * rebound });
  } else if (mode === 'drag') {
    add(p, { bodySY: .009, armL: 15, armR: -15, earLiftL: 4, earLiftR: 4, earInL: .8, earInR: .8, footLiftL: .3, footLiftR: .3 });
    const wind = clamp(finite(frame.swingScreen) / 40, -1, 1);
    add(p, { earRaiseL: .4 + .2 * Math.abs(wind), earRaiseR: .4 + .2 * Math.abs(wind), earSpreadL: .36 + .16 * wind, earSpreadR: .36 - .16 * wind });
  } else if (mode === 'dizzy') {
    const e = envelope(clamp(mt / 3.2, 0, 1), .12, .78), w = Math.sin(t * 4.5) * e;
    add(p, { headTilt: -.5 * w, armL: 2.2 * w, armR: 2.2 * w, earInL: w, earInR: -w, tail: 2.5 * w });
    add(p, { earRaiseL: .25 * e + .14 * w, earRaiseR: .25 * e - .14 * w, earSpreadL: .4 * w, earSpreadR: -.4 * w });
  }
  if (mode === 'sleep' || frame.face === 'sleep') {
    p.eyeL = p.eyeR = p.happyL = p.happyR = 0;
    add(p, { headY: .7, headTilt: -.7, earLiftL: -1.4, earLiftR: -1.4 });
    const breath = Math.sin(t * 1.7);
    add(p, { earSpreadL: -.18 + .025 * breath, earSpreadR: -.18 + .025 * breath,
      earCurlL: 3.5 + .8 * breath, earCurlR: 3.5 + .8 * breath });
    mouth(p, 'smile', 6.5, 1.6);
  }
  if (frame.face === 'bowing' || frame.face === 'squeeze') p.eyeL = p.eyeR = p.happyL = p.happyR = 0;
}

function targetPose(frame, t, age, movement, profile) {
  const rawFace = typeof frame.face === 'string' ? frame.face : 'neutral';
  const face = Object.hasOwn(EXPRESSIONS, rawFace) ? rawFace : (ALIASES[rawFace] ?? 'neutral');
  const p = { ...BASE, ...EXPRESSIONS[face] };
  p._mouthMix = oneMouth(p.mouthShape ?? 'smile'); delete p.mouthShape;
  if (face === 'sleepy' && frame.mode !== 'sleep') mouth(p, 'o', 5.5, 5.8, .8 * bell((age - .5) / 2.2));
  if (face === 'flustered') p.headTilt += .7 * Math.sin(age * 13) * Math.exp(-age * 1.8);
  modePose(p, frame, t);
  const gesture = frame.gesture;
  if (gesture && typeof GESTURES[gesture.kind] === 'function') {
    const k = unit(gesture.k);
    GESTURES[gesture.kind](p, k, frame);
    EAR_ACTIONS[gesture.kind](p, k);
  }
  for (const key of BODY_KEYS) p[key] = BASE[key] + (p[key] - BASE[key]) * movement;
  const talk = unit(frame.talk);
  if (talk) {
    // Native talk() is an activity envelope, not decoded audio phonemes.
    p.mouthW += 1.2 * talk; p.mouthH += 3.8 * talk;
    const openWeight = .56 * talk * (1 - p._mouthMix.o);
    for (const key of SHAPES) p._mouthMix[key] = mix(p._mouthMix[key], key === 'open' ? 1 : 0, openWeight);
  }
  const swing = clamp(finite(frame.swingScreen), -40, 40);
  const idle = profile.tipIdle * (frame.mode === 'sleep' ? .35 : 1);
  p.earTipL = -.065 * p.earLiftL + .04 * p.earInL + .015 * p.earCurlL - 2.4 * p.earRaiseL + .75 * p.earSpreadL + .05 * swing + idle * Math.sin(t * 1.43);
  p.earTipR = -.065 * p.earLiftR + .04 * p.earInR + .015 * p.earCurlR - 2.4 * p.earRaiseR + .75 * p.earSpreadR - .05 * swing + idle * Math.sin(t * 1.43 + .6);
  for (const key of Object.keys(BASE)) p[key] = clamp(finite(p[key], BASE[key]), ...LIMITS[key]);
  return p;
}

/** Exact first-order integration for a linearly changing target over dt. */
function follow(x, previous, target, rate, dt) {
  if (!dt) return x;
  const z = rate * dt, ease = -Math.expm1(-z);
  const ramp = z < 1e-4 ? z / 2 - z * z / 6 : 1 - ease / z;
  return x * (1 - ease) + previous * ease + (target - previous) * ramp;
}
/** Stable analytical damped spring; input dt is capped after long pauses. */
function spring(state, target, omega, dt) {
  if (!dt) return;
  const damping = .84, damped = omega * Math.sqrt(1 - damping * damping);
  const decay = Math.exp(-damping * omega * dt), angle = damped * dt;
  const c = Math.cos(angle), s = Math.sin(angle), d = state.x - target, v = state.v;
  state.x = target + decay * (d * c + (v + damping * omega * d) * s / damped);
  state.v = decay * (v * c - (damping * omega * v + omega * omega * d) * s / damped);
  const bounded = clamp(state.x, -4, 4);
  if (bounded !== state.x) state.v = 0;
  state.x = bounded;
  state.v = clamp(state.v, -45, 45);
}
// Native feet have already been filtered at rate 40. Keep this extra layer
// responsive enough for the 4.4 Hz run, then let arms, ear roots and tips lag
// in that order. The eye/mouth smoothing rates are deliberately unchanged.
const rateFor = key => key === 'yawOffset' ? 22 : key.startsWith('eye') || key.startsWith('happy') ? 18 : key.startsWith('mouth') ? 20 : key.startsWith('foot') ? 36 : key.startsWith('arm') ? 24 : key.startsWith('earRaise') ? 16 : key.startsWith('earSpread') ? 12 : key.startsWith('ear') ? 13 : 11;

export const ANIMATION_CONTRACT = Object.freeze({
  version: 2,
  expressionIds: Object.freeze(Object.keys(EXPRESSIONS)),
  gestureIds: Object.freeze(Object.keys(GESTURES)),
  customGestureIds: Object.freeze(['ear-wave', 'ear-fold', 'cuddle', 'peek', 'stretch', 'sway', 'bounce', 'doze', 'greet', 'celebrate']),
  customSeconds: Object.freeze({ 'ear-wave': 2.2, 'ear-fold': 2.7, cuddle: 3, peek: 2.8, stretch: 3.2, sway: 3, bounce: 2.4, doze: 3.6, greet: 2.5, celebrate: 3.3 }),
  nativeModePaths: Object.freeze(['stand/wake', 'jump/crouch/air/land', 'hop/crouch/air/land', 'look', 'turn/viewYaw', 'sit', 'sleep', 'dizzy', 'walk', 'run', 'dance']),
  schemes: Object.freeze(Object.keys(SCHEMES)),
  motionFields: Object.freeze({
    footXL: Object.freeze({ range: Object.freeze([-18, 18]), unit: 'screen-signed logical dx; never mirror again' }),
    footXR: Object.freeze({ range: Object.freeze([-18, 18]), unit: 'screen-signed logical dx; never mirror again' }),
    footLift: Object.freeze({ range: Object.freeze([0, 14]), unit: 'logical up displacement, separate left/right' }),
    earRaise: Object.freeze({ range: Object.freeze([0, 1]), unit: 'fixed-root whole-ear raised keyform, separate left/right' }),
    earSpread: Object.freeze({ range: Object.freeze([-1, 1]), unit: 'fixed-root opening; positive is outwards on either side' }),
  }),
  gait: Object.freeze({ source: 'native legsScreen endpoint phase and amplitude', footY: 241,
    nativeStride: Object.freeze({ walk: 10, run: 17, dance: 5 }), nativeLift: Object.freeze({ walk: 8, run: 15, dance: 10 }),
    swingFraction: Object.freeze({ walk: .44, run: .48 }), supportStroke: 'linear with zero sole lift',
    swingStroke: 'C1 cubic horizontal / sin-squared vertical', armPhase: 'opposed screen rotation, contralateral to feet',
    noIndependentPhase: true, worldSpaceFootLock: false }),
  noHeadScale: true, clock: 'native frame.t, frame.modeT, frame.gesture.k and legsScreen',
});

/** createAnimator({scheme:'gentle'|'lively'}) -> {step,setScheme,inspect}. */
export function createAnimator({ scheme = 'gentle' } = {}) {
  if (!Object.hasOwn(SCHEMES, scheme)) throw new RangeError(`Unknown animation scheme: ${scheme}`);
  let schemeId = scheme, movement = SCHEMES[scheme].movement;
  let current = { ...BASE }, mouthMix = oneMouth('smile'), previous = null;
  let lastT = null, faceStartT = 0, faceName = null, lastInput = null, lastPose = null;
  const tips = { L: { x: 0, v: 0 }, R: { x: 0, v: 0 } };
  const counters = { steps: 0, zeroDt: 0, longDt: 0, invalidDt: 0, backwardsTime: 0 };

  function step(frame = {}) {
    const suppliedT = finite(frame.t, lastT ?? 0);
    let rawDt = Number.isFinite(frame.dt) ? frame.dt : lastT === null ? 0 : suppliedT - lastT;
    if (!Number.isFinite(rawDt) || rawDt < 0) { rawDt = 0; counters.invalidDt++; }
    if (rawDt === 0) counters.zeroDt++;
    if (rawDt > .12) counters.longDt++;
    const dt = Math.min(rawDt, .12);
    const t = Number.isFinite(frame.t) ? frame.t : (lastT ?? 0) + dt;
    if (lastT !== null && t < lastT - 1e-7) {
      counters.backwardsTime++; tips.L.v = tips.R.v = 0; faceStartT = t;
    }
    const face = typeof frame.face === 'string' ? frame.face : 'neutral';
    if (face !== faceName) { faceName = face; faceStartT = t; }
    const profile = SCHEMES[schemeId];
    movement += (profile.movement - movement) * -Math.expm1(-7 * dt);
    const target = targetPose(frame, t, Math.max(0, t - faceStartT), movement, profile);
    if (!previous) {
      current = Object.fromEntries(Object.keys(BASE).map(key => [key, target[key]]));
      mouthMix = { ...target._mouthMix };
      tips.L.x = target.earTipL; tips.R.x = target.earTipR;
    } else {
      for (const key of Object.keys(BASE)) if (!TIPS.has(key)) {
        let next = follow(current[key], previous[key], target[key], rateFor(key), dt);
        // A second low-pass over an already continuous native gait leaves both
        // soles hovering after touchdown. Keep start/stop blending, but use the
        // continuous authored path directly once the host has entered the walk.
        if (dt && key.startsWith('foot') && target._gait) next = mix(next, target[key], target._gait.kinematicBlend);
        current[key] = clamp(next, ...LIMITS[key]);
      }
      for (const key of SHAPES) mouthMix[key] = clamp(follow(mouthMix[key], previous._mouthMix[key], target._mouthMix[key], 19, dt), 0, 1);
      spring(tips.L, target.earTipL, profile.tipOmega, dt);
      spring(tips.R, target.earTipR, profile.tipOmega * .94, dt);
    }
    current.earTipL = tips.L.x; current.earTipR = tips.R.x;
    const sum = SHAPES.reduce((total, key) => total + mouthMix[key], 0) || 1;
    for (const key of SHAPES) mouthMix[key] /= sum;
    const mouthShape = SHAPES.reduce((best, key) => mouthMix[key] > mouthMix[best] ? key : best, 'smile');
    // Host blink and expression-swap closures already have their own continuous
    // timing. Apply them after style smoothing so a real blink can close fully.
    const closure = Math.max(unit(frame.blink), unit(frame.eyeClose));
    const pose = { ...current, eyeL: current.eyeL * (1 - closure), eyeR: current.eyeR * (1 - closure), mouthShape, mouthMix: { ...mouthMix },
      gait: target._gait ? { ...target._gait } : null };
    previous = target; lastT = t; counters.steps++;
    lastInput = { t, dt, suppliedDt: rawDt, face, mode: frame.mode ?? 'idle', modeT: finite(frame.modeT), gesture: frame.gesture ? { kind: frame.gesture.kind, k: unit(frame.gesture.k) } : null, viewYaw: clamp(finite(frame.viewYaw), -1, 1), blink: unit(frame.blink), eyeClose: unit(frame.eyeClose), talk: unit(frame.talk) };
    lastPose = pose;
    return { ...pose, mouthMix: { ...pose.mouthMix } };
  }
  function setScheme(id) {
    if (!Object.hasOwn(SCHEMES, id)) throw new RangeError(`Unknown animation scheme: ${id}`);
    schemeId = id;
    return schemeId;
  }
  function inspect() {
    return {
      scheme: schemeId, movementGain: movement, frame: lastInput ? { ...lastInput, gesture: lastInput.gesture ? { ...lastInput.gesture } : null } : null,
      pose: lastPose ? { ...lastPose, mouthMix: { ...lastPose.mouthMix } } : null,
      target: previous ? { ...Object.fromEntries(Object.keys(BASE).map(key => [key, previous[key]])), mouthMix: { ...previous._mouthMix } } : null,
      earSprings: { L: { ...tips.L }, R: { ...tips.R } }, counters: { ...counters },
      expressionIds: [...ANIMATION_CONTRACT.expressionIds], gestureIds: [...ANIMATION_CONTRACT.gestureIds],
      clock: ANIMATION_CONTRACT.clock, headScaleOwned: false, audioAnalysis: false,
    };
  }
  return Object.freeze({ step, setScheme, inspect });
}
