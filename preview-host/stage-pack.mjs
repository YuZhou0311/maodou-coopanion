#!/usr/bin/env node
import { readFile, mkdir, rm, rename } from 'node:fs/promises';
import { resolve, relative, extname, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sourceRoot, projectRoot, stagedRoot, stageReportFile, sourceStatus, filesUnder, inRoot, hash, hashFile, posix, atomicWrite, upstreamCommit } from './pack-tools.mjs';

const HELP = `Stage Maodou's actual source as a self-contained Coopanion API 2 directory.
Usage: node preview-host/stage-pack.mjs [--check | --help]
  --check  Report required source files without building.
  Default  Bundle pack/figure.js and its own runtime imports into one figure.js,
           copy the actual model/assets, and atomically publish preview-host/staged/<id>/.
Input:   pack/figure.json (the only production manifest), its entry/model/assets.
Output:  preview-host/staged/<id>/; preview-host/qa/stage-report.json.
Requires npm install in preview-host. Does not create art, a placeholder pet,
a Cubism model, or claim native-import/browser/visual validation.
`;
const args = new Set(process.argv.slice(2));
if (args.has('--help')) { console.log(HELP); process.exit(0); }
if ([...args].some(a => a !== '--check')) { console.error(HELP); process.exit(2); }
const source = await sourceStatus();
if (args.has('--check')) { console.log(JSON.stringify(source, null, 2)); process.exit(source.complete ? 0 : 2); }
if (!source.complete) {
  const report = { status: 'blocked', createdAt: new Date().toISOString(), source, scope: 'No character was staged. Required source files are incomplete.' };
  await atomicWrite(stageReportFile, JSON.stringify(report, null, 2) + '\n');
  console.error(JSON.stringify(report)); process.exit(2);
}

let pending, backup, destination;
try {
  const { build } = await import('esbuild');
  const manifest = source.manifest, packFiles = await filesUnder(sourceRoot);
  const sourceRows = new Map();
  for (const rel of packFiles) {
    const data = await readFile(inRoot(sourceRoot, rel));
    if (!data.length) throw new Error(`Empty source file: pack/${rel}`);
    sourceRows.set(`pack/${rel}`, { path: `pack/${rel}`, bytes: data.length, sha256: hash(data) });
  }
  const result = await build({
    absWorkingDir: projectRoot, entryPoints: [inRoot(sourceRoot, manifest.entry)],
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false,
    outfile: 'figure.js', sourcemap: false, metafile: true, legalComments: 'inline', logLevel: 'silent',
    plugins: [{ name: 'local-runtime-only', setup(api) {
      api.onResolve({ filter: /^(?:[a-z][a-z\d+.-]*:|\/\/)/i }, args => ({ errors: [{ text: `Network or builtin module import is not allowed in a staged pack: ${args.path}` }] }));
    } }],
  });
  if (result.outputFiles.length !== 1 || result.outputFiles[0].path.split(/[\\/]/).at(-1) !== 'figure.js') throw new Error('Expected exactly one bundled JavaScript output');
  for (const [path, output] of Object.entries(result.metafile.outputs)) {
    if (output.imports?.length) throw new Error(`The bundle retains imports: ${path}`);
    if (!output.exports.includes(manifest.export)) throw new Error(`The entry does not export ${manifest.export}`);
  }
  for (const input of Object.keys(result.metafile.inputs)) {
    const rel = posix(relative(projectRoot, resolve(projectRoot, input)));
    if (!rel.startsWith('pack/') && !rel.startsWith('runtime/')) throw new Error(`Own runtime sources must remain in pack/ or runtime/: ${rel}`);
    const data = await readFile(inRoot(projectRoot, rel));
    sourceRows.set(rel, { path: rel, bytes: data.length, sha256: hash(data) });
  }
  pending = resolve(stagedRoot, `.pending-${process.pid}-${randomUUID()}`);
  await mkdir(pending, { recursive: true });
  const outputs = new Map();
  for (const rel of packFiles) {
    if (rel === 'figure.json' || /\.(?:mjs|cjs|js|jsx|ts|tsx)$/i.test(extname(rel))) continue;
    outputs.set(rel, await readFile(inRoot(sourceRoot, rel)));
  }
  outputs.set('figure.js', result.outputFiles[0].contents);
  outputs.set('figure.json', Buffer.from(JSON.stringify({ ...manifest, entry: 'figure.js' }, null, 2) + '\n'));
  for (const [rel, data] of outputs) await atomicWrite(inRoot(pending, rel), data);
  for (const row of sourceRows.values()) {
    if (await hashFile(inRoot(projectRoot, row.path)) !== row.sha256) throw new Error(`Source changed during build: ${row.path}`);
  }
  if (JSON.stringify(await filesUnder(sourceRoot)) !== JSON.stringify(packFiles)) throw new Error('The source pack file list changed during build');
  const files = [...outputs].map(([path, data]) => ({ path, bytes: data.length, sha256: hash(data) })).sort((a, b) => a.path.localeCompare(b.path));
  destination = inRoot(stagedRoot, manifest.id);
  backup = resolve(stagedRoot, `.previous-${process.pid}-${randomUUID()}`);
  try { await rename(destination, backup); } catch (e) { if (e.code !== 'ENOENT') throw e; backup = null; }
  await rename(pending, destination); pending = null;
  if (backup) { await rm(backup, { recursive: true }); backup = null; }
  const report = { status: 'ready', createdAt: new Date().toISOString(), id: manifest.id, version: manifest.version,
    source: 'pack/figure.json', upstreamCommit, destination: posix(relative(projectRoot, destination)),
    scope: 'Self-contained local staging and hash checks. Native import and opaque-frame runtime acceptance remain separate checks.',
    nativeImportTested: false, browserTested: false, sourceFiles: [...sourceRows.values()].sort((a, b) => a.path.localeCompare(b.path)),
    packSourceFiles: packFiles, files, bundleWarnings: result.warnings.map(w => w.text),
    bundleInputs: Object.keys(result.metafile.inputs), retainedExternalImports: 0 };
  await atomicWrite(stageReportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, destination, files: files.length, report: stageReportFile }));
} catch (error) {
  if (pending) await rm(pending, { recursive: true, force: true });
  if (backup && destination) { try { await rename(backup, destination); } catch {} }
  const report = { status: 'failed', createdAt: new Date().toISOString(), error: String(error.stack || error), scope: 'No successful staging or runtime result is claimed.' };
  await atomicWrite(stageReportFile, JSON.stringify(report, null, 2) + '\n');
  console.error(JSON.stringify(report)); process.exitCode = 1;
}
