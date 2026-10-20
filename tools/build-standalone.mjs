#!/usr/bin/env node
/** Build the actual staged pack into one file://-openable HTML. No browser. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import { projectRoot, hostRoot, vendorRoot, stagedRoot, stageReportFile, stageStatus,
  hash, hashFile, atomicWrite, filesUnder, inRoot, posix, upstreamCommit } from '../preview-host/pack-tools.mjs';

const HELP = `Build a complete local HTML preview from the actual staged Maodou pack.
Usage: node tools/build-standalone.mjs [options]
  --out=exports/Maodou-Offline-Preview-v1.3.1.html
  --report=docs/qa/standalone-build.json
  --help
Prerequisite: node preview-host/stage-pack.mjs, with source files still unchanged.
Embeds the exact staged figure.js, model.json and local assets. Fixed native
kit/body.js and the local UI are bundled by the installed preview-host esbuild.
Normal playback uses no network. The embedded ESM loads from an in-page Blob.
This is a direct local convenience preview, not the native opaque iframe.
Does not launch Chrome, create character art, or claim browser/visual/FPS passes.
`;
const options = {};
for (const arg of process.argv.slice(2)) {
  if (arg === '--help') { console.log(HELP); process.exit(0); }
  const match = /^--(out|report)=(.+)$/.exec(arg);
  if (!match) { console.error(HELP); process.exit(2); }
  options[match[1]] = match[2];
}
const reportPath = inRoot(projectRoot, options.report ?? 'docs/qa/standalone-build.json');
if (extname(reportPath) !== '.json' || posix(relative(projectRoot, reportPath)).startsWith('pack/')) throw new Error('Report must be a project JSON outside pack/.');
const report = { status: 'building', startedAt: new Date().toISOString(),
  scope: 'Build and exact embedded-byte checks only. The local single HTML invokes the same staged character factory with fixed native createPet, but has no opaque iframe boundary.',
  browserTested: false, offlineOpenTested: false, visualTested: false, performanceTested: false, nativeSandbox: false, checks: [], errors: [] };
const sources = new Map();
let currentCheck = 'fresh staging';
async function check(name, fn) {
  currentCheck = name; const details = await fn(); report.checks.push({ name, passed: true, ...(details ? { details } : {}) }); return details;
}
async function track(rel) {
  const data = await readFile(inRoot(projectRoot, rel));
  if (!data.length) throw new Error(`Empty build input: ${rel}`);
  sources.set(rel, { path: rel, bytes: data.length, sha256: hash(data) }); return data;
}
const jsonForHTML = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

try {
  const status = await stageStatus();
  await check('Staged native pack matches the current production sources', () => { assert.equal(status.ready, true, JSON.stringify(status.staged.errors)); });
  const rawStageReport = await readFile(stageReportFile), stageReport = JSON.parse(rawStageReport);
  report.stageReport = { path: posix(relative(projectRoot, stageReportFile)), sha256: hash(rawStageReport) };
  report.productionSources = stageReport.sourceFiles;
  const root = inRoot(stagedRoot, status.pack.id), packFiles = await filesUnder(root);
  const manifestSource = await readFile(resolve(root, 'figure.json'), 'utf8'), manifest = JSON.parse(manifestSource);
  const modelSource = await readFile(inRoot(root, manifest.model), 'utf8'), model = JSON.parse(modelSource);
  const figureSource = await readFile(inRoot(root, manifest.entry), 'utf8');
  const outputPath = inRoot(projectRoot, options.out ?? `exports/Maodou-Offline-Preview-v${manifest.version}.html`);
  if (extname(outputPath) !== '.html' || posix(relative(projectRoot, outputPath)).startsWith('pack/')) throw new Error('HTML output must be a project .html outside pack/.');
  const assets = {}, embeddedFiles = [];
  for (const path of packFiles) {
    const bytes = await readFile(inRoot(root, path)); assert.ok(bytes.length, `Empty staged file ${path}`);
    embeddedFiles.push({ path, bytes: bytes.length, sha256: hash(bytes) });
    if ([manifest.entry, manifest.model, 'figure.json'].includes(path) || !mimeTypes[extname(path).toLowerCase()]) continue;
    assets[path] = { mime: mimeTypes[extname(path).toLowerCase()], base64: bytes.toString('base64') };
  }
  report.pack = { id: manifest.id, version: manifest.version, expressions: manifest.vocab.filter(w => w.kind === 'expression').length,
    motions: manifest.vocab.filter(w => w.kind === 'motion').length, audioFiles: Object.values(assets).filter(a => a.mime.startsWith('audio/')).length };
  await check('The declared painted atlas is embedded with its production checksum', () => {
    const path = model.art?.atlas?.file, asset = assets[path]; assert.ok(asset, `Missing model atlas ${path}`);
    const bytes = Buffer.from(asset.base64, 'base64'); assert.equal(hash(bytes), model.art.atlas.sha256);
    assert.equal(asset.mime, 'image/png'); assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    return { path, bytes: bytes.length, sha256: hash(bytes), scope: 'Original bytes and PNG signature; complete image decode belongs to the runtime/import checks.' };
  });
  const provenance = JSON.parse(await readFile(resolve(vendorRoot, 'provenance.json'), 'utf8'));
  await check('Fixed upstream host and kit inputs retain their pinned bytes', async () => {
    for (const file of provenance.files.filter(f => f.path.startsWith('web/'))) assert.equal(await hashFile(resolve(vendorRoot, file.path)), file.sha256, file.path);
    return { upstreamCommit, files: provenance.files.filter(f => f.path.startsWith('web/')).length };
  });
  const sourcePaths = ['tools/build-standalone.mjs', 'preview-host/standalone.html', 'preview-host/standalone-app.js', 'preview-host/style.css',
    'preview-host/package-lock.json', 'preview-host/vendor/coopanion/LICENSE', 'preview-host/vendor/coopanion/THIRD_PARTY_NOTICES.md',
    'tools/fonts/MaodouPreviewUI.woff2', 'tools/fonts/OFL.txt'];
  for (const path of sourcePaths) await track(path);
  const template = (await readFile(resolve(hostRoot, 'standalone.html'), 'utf8'));
  const uiFont = await readFile(resolve(projectRoot, 'tools/fonts/MaodouPreviewUI.woff2'));
  const fontStyle = `@font-face{font-family:"Maodou Preview UI";src:url(data:font/woff2;base64,${uiFont.toString('base64')}) format("woff2");font-weight:400;font-style:normal;font-display:swap}`;
  const style = fontStyle + await readFile(resolve(hostRoot, 'style.css'), 'utf8') + '\n:root{font-family:"Maodou Preview UI","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif}';
  report.uiFont = {path:'tools/fonts/MaodouPreviewUI.woff2',bytes:uiFont.length,sha256:hash(uiFont),license:'SIL Open Font License 1.1',embedded:true};
  await check('Template and styles contain no external resource dependencies', () => {
    assert.ok(!/@import\b/i.test(style)); assert.ok(!/url\(\s*['"]?(?!data:|blob:)/i.test(style));
    assert.ok(!/<script\b[^>]*\bsrc=/i.test(template)); assert.ok(!/<link\b[^>]*rel=["']stylesheet/i.test(template));
    assert.ok(template.includes("connect-src 'none'"));
  });
  const { build, version: esbuildVersion } = createRequire(resolve(hostRoot, 'package.json'))('esbuild');
  const result = await build({ absWorkingDir: projectRoot, entryPoints: [resolve(hostRoot, 'standalone-app.js')],
    bundle: true, format: 'iife', platform: 'browser', target: 'es2022', write: false, minify: true,
    sourcemap: false, metafile: true, legalComments: 'inline', logLevel: 'silent',
    plugins: [{ name: 'standalone-local-modules', setup(api) {
      api.onResolve({ filter: /^(?:[a-z][a-z\d+.-]*:|\/\/)/i }, args => ({ errors: [{ text: `Non-local module is forbidden: ${args.path}` }] }));
    } }],
  });
  await check('Local UI and original native kit bundle into one script', () => {
    assert.equal(result.outputFiles.length, 1); assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings));
    for (const output of Object.values(result.metafile.outputs)) assert.equal(output.imports.length, 0, JSON.stringify(output.imports));
    const inputs = Object.keys(result.metafile.inputs); assert.ok(inputs.includes('preview-host/vendor/coopanion/web/kit/body.js'));
    return { esbuildVersion, inputs, retainedModuleImports: 0, runtimeModuleLoad: 'Only the already-embedded production figure.js is loaded as a same-document Blob module.' };
  });
  for (const input of Object.keys(result.metafile.inputs)) {
    const path = posix(relative(projectRoot, resolve(projectRoot, input)));
    if (!path.startsWith('preview-host/')) throw new Error(`Unexpected standalone UI module input: ${path}`);
    if (!sources.has(path)) await track(path);
  }
  const script = result.outputFiles[0].text;
  await check('Bundled inline program parses without executing a browser', () => { new Script(script, { filename: 'maodou-standalone-inline.js' }); });
  const licenseText = await readFile(resolve(vendorRoot, 'LICENSE'), 'utf8') + '\n\n--- UPSTREAM THIRD-PARTY NOTICES ---\n\n' + await readFile(resolve(vendorRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8') + '\n\n--- EMBEDDED UI FONT LICENSE ---\n\n' + await readFile(resolve(projectRoot,'tools/fonts/OFL.txt'),'utf8');
  const payload = { manifestSource, modelSource, figureSource, assets, licenseText,
    provenance: { upstreamCommit, figureSha256: hash(figureSource), modelSha256: hash(modelSource), manifestSha256: hash(manifestSource),
      assets: embeddedFiles.filter(f => assets[f.path]), sourceFiles: stageReport.sourceFiles, stagedFigurePath: `${stageReport.destination}/${manifest.entry}`,
      nativeSandbox: false, buildScope: 'Exact installed code and assets embedded for a direct local preview.' } };
  // Replacement callbacks keep literal `$&`, `$'` and `$`` sequences in the
  // embedded production code intact instead of interpreting them as templates.
  const html = template.replace('/*__STANDALONE_STYLE__*/', () => style).replace('/*__STANDALONE_PAYLOAD__*/', () => jsonForHTML(payload))
    .replace('/*__STANDALONE_SCRIPT__*/', () => script.replace(/<\/script/gi, '<\\/script'));
  await check('Final embedded model, module and assets round-trip to the staged bytes', () => {
    const embedded = /<script id="maodou-embedded" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(embedded); const recovered = JSON.parse(embedded[1]);
    assert.equal(hash(recovered.figureSource), hash(figureSource)); assert.equal(hash(recovered.modelSource), hash(modelSource)); assert.equal(hash(recovered.manifestSource), hash(manifestSource));
    for (const [path, image] of Object.entries(recovered.assets)) assert.equal(hash(Buffer.from(image.base64, 'base64')), embeddedFiles.find(f => f.path === path).sha256, path);
    assert.ok(!html.includes('/*__STANDALONE_')); return { assets: Object.keys(assets).length, exactFigureBytes: Buffer.byteLength(figureSource), exactModelBytes: Buffer.byteLength(modelSource) };
  });
  await check('Source and staging hashes remain unchanged through the build', async () => {
    assert.equal(await hashFile(stageReportFile), hash(rawStageReport), 'Stage report changed during the build');
    const now = await stageStatus(); assert.equal(now.ready, true, JSON.stringify(now.staged.errors));
    for (const file of sources.values()) assert.equal(await hashFile(inRoot(projectRoot, file.path)), file.sha256, file.path);
  });
  await atomicWrite(outputPath, html);
  await check('The published HTML reads back with exactly the constructed bytes', async () => { assert.equal(await hashFile(outputPath), hash(html)); });
  report.output = { path: posix(relative(projectRoot, outputPath)), bytes: Buffer.byteLength(html), sha256: hash(html) };
  report.embedded = payload.provenance; report.builderSources = [...sources.values()].sort((a, b) => a.path.localeCompare(b.path));
  report.status = 'built';
} catch (error) {
  report.status = 'failed'; report.checks.push({ name: currentCheck, passed: false, error: String(error.message ?? error) });
  report.errors.push(String(error.stack ?? error)); process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString(); await atomicWrite(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, output: report.output ?? null, report: reportPath, errors: report.errors }));
}
