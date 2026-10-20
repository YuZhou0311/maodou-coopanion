#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, dirname, relative } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { zipSync } from 'fflate';
import { loadNativeImporter } from './native-importer.mjs';
import { projectRoot, hostRoot, sourceRoot, stagedRoot, filesUnder, hash, hashFile, atomicWrite, stageStatus, inRoot, posix } from './pack-tools.mjs';

const HELP = `Run the unchanged Coopanion manifest and ZIP importer locally.
Usage:
  node preview-host/validate-native.mjs --schema-only [--report=docs/qa/manifest-schema.json]
  node preview-host/validate-native.mjs --zip=exports/pack.zip [--report=docs/qa/native-import.json]
  node preview-host/validate-native.mjs --build-zip=exports/pack.zip [--report=docs/qa/native-import.json]
--schema-only reads pack/figure.json only. It does not require or validate artwork.
--build-zip requires a fresh successful stage-pack result and packages that directory.
--zip reads the actual supplied ZIP. Stage/install happen only in this project's QA temp directory.
No browser is run. Native import success does not prove visuals, interaction or FPS.
`;
const args = process.argv.slice(2), options = {};
for (const a of args) {
  if (a === '--help') { console.log(HELP); process.exit(0); }
  if (a === '--schema-only') options.schema = true;
  else if (/^--(?:zip|build-zip|report)=.+/.test(a)) { const at = a.indexOf('='); options[a.slice(2, at)] = a.slice(at + 1); }
  else { console.error(HELP); process.exit(2); }
}
if ([!!options.schema, !!options.zip, !!options['build-zip']].filter(Boolean).length !== 1) { console.error(HELP); process.exit(2); }
const reportFile = resolve(projectRoot, options.report ?? `preview-host/qa/${options.schema ? 'manifest-schema' : 'native-import'}.json`);
const report = { checkedAt: new Date().toISOString(), mode: options.schema ? 'schema-only' : options.zip ? 'zip-readback' : 'zip-build-and-readback', passed: false,
  scope: options.schema ? 'Original upstream readManifest validation only; no asset, factory, ZIP or browser acceptance.' : 'Original upstream ZIP decode, stage, install and manifest readback in an isolated local directory; additional CRC/PNG and byte comparisons. No browser or visual acceptance.',
  checks: [], errors: [], browserTested: false, visualTested: false, performanceTested: false };
let importer, scratch, previousTmpdir = process.env.TMPDIR, step = 'load original importer';
async function check(name, fn) {
  step = name;
  const details = await fn(); report.checks.push({ name, passed: true, ...(details ? { details } : {}) }); return details;
}
try {
  const loaded = await loadNativeImporter(), native = loaded.native; report.native = loaded.provenance;
  await check('Unchanged native validator sources compile without stubs', () => ({ sourceFiles: loaded.provenance.sourceFiles.length, compiledSha256: loaded.provenance.compiledSha256 }));
  const canonical = JSON.parse(await readFile(resolve(sourceRoot, 'figure.json'), 'utf8'));
  report.sourceManifest = { path: 'pack/figure.json', sha256: await hashFile(resolve(sourceRoot, 'figure.json')) };
  if (options.schema) {
    const skipped = [];
    const manifest = await check('Original readManifest accepts production schema', () => {
      const m = native.readManifest(sourceRoot, false, skipped); assert.notEqual(typeof m, 'string', String(m)); return m;
    });
    await check('Registered word counts and schemes survive original parsing', () => {
      assert.equal(manifest.vocab.length, canonical.vocab.length); assert.equal(skipped.length, 0);
      return { expressions: manifest.vocab.filter(w => w.kind === 'expression').length, motions: manifest.vocab.filter(w => w.kind === 'motion').length, axes: manifest.axes, skipped };
    });
  } else {
    let archiveFile = resolve(projectRoot, options.zip ?? options['build-zip']);
    if (options['build-zip']) {
      const status = await stageStatus();
      await check('Published staging output still matches all recorded sources', () => { assert.equal(status.ready, true, JSON.stringify(status.staged.errors)); });
      const stageReport = JSON.parse(await readFile(resolve(hostRoot, 'qa/stage-report.json'), 'utf8'));
      report.buildSources = stageReport.sourceFiles;
      const staged = inRoot(stagedRoot, status.pack.id), files = await filesUnder(staged), entries = {};
      for (const p of files) entries[`${status.pack.id}/${p}`] = [new Uint8Array(await readFile(inRoot(staged, p))), { level: 6, mtime: new Date('2020-01-01T00:00:00Z') }];
      const bytes = zipSync(entries); await atomicWrite(archiveFile, bytes);
      await check('Written ZIP reads back with the same bytes', async () => { assert.equal(await hashFile(archiveFile), hash(bytes)); return { files: files.length }; });
    }
    const archiveBytes = new Uint8Array(await readFile(archiveFile));
    report.archive = { path: posix(relative(projectRoot, archiveFile)), bytes: archiveBytes.length, sha256: hash(archiveBytes) };
    const files = await check('Original filesFromZip decodes the actual archive', () => {
      const parsed = native.filesFromZip(archiveBytes); assert.ok(Array.isArray(parsed), String(parsed)); assert.ok(parsed.length > 0); return parsed;
    });
    // Keep contents out of JSON; their hashes are recorded after the native install.
    report.checks.at(-1).details = { files: files.length };
    await check('ZIP CRC and every packaged PNG fully decode', async () => {
      const python = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python';
      const code = "import sys,json,zipfile,io; from PIL import Image; z=zipfile.ZipFile(sys.argv[1]); bad=z.testzip(); assert bad is None,bad; out=[]\nfor n in z.namelist():\n if n.lower().endswith('.png'):\n  data=z.read(n); im=Image.open(io.BytesIO(data)); im.verify(); im=Image.open(io.BytesIO(data)); im.load(); out.append({'path':n,'width':im.width,'height':im.height})\nprint(json.dumps({'crcPassed':True,'pngs':out}))";
      const { stdout } = await promisify(execFile)(python, ['-c', code, archiveFile], { maxBuffer: 1024 * 1024 }); return JSON.parse(stdout);
    });
    const tempParent = resolve(hostRoot, 'qa/tmp'); await mkdir(tempParent, { recursive: true }); process.env.TMPDIR = tempParent;
    scratch = await mkdtemp(join(tempParent, 'native-readback-')); const installedRoot = resolve(scratch, 'installed');
    importer = new native.PackImporter({ packDir: () => installedRoot, packs: () => [] });
    const stage = await check('Original PackImporter.stage discovers exactly the intended pack', async () => {
      const s = await importer.stage(files, false); assert.equal(s.error, undefined, s.error); assert.equal(s.problems.length, 0, JSON.stringify(s.problems)); assert.equal(s.packs.length, 1); assert.equal(s.packs[0].id, canonical.id); assert.equal(s.packs[0].skipped.length, 0); return s;
    });
    report.checks.at(-1).details = { packs: stage.packs.map(({ thumb, ...pack }) => ({ ...pack, thumbnailAvailable: !!thumb })), problems: stage.problems };
    await check('Original PackImporter.install completes in the isolated destination', async () => {
      const installed = await importer.install(stage.token, stage.packs.map(p => p.dir)); assert.deepEqual(installed.installed, [canonical.id]); return installed;
    });
    const dir = resolve(installedRoot, canonical.id), prefix = stage.packs[0].dir ? stage.packs[0].dir + '/' : '';
    const expected = files.filter(f => f.path.startsWith(prefix)).map(f => ({ path: f.path.slice(prefix.length), bytes: f.bytes.length, sha256: hash(f.bytes) }));
    report.files = expected;
    await check('Every installed file is byte-identical to the archive entry', async () => {
      const actual = await filesUnder(dir); assert.deepEqual([...actual].sort(), expected.map(f => f.path).sort());
      for (const f of expected) { assert.ok(f.bytes > 0, `empty file ${f.path}`); assert.equal(await hashFile(inRoot(dir, f.path)), f.sha256); }
      return { files: actual.length };
    });
    const installedManifest = await check('Original readManifest reads the installed pack back', () => {
      const skipped = [], m = native.readManifest(dir, false, skipped);
      assert.notEqual(typeof m, 'string', String(m)); assert.equal(m.id, canonical.id); assert.equal(m.version, canonical.version); assert.equal(skipped.length, 0);
      assert.deepEqual(m.vocab, native.readManifest(sourceRoot, false, []).vocab);
      assert.deepEqual(m.axes, native.readManifest(sourceRoot, false, []).axes);
      return m;
    });
    report.pack = { id: installedManifest.id, version: installedManifest.version, expressions: installedManifest.vocab.filter(w => w.kind === 'expression').length, motions: installedManifest.vocab.filter(w => w.kind === 'motion').length, sounds: Object.keys(installedManifest.sounds).length };
    await check('Declared entry and JSON model really exist in the installed directory', async () => {
      assert.ok((await readFile(inRoot(dir, installedManifest.entry))).length > 0);
      assert.ok(JSON.parse(await readFile(inRoot(dir, installedManifest.model), 'utf8')));
    });
  }
  report.passed = true;
} catch (error) {
  report.checks.push({ name: step, passed: false, error: String(error.message ?? error) }); report.errors.push(String(error.stack ?? error)); process.exitCode = 1;
} finally {
  try { await importer?.cancel(); if (scratch) await rm(scratch, { recursive: true, force: true }); }
  catch (error) { report.passed = false; report.errors.push(`Temporary importer cleanup failed: ${error.message ?? error}`); process.exitCode = 1; }
  finally { if (previousTmpdir === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previousTmpdir; }
  await atomicWrite(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, report: reportFile, errors: report.errors }));
}
