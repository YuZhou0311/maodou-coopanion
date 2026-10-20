#!/usr/bin/env node
/** Operator-run release checks. --help never starts a server or browser. */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createPreviewServer } from '../preview-host/serve.mjs';
import { projectRoot, atomicWrite, hashFile } from '../preview-host/pack-tools.mjs';

const HELP = `Usage: node tools/qa-release.mjs [options]
  --chromium=/path/to/chrome    default /workspace/scratch/4b38f3d3ca52/test-browser/chrome-linux64/chrome
  --software-webgl             use SwiftShader for WebGL only
  --scale=0.6                  logical display scale
  --out=docs/qa/release-acceptance
  --offline=exports/Maodou-Offline-Preview-v1.3.3.html
Starts and closes an owned ephemeral local server and an owned test browser.
Requires current staged assets and a freshly built standalone HTML. It does not
rebuild or change production files. Dense geometry checks do not certify art;
the single eight-second FPS window has no invented smoothness pass threshold.
All failures are retained in report.json. Offline preview has no iframe boundary.
`;
const options = {};
for (const arg of process.argv.slice(2)) {
  if (arg === '--help') { console.log(HELP); process.exit(0); }
  if (arg === '--software-webgl') options.software = true;
  else if (/^--(?:chromium|scale|out|offline)=/.test(arg)) {
    const i = arg.indexOf('='); options[arg.slice(2, i)] = arg.slice(i + 1);
  } else throw new Error(`Unknown option: ${arg}\n${HELP}`);
}
const scale = Number(options.scale ?? .6);
if (!(scale > 0 && scale <= 1.5)) throw new Error('Invalid --scale');
const out = resolve(projectRoot, options.out ?? 'docs/qa/release-acceptance');
const offlineFile = resolve(projectRoot, options.offline ?? 'exports/Maodou-Offline-Preview-v1.3.3.html');
await mkdir(out, { recursive: true });
const reportFile = resolve(out, 'report.json');
const report = {
  status: 'in_progress', passed: false, startedAt: new Date().toISOString(), requestedScale: scale,
  scope: 'Actual native opaque iframe, real trusted pointer input, completed-frame timings, and a separate direct local offline preview. No full-vocabulary rerun or automatic visual certification.',
  browserFlags: ['--no-sandbox'], checks: [], phases: [], errors: [], warnings: [], screenshots: [],
  visualPassed: null, smoothnessPassed: null, sourcesUnchanged: false,
};
if (options.software) report.browserFlags.push('--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader');
const save = () => atomicWrite(reportFile, JSON.stringify(report, null, 2) + '\n');
function check(id, passed, details = {}) { report.checks.push({ id, passed: !!passed, ...details }); }
async function phase(id, fn) {
  const row = { id, status: 'in_progress', startedAt: new Date().toISOString() }; report.phases.push(row); await save();
  try { await fn(); row.status = 'complete'; }
  catch (error) { row.status = 'failed'; row.error = String(error.stack ?? error); report.errors.push({ phase: id, error: row.error }); }
  row.completedAt = new Date().toISOString(); await save();
}
let browser, server, page, nativeFrame;
function logPage(p, label) {
  p.on('pageerror', error => report.errors.push({ page: label, error: String(error) }));
  p.on('console', m => {
    if (m.type() === 'error') report.errors.push({ page: label, error: m.text() });
    else if (m.type() === 'warning') report.warnings.push({ page: label, warning: m.text() });
  });
}
const inspect = () => nativeFrame.evaluate(() => globalThis.__maodouQABody.inspect());
const advance = (frames = 1, dt = 1 / 60) => page.evaluate(async ({ frames, dt }) => maodouPreview.advance(frames, dt), { frames, dt });
async function reset() {
  await page.evaluate(async () => {
    const p = maodouPreview; p.setPaused(true); p.setSweep(false); p.setYaw(0, true);
    p.body.set({ roam: 'off', hold: 3600, listening: false, thinking: false });
    p.body.do('stand'); p.body.do('neutral'); await p.advance(60, .05);
    p.body.place(p.bounds().W / 2, 1); p.body.do('stand'); p.body.do('neutral'); await p.advance(36, 1 / 60);
  });
}
async function stageShot(id, extra = {}) {
  const file = `${id}.png`, path = resolve(out, file);
  await atomicWrite(path, await page.locator('#stage').screenshot());
  const row = { file, sha256: await hashFile(path), scope: 'Actual complete stage including native outer SVG transform and particles.', ...extra };
  report.screenshots.push(row); return row;
}
try {
  server = createPreviewServer();
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const url = `http://127.0.0.1:${server.address().port}/`; report.url = url;
  let playwright;
  try { playwright = createRequire(import.meta.url)('playwright'); }
  catch { playwright = createRequire(resolve(projectRoot, 'preview-host/package.json'))('playwright'); }
  browser = await playwright.chromium.launch({
    executablePath: options.chromium ?? process.env.CHROMIUM_PATH,
    headless: true, args: report.browserFlags,
  });
  page = await browser.newPage({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(30000); logPage(page, 'native');
  await page.addInitScript(() => {
    globalThis.__maodouQARegister = body => Object.defineProperty(globalThis, '__maodouQABody', { value: body, configurable: true });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.maodouPreview?.ready);
  const getSources = () => page.evaluate(async () => ({ status: await (await fetch('/api/preview')).json(), stage: await (await fetch('/qa/stage-report.json')).json() }));
  report.sourcesBefore = await getSources();
  if (!report.sourcesBefore.status.ready) throw new Error('Staging does not match current source files');
  nativeFrame = page.frames().find(f => f.url().includes('/figure-frame'));
  if (!nativeFrame) throw new Error('Native figure iframe absent');
  await nativeFrame.waitForFunction(() => typeof globalThis.__maodouQABody?.inspect === 'function');
  await page.evaluate(value => { maodouPreview.setScale(value); maodouPreview.setPaused(true); }, scale);
  await reset();
  report.nativeBoundary = await page.evaluate(() => ({ originNullObserved: maodouPreview.records.originNullObserved, sandbox: document.querySelector('iframe')?.getAttribute('sandbox') }));
  check('actual opaque native iframe', report.nativeBoundary.originNullObserved, report.nativeBoundary);
  report.graphics = await nativeFrame.evaluate(() => [...document.querySelectorAll('canvas')].map(c => {
    const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return { width: c.width, height: c.height, webgl: false };
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return { width: c.width, height: c.height, webgl: true, error: gl.getError(), attributes: gl.getContextAttributes(), renderer: gl.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : gl.RENDERER) };
  }));
  check('native WebGL ready without initial error', report.graphics.some(g => g.webgl) && report.graphics.every(g => !g.webgl || g.error === 0));

  await phase('dense-yaw-and-transparent-views', async () => {
    const angles = [...Array.from({ length: 151 }, (_, i) => i - 75), -.1, -.01, -.001, -.0001, .0001, .001, .01, .1,
      -.7501, -.75, -.7499, .7499, .75, .7501];
    const result = await nativeFrame.evaluate(values => {
      const b = globalThis.__maodouQABody, rows = [], images = [];
      for (const angle of values) {
        b.set({ viewYaw: angle / 75, viewYawImmediate: true }); b.step(0);
        const s = b.inspect(), f = s.figure;
        rows.push({ angle, viewYaw: s.viewYaw, headWidth: f.headBounds[2] - f.headBounds[0], headBounds: f.headBounds, meshHealth: f.meshHealth, rendererErrors: f.renderer.errors, invalidParts: f.renderer.lastInvalidParts, figureErrors: f.errors });
        // Retain the user's exact 22-degree failure plus its neighbouring
        // directions, the shoulder fade and the main authored side views.
        if ([-75,-60,-45,-41,-38,-35,-30,-25,-23,-22,-21,-20,-15,0,15,20,21,22,23,25,30,35,38,41,45,60,75].includes(angle)) images.push({ angle, data: document.querySelector('canvas').toDataURL('image/png') });
      }
      b.set({ viewYaw: 0, viewYawImmediate: true }); b.step(0);
      return { rows, images };
    }, angles);
    report.denseYaw = { scope: '151 integer angles plus eight nonzero near-zero probes and six probes around the +/-0.75-degree material onset. Each calls actual body.set(viewYawImmediate), body.step(0), and GPU render; no simulated screenshot substitution.', samples: result.rows };
    check('165 dense yaw observations', result.rows.length === 165);
    check('head body and both ears have no inverted triangles', result.rows.every(r => ['head', 'body', 'earL', 'earR'].every(key => r.meshHealth?.[key]?.negativeTriangles === 0)));
    check('dense head widths preserve the authored head volume', result.rows.every(r => Number.isFinite(r.headWidth) && r.headWidth > 130), {minimum:Math.min(...result.rows.map(r=>r.headWidth)),maximum:Math.max(...result.rows.map(r=>r.headWidth)),reason:'Authored widths are approximately 142–152 model units; the former mirrored-column collapse produced about 74.'});
    check('dense yaw renderer has no errors or invalid parts', result.rows.every(r => !r.rendererErrors?.length && !r.figureErrors?.length && !r.invalidParts?.length));
    for (const row of result.images) {
      const name = row.angle < 0 ? 'left' : row.angle > 0 ? 'right' : 'front';
      const file = `angle-${name}-${Math.abs(row.angle)}-transparent.png`, path = resolve(out, file);
      await atomicWrite(path, Buffer.from(row.data.split(',')[1], 'base64'));
      report.screenshots.push({ file, sha256: await hashFile(path), angle: row.angle, scope: 'Actual transparent logical-space WebGL canvas; native outer SVG transform and FX excluded.' });
    }
    await advance(1, 0);
    for (const background of ['light', 'dark', 'checker']) {
      await page.locator(`button[data-background="${background}"]`).click(); await advance(1, 0);
      await stageShot(`stage-${background}`, { background });
    }
  });

  await phase('trusted-pointer', async () => {
    await reset();
    async function hitPoint() {
      const p = await page.evaluate(() => {
        const hit = maodouPreview.body.layout.hit.find(c => maodouPreview.body.hit(c));
        if (!hit) throw new Error('No actual hit-circle centre accepted');
        const r = document.querySelector('#stage').getBoundingClientRect(); return { x: r.left + hit.x, y: r.top + hit.y, stage: { x: r.left, y: r.top, width: r.width, height: r.height } };
      }); return p;
    }
    const start = await page.evaluate(() => performance.now());
    let p = await hitPoint(); await page.mouse.click(p.x, p.y, { delay: 45 }); await advance(1, 0);
    const clickEvents = await page.evaluate(at => maodouPreview.records.events.filter(e => e.at >= at), start);
    const hasTouch = (events, name) => events.some(e => e.kind === 'touch' && (e.detail?.kind === name || e.detail === name));
    check('real click emits native poke', hasTouch(clickEvents, 'poke'), { events: clickEvents });
    await reset(); p = await hitPoint();
    await page.evaluate(() => maodouPreview.setPaused(false));
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    await page.mouse.move(p.x + 65, p.y - 70, { steps: 8 }); await page.waitForTimeout(80); await advance(1, 1/60);
    const drag = await inspect(); await stageShot('pointer-drag');
    check('real movement enters drag mode', drag.mode === 'drag', { mode: drag.mode });
    // Trusted real events, without fabricated timestamps or a pass-seeking retry.
    await page.evaluate(() => maodouPreview.setPaused(false));
    await page.mouse.move(p.stage.x + p.stage.width * .27, p.stage.y + p.stage.height * .34);
    await page.mouse.move(p.stage.x + p.stage.width * .76, p.stage.y + p.stage.height * .23);
    await page.mouse.up(); await advance(1, 0);
    const air = await inspect(); await stageShot('pointer-air');
    let land = null; const modes = [{ dt: 0, mode: air.mode }];
    for (let i = 0; i < 120; i++) {
      await advance(1, .05); const s = await inspect(); modes.push({ dt: (i + 1) * .05, mode: s.mode });
      // Pinned native land() enters dizzy and emits crash for a strong throw;
      // this is a real landing path, not an unsuccessful airborne recovery.
      if (s.mode === 'land' || s.mode === 'dizzy') { land = s; await stageShot('pointer-land'); break; }
    }
    const records = await page.evaluate(at => ({ events: maodouPreview.records.events.filter(e => e.at >= at), inputs: maodouPreview.records.inputs, errors: maodouPreview.records.errors }), start);
    report.pointer = { inputScope: 'Playwright real mouse input; raw native timestamps retained. No inferred cause if a native event threshold fails.', drag, air, land, modes, ...records };
    check('real pointer inputs are trusted', records.inputs.length > 0 && records.inputs.every(i => i.isTrusted));
    check('real drag emits native grab', hasTouch(records.events, 'grab'));
    check('real fast release emits native throw', hasTouch(records.events, 'throw'));
    const floorY=await page.evaluate(()=>maodouPreview.bounds().floorY);
    const grounded=land && Math.abs(land.xf.AY-floorY)<.1;
    const nativeLanding=land?.mode==='land'||(land?.mode==='dizzy'&&hasTouch(records.events,'crash'));
    check('release enters air and reaches a native grounded landing state', air.mode === 'air' && grounded && nativeLanding, {releaseMode:air.mode,landingMode:land?.mode??null,footY:land?.xf.AY??null,floorY,nativeRule:'Pinned kit/body.js land(): a throw impact >1000 enters dizzy and emits crash; other impacts enter land.'});
  });

  await phase('talk-and-personality', async () => {
    await reset();
    const baseline = await inspect(), samples = [];
    for (let i = 0; i < 60; i++) {
      if (i % 6 === 0) await page.evaluate(() => maodouPreview.body.talk());
      await advance(); const s = await inspect(); samples.push({ index: i, talk: s.frame?.talk, mouthH: s.figure.pose.mouthH });
    }
    await stageShot('talk-speaking'); await advance(60, .05); const stopped = await inspect();
    const before = baseline.figure.pose.mouthH, peak = Math.max(...samples.map(s => s.mouthH)), after = stopped.figure.pose.mouthH;
    report.talk = { scope: 'Native talk activity simulation, no audio or phoneme analysis.', fixedFrames: 60, dt: 1 / 60, pulses: 10, recoverySeconds: 3, before, peak, after, samples };
    check('native talk changes actual mouth height', Number.isFinite(peak) && peak > before + .5, { before, peak });
    check('mouth returns toward rest after input stops', Number.isFinite(after) && Math.abs(after - before) < Math.abs(peak - before), { before, peak, after });
    report.schemes = [];
    for (const scheme of ['gentle', 'lively']) {
      await reset(); await page.evaluate(async id => { await maodouPreview.body.setScheme(id); maodouPreview.body.do('ear-wave'); await maodouPreview.advance(60, 1 / 60); }, scheme);
      const s = await inspect(); report.schemes.push({ requested: scheme, scheme: s.figure.scheme, movementGain: s.figure.animator.movementGain, pose: s.figure.pose, animator: s.figure.animator });
    }
    const [gentle, lively] = report.schemes;
    check('both schemes are actually selected', gentle.scheme === 'gentle' && lively.scheme === 'lively');
    check('both personality samples execute the registered ear-wave gesture', report.schemes.every(s=>s.animator.frame.gesture?.kind==='ear-wave'));
    check('lively has greater actual movement gain and distinct pose', lively.movementGain > gentle.movementGain && JSON.stringify(lively.pose) !== JSON.stringify(gentle.pose), { gentle: gentle.movementGain, lively: lively.movementGain });
    await page.evaluate(() => maodouPreview.body.setScheme('gentle'));
  });

  await phase('eight-second-real-time-sweep', async () => {
    await reset();
    await page.evaluate(() => { maodouPreview.setSweep(true, 8); maodouPreview.setPaused(false); });
    report.sweep = await page.evaluate(() => maodouPreview.measure({ seconds: 8, label: 'continuous authored yaw sweep' }));
    report.sweep.scopeNote = 'One fixed wall-clock window, not retried. Sweep phase uses simulation time; capped dt means a very slow renderer may cover less than a full simulated cycle. Completed body frames and page RAF are distinct. No stable-60-FPS claim.';
    await page.evaluate(() => { maodouPreview.setPaused(true); maodouPreview.setSweep(false); });
    check('timed sweep returns actual completed frame measurements', report.sweep.readyThroughout && report.sweep.characterFrames.samples > 1 && Number.isFinite(report.sweep.characterFrames.fps));
  });
  report.sourcesAfter = await getSources();
  report.sourcesUnchanged = report.sourcesAfter.status.ready && JSON.stringify(report.sourcesBefore.stage.sourceFiles) === JSON.stringify(report.sourcesAfter.stage.sourceFiles);
  check('native source hashes unchanged', report.sourcesUnchanged);
  report.nativeFinal = await inspect();
  report.nativeRecords = await page.evaluate(() => maodouPreview.records);
  check('native host and final renderer report no errors', !report.nativeRecords.errors.length && !report.nativeFinal.figure.errors.length && !report.nativeFinal.figure.renderer.errors.length);
  await page.close();

  await phase('offline-file', async () => {
    const context = await browser.newContext({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1 });
    const requests = [];
    try {
      await context.route(/^https?:\/\//, route => { requests.push(route.request().url()); return route.abort('blockedbyclient'); });
      const local = await context.newPage(); logPage(local, 'offline');
      await local.goto(pathToFileURL(offlineFile).href, { waitUntil: 'domcontentloaded' });
      await local.waitForFunction(() => window.maodouStandalone?.ready, null, { timeout: 30000 });
      await local.evaluate(async () => { maodouStandalone.setPaused(true); await maodouStandalone.advance(36, 1 / 60); });
      const observation = await local.evaluate(() => ({ ready: maodouStandalone.ready, renderedFrames: maodouStandalone.renderedFrames, source: maodouStandalone.source, records: maodouStandalone.records, inspect: maodouStandalone.body.inspect(), expressions: document.querySelectorAll('#expressions [data-word]').length, motions: document.querySelectorAll('#motions [data-word]').length }));
      report.offline = { file: options.offline ?? 'exports/Maodou-Offline-Preview-v1.3.2.html', sha256: await hashFile(offlineFile), scope: 'Direct file preview with HTTP/HTTPS blocked; intentionally distinct from the native iframe sandbox.', blockedRequests: requests, ...observation };
      const file = 'offline-preview-full.png', path = resolve(out, file); await atomicWrite(path, await local.screenshot({ fullPage: true }));
      report.screenshots.push({ file, sha256: await hashFile(path), scope: 'Actual standalone file full page, with HTTP/HTTPS requests blocked.' });
      check('offline file renders with 25 expression and 28 motion controls', observation.ready && observation.renderedFrames >= 36 && observation.expressions === 25 && observation.motions === 28, { expressions: observation.expressions, motions: observation.motions, renderedFrames: observation.renderedFrames });
      check('offline makes zero HTTP or HTTPS requests', requests.length === 0, { requests });
      check('offline renderer has no errors', !observation.records.errors.length && !observation.inspect.figure.renderer.errors.length && !observation.inspect.figure.renderer.contextLost);
      const staged = new Map(report.sourcesBefore.stage.files.map(f => [f.path, f.sha256]));
      check('offline embeds current staged figure and model', observation.source.figureSha256 === staged.get('figure.js') && observation.source.modelSha256 === staged.get('model.json'), { embeddedFigure: observation.source.figureSha256, stagedFigure: staged.get('figure.js'), embeddedModel: observation.source.modelSha256, stagedModel: staged.get('model.json') });
    } finally { await context.close(); }
  });
} catch (error) { report.errors.push({ phase: 'setup-or-finalization', error: String(error.stack ?? error) }); }
finally {
  try { await browser?.close(); } catch (error) { report.errors.push({ cleanup: String(error) }); }
  if (server) { server.closeAllConnections?.(); await new Promise(done => server.close(done)); }
  const expected = ['dense-yaw-and-transparent-views', 'trusted-pointer', 'talk-and-personality', 'eight-second-real-time-sweep', 'offline-file'];
  for (const id of expected) if (!report.phases.some(p => p.id === id)) report.phases.push({ id, status: 'not_run' });
  report.status = report.phases.every(p => p.status === 'complete') && !report.errors.length ? 'complete' : 'completed_with_errors';
  report.passed = report.status === 'complete' && report.sourcesUnchanged && report.checks.every(c => c.passed);
  report.completedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ status: report.status, passed: report.passed, checks: report.checks.filter(c => c.passed).length, total: report.checks.length, report: reportFile, errors: report.errors }));
  if (!report.passed) process.exitCode = 1;
}
