#!/usr/bin/env node
/** Operator-run browser harness. Writing or --help does not launch a browser. */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { projectRoot, atomicWrite, hashFile } from './pack-tools.mjs';

const HELP = `Actual native-frame QA, to run only after the character and stage are frozen.
Usage: node preview-host/qa-native-browser.mjs --chromium=/path/to/chrome [options]
  --phase=angles|words|performance  default angles
  --url=http://127.0.0.1:4323       running preview server
  --out=docs/qa/native-angles       output directory, relative to project
  --scale=0.6                      actual logical-unit scale (subject to mobile fit)
  --angles=-75,-60,-45,-30,-15,0,15,30,45,60,75
  --words=all                      or a comma-separated registered id list
  --seconds=6.5                    real-time window per performance case
  --software-webgl                explicit test-environment SwiftShader WebGL flags
Captures use real native ticks. PNGs are visual evidence, not automatic art passes.
Performance reports page RAF and completed body frames separately; no FPS threshold is invented.
An optional factory hook globalThis.__maodouQARegister?.(body) exposes inspect only
to this operator-run browser session. The production frame and CSP are unchanged.
`;
const o = {};
for (const arg of process.argv.slice(2)) {
  if (arg === '--help') { console.log(HELP); process.exit(0); }
  if (arg === '--software-webgl') o.software = true;
  else if (/^--(?:chromium|phase|url|out|scale|angles|words|seconds)=/.test(arg)) { const at = arg.indexOf('='); o[arg.slice(2, at)] = arg.slice(at + 1); }
  else throw new Error(HELP);
}
if (!o.chromium) { console.error(HELP); process.exit(2); }
const phase = o.phase ?? 'angles';
if (!['angles', 'words', 'performance'].includes(phase)) throw new Error('Unknown phase');
const scale = Number(o.scale ?? .6), seconds = Number(o.seconds ?? 6.5);
if (!(scale > 0 && scale <= 1.5) || !(seconds >= 2 && seconds <= 60)) throw new Error('Invalid scale or seconds');
const directory = resolve(projectRoot, o.out ?? `docs/qa/native-${phase}`); await mkdir(directory, { recursive: true });
const reportFile = resolve(directory, 'report.json');
const report = { status: 'in_progress', startedAt: new Date().toISOString(), phase, requestedScale: scale,
  scope: 'Actual native opaque-frame ticks and screenshots. Visual acceptance and stable real-time smoothness are not inferred from technical completion.',
  screenshots: [], observations: [], measurements: [], errors: [], warnings: [], browserFlags: ['--no-sandbox'], visualPassed: null };
if (o.software) report.browserFlags.push('--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader');
let browser;
try {
  let playwright;
  try { playwright = createRequire(import.meta.url)('playwright'); }
  catch { playwright = createRequire(resolve(projectRoot, 'preview-host/package.json'))('playwright'); }
  browser = await playwright.chromium.launch({ executablePath: o.chromium, headless: true, args: report.browserFlags });
  const page = await browser.newPage({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1 });
  // DevTools installs this in each new frame before its scripts execute. It is
  // absent in an ordinary Coopanion session and adds no production message path.
  await page.addInitScript(() => {
    globalThis.__maodouQARegister = body => {
      Object.defineProperty(globalThis, '__maodouQABody', { value: body, configurable: true });
    };
  });
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); else if (m.type() === 'warning') report.warnings.push(m.text()); });
  await page.goto(o.url ?? 'http://127.0.0.1:4323/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.maodouPreview?.ready, null, { timeout: 30000 });
  const getSources = () => page.evaluate(async () => ({ status: await (await fetch('/api/preview')).json(), stage: await (await fetch('/qa/stage-report.json')).json() }));
  report.sourcesBefore = await getSources();
  if (!report.sourcesBefore.status.ready) throw new Error('Staging no longer matches the actual source');
  await page.evaluate(value => { maodouPreview.setScale(value); maodouPreview.setPaused(true); }, scale);
  const reset = () => page.evaluate(async () => {
    const p = maodouPreview; p.setPaused(true); p.setYaw(null, true);
    p.body.set({ roam: 'off', hold: 3600, listening: false, thinking: false });
    p.body.do('stand'); p.body.do('neutral'); await p.advance(60, .05);
    p.body.do('stand'); p.body.do('neutral'); await p.advance(36, 1 / 60);
  });
  async function capture(id, extra = {}) {
    const file = resolve(directory, `${id}.png`);
    await page.locator('#stage').screenshot({ path: file });
    const observation = await page.evaluate(() => ({ layout: maodouPreview.body.layout, completedFrames: maodouPreview.completedFrames,
      originNullObserved: maodouPreview.records.originNullObserved, errors: [...maodouPreview.records.errors], bounds: maodouPreview.bounds() }));
    observation.diagnostics = await inspectBody();
    const raster=await nativeFrame.evaluate(()=>document.querySelector('canvas')?.toDataURL('image/png')??null);
    let rasterRecord=null;
    if(raster){
      const rasterFile=resolve(directory,`${id}-transparent.png`);
      await atomicWrite(rasterFile,Buffer.from(raster.split(',')[1],'base64'));
      rasterRecord={file:`${id}-transparent.png`,sha256:await hashFile(rasterFile),scope:'Actual logical-space canvas; native outer SVG transform and particles are in the stage screenshot.'};
    }
    report.screenshots.push({ id, file: `${id}.png`, sha256: await hashFile(file), raster:rasterRecord, ...extra, observation });
    await atomicWrite(reportFile, JSON.stringify(report, null, 2) + '\n');
  }
  await reset();
  const nativeFrame = page.frames().find(f => f.url().includes('/figure-frame'));
  if (!nativeFrame) throw new Error('No actual native iframe');
  const inspectBody = () => nativeFrame.evaluate(() => {
    const body = globalThis.__maodouQABody;
    return { registered: !!body, inspectAvailable: typeof body?.inspect === 'function',
      inspect: typeof body?.inspect === 'function' ? body.inspect() : null };
  });
  report.initialDiagnostics = await inspectBody();
  report.graphics = await nativeFrame.evaluate(() => [...document.querySelectorAll('canvas')].map(c => {
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { width: c.width, height: c.height, webgl: false };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { width: c.width, height: c.height, webgl: true, error: gl.getError(), attributes: gl.getContextAttributes(),
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  }));
  if (phase === 'angles') {
    const angles = (o.angles ?? '-75,-60,-45,-30,-15,0,15,30,45,60,75').split(',').map(Number);
    if (angles.some(a => !Number.isFinite(a) || Math.abs(a) > 75)) throw new Error('Angles must be within ±75 degrees');
    for (const angle of angles) {
      await page.evaluate(async a => { maodouPreview.setYaw(a / 75, true); await maodouPreview.advance(36, 1 / 60); }, angle);
      await capture(`angle-${angle < 0 ? 'left' : angle > 0 ? 'right' : 'front'}-${Math.abs(angle)}`, { requestedAngle: angle });
    }
  } else if (phase === 'words') {
    const vocab = report.sourcesBefore.status.pack.vocab;
    const ids = !o.words || o.words === 'all' ? vocab.map(w => w.id) : o.words.split(',');
    for (const id of ids) {
      const word = vocab.find(w => w.id === id); if (!word) throw new Error(`Unregistered word ${id}`);
      await reset();
      const advanceFrames = Math.round((word.kind === 'expression' ? .7 : Math.min(1.25, Math.max(.25, word.seconds * .45))) * 60);
      await page.evaluate(async ({ id, frames }) => { maodouPreview.body.do(id); await maodouPreview.advance(frames, 1 / 60); }, { id, frames: advanceFrames });
      await capture(`word-${id}`, { word: id, kind: word.kind, sampledSimulationSeconds: advanceFrames / 60 });
    }
  } else {
    for (const id of ['neutral', 'dance', 'run']) {
      await reset();
      await page.evaluate(id => { maodouPreview.body.do(id); maodouPreview.setPaused(false); }, id);
      // Fixed warmup; the measurement window starts once, never retries for a higher score.
      await page.waitForTimeout(1000);
      const observation = await page.evaluate(async ({ seconds, label }) => maodouPreview.measure({ seconds, label }), { seconds, label: id });
      report.measurements.push(observation); await atomicWrite(reportFile, JSON.stringify(report, null, 2) + '\n');
    }
  }
  report.sourcesAfter = await getSources();
  report.finalDiagnostics = await inspectBody();
  report.sourcesUnchanged = report.sourcesAfter.status.ready && JSON.stringify(report.sourcesBefore.stage.sourceFiles) === JSON.stringify(report.sourcesAfter.stage.sourceFiles);
  if (!report.sourcesUnchanged) throw new Error('Source files changed during this run');
  report.observations.push(await page.evaluate(() => ({ records: maodouPreview.records, completedFrames: maodouPreview.completedFrames })));
  if (report.observations.at(-1).records.errors.length) report.errors.push(...report.observations.at(-1).records.errors);
  report.status = report.errors.length ? 'completed_with_errors' : 'complete';
} catch (e) { report.status = 'failed'; report.errors.push(String(e.stack || e)); process.exitCode = 1; }
finally {
  await browser?.close(); report.completedAt = new Date().toISOString();
  await atomicWrite(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, phase, screenshots: report.screenshots.length, measurements: report.measurements.length, errors: report.errors, report: reportFile }));
}
