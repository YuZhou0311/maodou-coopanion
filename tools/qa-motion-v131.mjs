#!/usr/bin/env node
/** Operator-run native motion capture. --help does not launch a browser. */
import { mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createRequire } from 'node:module';
import { createPreviewServer } from '../preview-host/serve.mjs';
import { projectRoot, atomicWrite, hashFile } from '../preview-host/pack-tools.mjs';

const HELP = `Usage: node tools/qa-motion-v131.mjs [options]
  --chromium=/path/to/chrome    optional; CHROMIUM_PATH or installed Playwright Chromium otherwise
  --software-webgl              explicit SwiftShader WebGL test environment
  --scale=0.9                   native display scale, not renderer resolution
  --seconds=2                   each straight walk/run: 1 to 2 simulation seconds
  --scheme=both                 both | gentle | lively
  --only=walk-left,walk-right,run-left,run-right,ear-wave,flap,stretch,celebrate
  --out=docs/qa/motion-v131
Starts its own ephemeral local preview server and owned Chrome only when run.
Requires current staged production; it never rebuilds or changes production.
Every observed step is an actual native opaque-iframe tick of 1/60 second.
Each gait retains 30 consecutive 60 Hz transparent canvas PNGs, then records
24 native stop/recovery ticks with three actual PNGs; complete
gesture tracks retain requested peak PNGs and record geometry every frame.
No real-time FPS, pixel-perfect art or subjective smoothness pass is inferred.
`;
const options = {};
for (const arg of process.argv.slice(2)) {
  if (arg === '--help') { console.log(HELP); process.exit(0); }
  if (arg === '--software-webgl') options.software = true;
  else if (/^--(?:chromium|scale|seconds|scheme|only|out)=/.test(arg)) {
    const at = arg.indexOf('='); options[arg.slice(2, at)] = arg.slice(at + 1);
  } else throw new Error(`Unknown option: ${arg}\n${HELP}`);
}
const scale = Number(options.scale ?? .9), seconds = Number(options.seconds ?? 2);
if (!(scale > 0 && scale <= 1.5) || !(seconds >= 1 && seconds <= 2)) throw new Error('Invalid scale or seconds');
const schemeOption = options.scheme ?? 'both';
if (!['both', 'gentle', 'lively'].includes(schemeOption)) throw new Error('Invalid scheme');
const schemes = schemeOption === 'both' ? ['gentle', 'lively'] : [schemeOption];
const allIds = ['walk-left', 'walk-right', 'run-left', 'run-right', 'ear-wave', 'flap', 'stretch', 'celebrate'];
const ids = options.only ? options.only.split(',') : allIds;
if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !allIds.includes(id))) throw new Error('Unknown or repeated --only id');
const out = resolve(projectRoot, options.out ?? 'docs/qa/motion-v131');
if (relative(projectRoot, out).startsWith('..')) throw new Error('Output must remain in this project');
await mkdir(out, { recursive: true });
const reportFile = resolve(out, 'report.json'), stepSeconds = 1 / 60;
const report = {
  schemaVersion: 1, status: 'in_progress', passed: false, startedAt: new Date().toISOString(),
  scope: 'Actual staged character in the unmodified native opaque iframe. Parent advance() submits and awaits each real tick; a temporary operator hook records the native body after that tick. Fixed-step captures are not real-time FPS evidence. Transparent PNGs exclude the outer SVG transform and particles.',
  requestedScale: scale, requestedGaitSeconds: seconds, schemes, requestedIds: ids,
  viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1,
  browserFlags: ['--no-sandbox'], checks: [], phases: [], screenshots: [], errors: [], warnings: [],
  visualPassed: null, smoothnessPassed: null, sourcesUnchanged: false,
  onlyFilesListedBelongToThisRun: true,
  geometryScope: { observedParts: ['head', 'body', 'earL', 'earR'], negativeAreaTolerance: 1e-5,
    extentTolerance: 1e-4, extentIncludes: 'The figure-provided union of head/body/ears/arms/feet and visible tail, including its existing .7 logical-unit padding.',
    limitation: 'meshHealth does not expose per-triangle limb or facial geometry. Positive triangles alone do not establish a pleasing silhouette or correct occlusion.' },
};
if (options.software) report.browserFlags.push('--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader');
const save = () => atomicWrite(reportFile, JSON.stringify(report, null, 2) + '\n');
const check = (id, passed, details = {}) => report.checks.push({ id, passed: !!passed, ...details });
let browser, server, page, nativeFrame, getSources;

function trackSummary(rows) {
  const keys = ['footXL', 'footXR', 'footLiftL', 'footLiftR', 'armL', 'armR', 'earRaiseL', 'earRaiseR',
    'earSpreadL', 'earSpreadR', 'earLiftL', 'earLiftR', 'earCurlL', 'earCurlR', 'earTipL', 'earTipR'];
  const fields = {};
  for (const key of keys) {
    const valid = rows.filter(r => Number.isFinite(r.pose?.[key]));
    let minimum = null, maximum = null, largestStep = null;
    for (let i = 0; i < valid.length; i++) {
      const row = valid[i], value = row.pose[key], point = { value, frame: row.index, seconds: row.localSeconds };
      if (!minimum || value < minimum.value) minimum = point;
      if (!maximum || value > maximum.value) maximum = point;
      if (i && row.index === valid[i - 1].index + 1) {
        const delta = Math.abs(value - valid[i - 1].pose[key]);
        if (!largestStep || delta > largestStep.value) largestStep = { value: delta, fromFrame: valid[i - 1].index, toFrame: row.index, dt: row.dt };
      }
    }
    fields[key] = { samples: valid.length, minimum, maximum, span: minimum && maximum ? maximum.value - minimum.value : null, largestStep };
  }
  let sign = 0, liftAlternations = 0;
  for (const row of rows) {
    const d = (row.pose?.footLiftL ?? 0) - (row.pose?.footLiftR ?? 0), next = Math.abs(d) > .15 ? Math.sign(d) : 0;
    if (next && sign && next !== sign) liftAlternations++;
    if (next) sign = next;
  }
  return { fields, liftAlternations, minimumViewMargin: Math.min(...rows.map(r => r.minimumViewMargin ?? -Infinity)),
    modes: [...new Set(rows.map(r => r.mode))],
    negativeTriangleFrames: rows.filter(r => !r.geometryOK).map(r => r.index),
    outsideViewFrames: rows.filter(r => !r.extentOK).map(r => r.index),
    rendererFailureFrames: rows.filter(r => !r.rendererOK).map(r => r.index) };
}

async function reset(scheme, autoYaw) {
  await page.evaluate(async ({ scheme, autoYaw }) => {
    const p = maodouPreview; p.setPaused(true); p.setSweep(false); p.setYaw(autoYaw ? null : 0, true);
    p.body.set({ roam: 'off', hold: 3600, listening: false, thinking: false });
    p.body.do('stand'); p.body.do('neutral'); await p.advance(60, .05);
    await p.body.setScheme(scheme);
    p.body.do('stand'); p.body.do('neutral'); await p.advance(60, 1 / 60);
  }, { scheme, autoYaw });
}

async function writeCapture(image, phase) {
  const file = `${phase.id}-f${String(image.index).padStart(4, '0')}${image.reason === 'failure' ? '-failure' : ''}.png`;
  const bytes = Buffer.from(image.data.split(',')[1], 'base64'), path = resolve(out, file);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error(`Invalid PNG: ${file}`);
  await atomicWrite(path, bytes);
  const capture = { phase: phase.id, file, bytes: bytes.length, sha256: await hashFile(path),
    width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), frame: image.index,
    seconds: image.localSeconds, nativeTime: image.nativeTime, mode: image.mode, gesture: image.gesture,
    reason: image.reason, requestedTime: image.requestedTime ?? null,
    scope: 'Actual transparent canvas after the recorded native tick. No resampling, interpolation or synthetic pose.' };
  report.screenshots.push(capture); phase.files.push(file);
}

async function runTrack(scheme, id) {
  const gait = /^(walk|run)-(left|right)$/.exec(id), mode = gait?.[1], heading = gait?.[2] === 'left' ? -1 : 1;
  const spec = { 'ear-wave': { duration: 2.2, peaks: [1.433] }, flap: { duration: 1.4, peaks: [.783] },
    stretch: { duration: 3.2, peaks: [2.1] }, celebrate: { duration: 3.3, peaks: [1.983, 2.533] } }[id];
  const totalFrames = gait ? Math.round(seconds * 60) : Math.ceil((spec.duration + .6) * 60);
  const captureStart = Math.min(39, totalFrames - 29);
  const captureFrames = gait ? Array.from({ length: 30 }, (_, i) => captureStart + i) : spec.peaks.map(t => Math.round(t * 60));
  const requestedTimes = gait ? {} : Object.fromEntries(spec.peaks.map(t => [Math.round(t * 60), t]));
  const phase = { id: `${scheme}-${id}`, scheme, action: id, kind: gait ? 'gait' : 'gesture', status: 'in_progress',
    startedAt: new Date().toISOString(), dt: stepSeconds, expectedFrames: totalFrames,
    captureFrames, requestedPeakTimes: spec?.peaks ?? [], requestedPulseSeconds: spec?.duration ?? null,
    captureScope: gait ? '30 consecutive native ticks at 1/60 s; the entire longer path is inspected every tick.' : 'Requested peak ticks plus any first observed technical failures; whole action and .6 s recovery inspected every tick.',
    rows: [], files: [], errors: [] };
  report.phases.push(phase); await save();
  try {
    await reset(scheme, !!gait);
    if (gait) {
      phase.path = await page.evaluate(({ heading, seconds }) => {
        const p = maodouPreview, b = p.bounds();
        // Space inside the authentic stage, with no invented speed or target.
        const margin = 104 * b.S + 28, start = heading > 0 ? margin : b.W - margin;
        const target = heading > 0 ? b.W - margin : margin;
        p.body.place(start, heading); return { start, target, heading, bounds: b,
          availableDistance: Math.abs(target - start), maximumRunTravelInWindow: 250 * seconds };
      }, { heading, seconds });
      await page.evaluate(() => maodouPreview.advance(1, 0));
      check(`${phase.id}: long actual native path is available`, phase.path.availableDistance > 250 * seconds + 20, phase.path);
    } else {
      await page.evaluate(async () => {
        maodouPreview.body.place(maodouPreview.bounds().W / 2, 1);
        await maodouPreview.advance(1, 0);
      });
    }
    phase.initial = await nativeFrame.evaluate(() => globalThis.__maodouQABody.inspect());
    await nativeFrame.evaluate(config => globalThis.__maodouMotionQA.start(config), { id: phase.id, captureFrames, requestedTimes });
    await page.evaluate(async ({ gait, target, mode, id }) => {
      if (gait) await maodouPreview.body.walk(target, mode === 'run', `qa-${id}`);
      else await maodouPreview.body.do(id);
    }, { gait: !!gait, target: phase.path?.target ?? 0, mode, id });
    for (let done = 0; done < totalFrames;) {
      const count = Math.min(30, totalFrames - done);
      await page.evaluate(count => maodouPreview.advance(count, 1 / 60), count);
      const batch = await nativeFrame.evaluate(() => globalThis.__maodouMotionQA.drain());
      phase.rows.push(...batch.rows); phase.errors.push(...batch.errors);
      for (const image of batch.images) await writeCapture(image, phase);
      done += count;
      console.log(JSON.stringify({ phase: phase.id, frames: done, totalFrames, captures: phase.files.length,
        firstTechnicalFailure: phase.rows.find(r => !r.geometryOK || !r.extentOK || !r.rendererOK)?.index ?? null }));
    }
    phase.monitor = await nativeFrame.evaluate(() => globalThis.__maodouMotionQA.stop());
    phase.summary = trackSummary(phase.rows);
    check(`${phase.id}: every requested native 60 Hz tick recorded`, phase.rows.length === totalFrames && phase.rows.every((r, i) => r.index === i + 1 && Math.abs(r.dt - stepSeconds) < 1e-9 && Math.abs(r.localSeconds - (i + 1) * stepSeconds) < 1e-6));
    check(`${phase.id}: sampled head/body/ears have no inverted triangles`, phase.rows.every(r => r.geometryOK), { failingFrames: phase.summary.negativeTriangleFrames });
    check(`${phase.id}: actual extent stays inside renderer view`, phase.rows.every(r => r.extentOK), { minimumViewMargin: phase.summary.minimumViewMargin, failingFrames: phase.summary.outsideViewFrames });
    check(`${phase.id}: renderer remains ready without recorded errors`, phase.rows.every(r => r.rendererOK) && phase.errors.length === 0, { errors: phase.errors, failingFrames: phase.summary.rendererFailureFrames });
    const ownCaptures = report.screenshots.filter(s => s.phase === phase.id && s.reason === 'requested');
    check(`${phase.id}: all requested actual PNGs written`, captureFrames.every(index => ownCaptures.some(s => s.frame === index)), { count: ownCaptures.length, expected: captureFrames.length });
    if (gait) {
      const summary = phase.summary.fields, requestedMode = mode;
      check(`${phase.id}: mode remains actual ${requestedMode}`, phase.rows.every(r => r.mode === requestedMode), { modes: phase.summary.modes });
      check(`${phase.id}: feet and paws visibly sized numeric motion`, ['L', 'R'].every(side => summary[`footX${side}`].span > 10 && summary[`footLift${side}`].span > 3 && summary[`arm${side}`].span > 10),
        { scope: 'Numeric excursion threshold only; actual visibility under ears still requires image review.', fields: summary });
      check(`${phase.id}: alternating native feet and responding ears`, phase.summary.liftAlternations >= 2 && summary.earRaiseL.span > .05 && summary.earRaiseR.span > .05,
        { liftAlternations: phase.summary.liftAlternations, raiseSpan: [summary.earRaiseL.span, summary.earRaiseR.span] });
      // Observe the real native transition after the final larger gait-ear lift.
      // Do not invent a zero-ear endpoint: stand has its own authored ear motion.
      const recovery = phase.recovery = { id: `${phase.id}-stop`, files: [], expectedFrames: 24,
        scope: 'Actual native stand command after the completed gait; every recovery tick inspected, no forced pose or parameter reset.' };
      await nativeFrame.evaluate(config => globalThis.__maodouMotionQA.start(config),
        { id: recovery.id, captureFrames: [1, 12, 24], requestedTimes: {} });
      await page.evaluate(async () => { await maodouPreview.body.do('stand'); await maodouPreview.advance(24, 1 / 60); });
      const recovered = await nativeFrame.evaluate(() => globalThis.__maodouMotionQA.drain());
      recovery.rows = recovered.rows; recovery.errors = recovered.errors;
      for (const image of recovered.images) await writeCapture(image, recovery);
      recovery.monitor = await nativeFrame.evaluate(() => globalThis.__maodouMotionQA.stop());
      recovery.summary = trackSummary(recovery.rows);
      recovery.earRaiseStepFromGait = Object.fromEntries(['earRaiseL', 'earRaiseR'].map(key =>
        [key, Math.abs(recovery.rows[0]?.pose?.[key] - phase.rows.at(-1)?.pose?.[key])]));
      check(`${phase.id}: stop recovery records all 24 actual ticks`, recovery.rows.length === 24 && recovery.rows.every((r, i) => r.index === i + 1 && Math.abs(r.dt - stepSeconds) < 1e-9));
      check(`${phase.id}: stop recovery geometry, extent and renderer stay valid`, recovery.errors.length === 0 && recovery.rows.every(r => r.geometryOK && r.extentOK && r.rendererOK),
        { negativeTriangleFrames: recovery.summary.negativeTriangleFrames, outsideViewFrames: recovery.summary.outsideViewFrames, errors: recovery.errors });
      check(`${phase.id}: native stop leaves the walking mode`, recovery.rows.every(r => !['walk', 'run', 'drag'].includes(r.mode)), { modes: recovery.summary.modes });
    } else {
      const peakRows = phase.rows.filter(r => captureFrames.includes(r.index));
      check(`${phase.id}: requested peak executes correct native gesture`, peakRows.every(r => r.gesture?.kind === id), { peaks: peakRows.map(r => ({ frame: r.index, seconds: r.localSeconds, mode: r.mode, gesture: r.gesture })) });
      check(`${phase.id}: whole-ear raise reaches requested strong range`, Math.max(phase.summary.fields.earRaiseL.maximum?.value ?? -1, phase.summary.fields.earRaiseR.maximum?.value ?? -1) >= .65,
        { scope: 'Parameter amplitude, not visual acceptance.', raise: [phase.summary.fields.earRaiseL.maximum, phase.summary.fields.earRaiseR.maximum] });
    }
    phase.status = 'complete';
  } catch (error) {
    phase.status = 'failed'; phase.errors.push(String(error.stack ?? error));
    report.errors.push({ phase: phase.id, error: phase.errors.at(-1) });
    try { phase.monitor = await nativeFrame.evaluate(() => globalThis.__maodouMotionQA?.stop()); } catch {}
  }
  phase.completedAt = new Date().toISOString(); await save();
}

try {
  report.scriptSHA256 = await hashFile(resolve(projectRoot, 'tools/qa-motion-v131.mjs'));
  server = createPreviewServer();
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  report.url = `http://127.0.0.1:${server.address().port}/`;
  let playwright;
  try { playwright = createRequire(import.meta.url)('playwright'); }
  catch { playwright = createRequire(resolve(projectRoot, 'preview-host/package.json'))('playwright'); }
  browser = await playwright.chromium.launch({ executablePath: options.chromium ?? process.env.CHROMIUM_PATH, headless: true, args: report.browserFlags });
  page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(120000);
  page.on('pageerror', error => report.errors.push({ page: 'native', error: String(error) }));
  page.on('console', msg => {
    if (msg.type() === 'error') report.errors.push({ page: 'native', error: msg.text() });
    else if (msg.type() === 'warning') report.warnings.push(msg.text());
  });
  await page.addInitScript(() => {
    globalThis.__maodouQARegister = body => {
      globalThis.__maodouQABody = body;
      const originalStep = body.step.bind(body);
      let monitor = null;
      const poseKeys = ['footXL','footXR','footLiftL','footLiftR','armL','armR','earRaiseL','earRaiseR','earSpreadL','earSpreadR','earLiftL','earLiftR','earCurlL','earCurlR','earTipL','earTipR','bodyY','headY'];
      body.step = dt => {
        const result = originalStep(dt);
        if (!monitor) return result;
        const m = monitor, state = body.inspect(), fig = state.figure, index = ++m.index;
        const extent = fig.extent, view = fig.renderer.view;
        const finiteBounds = Array.isArray(extent) && extent.length === 4 && extent.every(Number.isFinite) && Array.isArray(view) && view.length === 4 && view.every(Number.isFinite);
        const margins = finiteBounds ? [extent[0]-view[0],extent[1]-view[1],view[2]-extent[2],view[3]-extent[3]] : null;
        const minimumViewMargin = margins ? Math.min(...margins) : null;
        const geometryOK = ['head','body','earL','earR'].every(id => {
          const h = fig.meshHealth?.[id]; return h && Number.isFinite(h.minArea) && h.minArea >= -1e-5 && h.negativeTriangles === 0 && h.bounds.every(Number.isFinite);
        });
        const rendererOK = fig.renderer.ready && !fig.renderer.contextLost && !fig.errors.length && !fig.renderer.errors.length && !fig.renderer.lastInvalidParts.length;
        const row = { index, dt, nativeTime: state.time, localSeconds: state.time-m.startedNativeTime,
          mode: state.mode, modeT: state.frame?.modeT, heading: state.heading, viewYaw: state.viewYaw,
          gesture: state.frame?.gesture ?? null, legsScreen: state.frame?.legsScreen ?? null,
          pose: Object.fromEntries(poseKeys.map(k => [k, fig.pose?.[k] ?? null])),
          meshHealth: fig.meshHealth, extent, view, minimumViewMargin,
          geometryOK: !!geometryOK, extentOK: finiteBounds && minimumViewMargin >= -1e-4, rendererOK: !!rendererOK,
          renderCount: fig.renderCount, outerTransform: state.xf,
          errors: [...fig.errors,...fig.renderer.errors], invalidParts: fig.renderer.lastInvalidParts };
        m.rows.push(row);
        const requested = m.captureFrames.has(index), failed = !row.geometryOK || !row.extentOK || !row.rendererOK;
        if (requested || (failed && m.failureCaptures < 3)) {
          if (failed && !requested) m.failureCaptures++;
          try {
            const canvas = document.querySelector('canvas');
            if (!canvas) throw new Error('Actual renderer canvas not found');
            m.images.push({ index, localSeconds: row.localSeconds, nativeTime: row.nativeTime, mode: row.mode, gesture: row.gesture,
              reason: requested ? 'requested' : 'failure', requestedTime: m.requestedTimes[index] ?? null, data: canvas.toDataURL('image/png') });
          } catch (error) { m.errors.push({ frame: index, error: String(error) }); }
        }
        return result;
      };
      globalThis.__maodouMotionQA = {
        start(config) {
          if (monitor) throw new Error('Previous QA motion monitor is active');
          monitor = { id: config.id, index: 0, startedNativeTime: body.inspect().time,
            captureFrames: new Set(config.captureFrames), requestedTimes: config.requestedTimes ?? {},
            rows: [], images: [], errors: [], failureCaptures: 0 };
          return { id: monitor.id, startedNativeTime: monitor.startedNativeTime };
        },
        drain() {
          if (!monitor) throw new Error('No QA motion monitor');
          return { rows: monitor.rows.splice(0), images: monitor.images.splice(0), errors: monitor.errors.splice(0) };
        },
        stop() {
          if (!monitor) return null;
          const value = { id: monitor.id, recordedFrames: monitor.index, nativeSeconds: body.inspect().time-monitor.startedNativeTime,
            unconsumedRows: monitor.rows.length, unconsumedImages: monitor.images.length, unconsumedErrors: monitor.errors.length };
          monitor = null; return value;
        },
      };
    };
  });
  await page.goto(report.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.maodouPreview?.ready, null, { timeout: 30000 });
  getSources = () => page.evaluate(async () => ({ status: await (await fetch('/api/preview')).json(), stage: await (await fetch('/qa/stage-report.json')).json() }));
  report.sourcesBefore = await getSources();
  if (!report.sourcesBefore.status.ready) throw new Error('Staging does not match current production sources');
  nativeFrame = page.frames().find(f => f.url().includes('/figure-frame'));
  if (!nativeFrame) throw new Error('Native figure iframe missing');
  await nativeFrame.waitForFunction(() => typeof globalThis.__maodouQABody?.inspect === 'function' && globalThis.__maodouMotionQA);
  await page.evaluate(async value => { maodouPreview.setScale(value); maodouPreview.setPaused(true); await maodouPreview.advance(1, 0); }, scale);
  report.boundary = await page.evaluate(() => ({ originNullObserved: maodouPreview.records.originNullObserved, sandbox: document.querySelector('iframe')?.getAttribute('sandbox'), bounds: maodouPreview.bounds() }));
  report.initial = await nativeFrame.evaluate(() => globalThis.__maodouQABody.inspect());
  report.graphics = await nativeFrame.evaluate(() => [...document.querySelectorAll('canvas')].map(c => {
    const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return { webgl: false, width: c.width, height: c.height };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { webgl: true, width: c.width, height: c.height, error: gl.getError(), attributes: gl.getContextAttributes(), renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) };
  }));
  check('actual opaque native iframe', report.boundary.originNullObserved, report.boundary);
  check('renderer initialized without GL error', report.graphics.some(g => g.webgl) && report.graphics.every(g => !g.webgl || g.error === 0));
  check('new foot and whole-ear fields are actually staged', ['footXL','footXR','earRaiseL','earRaiseR','earSpreadL','earSpreadR'].every(k => Number.isFinite(report.initial.figure.pose?.[k])));
  await save();
  for (const scheme of schemes) for (const id of ids) await runTrack(scheme, id);
  report.sourcesAfter = await getSources();
  report.sourcesUnchanged = report.sourcesAfter.status.ready
    && JSON.stringify(report.sourcesBefore.stage.sourceFiles) === JSON.stringify(report.sourcesAfter.stage.sourceFiles)
    && JSON.stringify(report.sourcesBefore.stage.files) === JSON.stringify(report.sourcesAfter.stage.files);
  check('production and staged payload hashes unchanged', report.sourcesUnchanged);
  report.final = await nativeFrame.evaluate(() => globalThis.__maodouQABody.inspect());
  report.nativeRecords = await page.evaluate(() => maodouPreview.records);
  check('native host and final renderer have no recorded errors', report.nativeRecords.errors.length === 0 && report.final.figure.errors.length === 0 && report.final.figure.renderer.errors.length === 0 && !report.final.figure.renderer.contextLost);
  const finalGl = await nativeFrame.evaluate(() => [...document.querySelectorAll('canvas')].map(c => { const gl = c.getContext('webgl2') || c.getContext('webgl'); return gl ? gl.getError() : null; }));
  check('no final GL error', finalGl.some(v => v !== null) && finalGl.every(v => v === null || v === 0), { errors: finalGl });
} catch (error) { report.errors.push({ phase: 'setup-or-finalization', error: String(error.stack ?? error) }); }
finally {
  try { await browser?.close(); } catch (error) { report.errors.push({ cleanup: String(error) }); }
  if (server) { server.closeAllConnections?.(); await new Promise(done => server.close(done)); }
  for (const scheme of schemes) for (const id of ids) if (!report.phases.some(p => p.id === `${scheme}-${id}`)) report.phases.push({ id: `${scheme}-${id}`, status: 'not_run' });
  report.status = report.phases.every(p => p.status === 'complete') && !report.errors.length ? 'complete' : 'completed_with_errors';
  report.passed = report.status === 'complete' && report.sourcesUnchanged && report.checks.every(c => c.passed);
  report.completedAt = new Date().toISOString();
  report.summary = { recordedFrames: report.phases.reduce((s, p) => s + (p.rows?.length ?? 0), 0), screenshots: report.screenshots.length,
    recoveryFrames: report.phases.reduce((s, p) => s + (p.recovery?.rows?.length ?? 0), 0),
    checks: report.checks.length, passedChecks: report.checks.filter(c => c.passed).length, failedChecks: report.checks.filter(c => !c.passed).map(c => c.id) };
  await save();
  console.log(JSON.stringify({ status: report.status, passed: report.passed, ...report.summary, report: reportFile, errors: report.errors }));
  if (!report.passed) process.exitCode = 1;
}
