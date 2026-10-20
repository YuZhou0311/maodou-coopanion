import { readFile, readdir, stat, realpath, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const hostRoot = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(hostRoot, '..');
export const sourceRoot = resolve(projectRoot, 'pack');
export const stagedRoot = resolve(hostRoot, 'staged');
export const vendorRoot = resolve(hostRoot, 'vendor/coopanion');
export const stageReportFile = resolve(hostRoot, 'qa/stage-report.json');
export const upstreamCommit = '04ce022a8c1e96e6053d9cbbe8f6dc555aa93f33';
export const hash = data => createHash('sha256').update(data).digest('hex');
export const hashFile = async file => hash(await readFile(file));
export const posix = p => p.split(sep).join('/');
export function inRoot(root, rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\\') || rel.startsWith('/') || rel.split('/').includes('..') || /^[a-z][a-z\d+.-]*:/i.test(rel) || /[\x00-\x1f]/.test(rel)) {
    throw new Error(`Unsafe relative path: ${String(rel)}`);
  }
  const file = resolve(root, rel), inside = relative(root, file);
  if (!inside || inside.startsWith('..' + sep) || inside === '..') throw new Error('Path escapes its root');
  return file;
}
export async function filesUnder(root) {
  const out = [];
  async function walk(dir, prefix = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const rel = prefix + e.name;
      if (e.isSymbolicLink()) throw new Error(`Symlinks are not staged: ${rel}`);
      if (e.isDirectory()) await walk(resolve(dir, e.name), rel + '/');
      else if (e.isFile()) out.push(rel);
    }
  }
  await walk(root); return out;
}
export async function atomicWrite(file, data) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.pending-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, data); await rename(temporary, file);
}
export async function sourceStatus() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolve(sourceRoot, 'figure.json'), 'utf8'));
    if (manifest.manifest !== 2 || manifest.api !== 2) throw new Error('This host expects manifest 2 / API 2');
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(manifest.id) || manifest.id === 'coo') throw new Error('Invalid installed pack id');
    if (typeof manifest.export !== 'string' || !manifest.export) throw new Error('Factory export is not declared');
    const missing = [];
    for (const [role, rel] of [['entry', manifest.entry], ['model', manifest.model]]) {
      const file = inRoot(sourceRoot, rel);
      try { if (!(await stat(file)).size) missing.push({ role, path: rel, reason: 'empty' }); }
      catch (e) { if (e.code === 'ENOENT') missing.push({ role, path: rel, reason: 'missing' }); else throw e; }
    }
    if (!missing.some(m => m.role === 'model')) JSON.parse(await readFile(inRoot(sourceRoot, manifest.model), 'utf8'));
    return { manifest, complete: missing.length === 0, missing,
      scope: 'Required source paths and JSON syntax only. This is not the upstream importer or a render test.' };
  } catch (e) { return { manifest: manifest ?? null, complete: false, missing: [], error: String(e.message) }; }
}
export async function stageStatus() {
  const source = await sourceStatus();
  let report = null, errors = [], pack = null;
  try {
    report = JSON.parse(await readFile(stageReportFile, 'utf8'));
    if (report.status !== 'ready') errors.push('The latest staging operation did not finish');
    else {
      for (const row of report.sourceFiles ?? []) {
        const file = inRoot(projectRoot, row.path);
        if (await hashFile(file) !== row.sha256) errors.push(`Source changed: ${row.path}`);
      }
      const currentPackFiles = await filesUnder(sourceRoot);
      if (JSON.stringify(currentPackFiles) !== JSON.stringify(report.packSourceFiles)) errors.push('The source pack file list changed');
      const root = inRoot(stagedRoot, report.id);
      for (const row of report.files ?? []) {
        const file = inRoot(root, row.path);
        if (await hashFile(file) !== row.sha256) errors.push(`Staged file changed: ${row.path}`);
      }
      pack = JSON.parse(await readFile(resolve(root, 'figure.json'), 'utf8'));
      pack = { ...pack, axes: pack.axes ?? [], presets: pack.presets ?? [], vocab: pack.vocab ?? [], base: `/packs/${report.id}/` };
    }
  } catch (e) {
    if (e.code !== 'ENOENT') errors.push(String(e.message));
    else errors.push('No complete staged character pack is available');
  }
  return { source, ready: source.complete && report?.status === 'ready' && errors.length === 0, pack,
    staged: { status: report?.status ?? 'missing', createdAt: report?.createdAt ?? null, errors,
      report: '/qa/stage-report.json', files: report?.files?.length ?? 0 }, upstreamCommit };
}
export async function checkedFile(root, rel) {
  const file = inRoot(root, rel), actual = await realpath(file), actualRoot = await realpath(root);
  const r = relative(actualRoot, actual);
  if (!r || r === '..' || r.startsWith('..' + sep) || !(await stat(actual)).isFile()) throw new Error('Not an allowed file');
  return actual;
}
