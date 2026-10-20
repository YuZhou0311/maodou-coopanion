import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { hostRoot, vendorRoot, hash, hashFile, atomicWrite, upstreamCommit } from './pack-tools.mjs';

/** Compiles the unchanged upstream TS modules and their real dependencies; no validation stubs. */
export async function loadNativeImporter() {
  const provenance = JSON.parse(await readFile(resolve(vendorRoot, 'provenance.json'), 'utf8'));
  const sourceFiles = provenance.files.filter(f => f.path.startsWith('src/'));
  for (const row of sourceFiles) {
    if (await hashFile(resolve(vendorRoot, row.path)) !== row.sha256) throw new Error(`Pinned native source changed: ${row.path}`);
  }
  const result = await build({
    absWorkingDir: hostRoot,
    stdin: { contents: "export { readManifest, MANIFEST_VERSION, FIGURE_API } from './vendor/coopanion/src/packs.ts'; export { PackImporter, filesFromZip, IMPORT_MAX } from './vendor/coopanion/src/pack-import.ts';", resolveDir: hostRoot, sourcefile: 'native-importer-entry.ts' },
    bundle: true, format: 'esm', platform: 'node', target: 'node22', write: false,
    outfile: 'native-importer-runtime.mjs', metafile: true, logLevel: 'silent',
  });
  if (result.warnings.length) throw new Error(result.warnings.map(w => w.text).join('\n'));
  const compiled = result.outputFiles[0].contents, sha256 = hash(compiled);
  const cache = resolve(hostRoot, 'qa/native-runner'); await mkdir(cache, { recursive: true });
  const path = resolve(cache, `native-importer-${sha256.slice(0, 16)}.mjs`);
  await atomicWrite(path, compiled);
  const native = await import(pathToFileURL(path).href);
  return { native, provenance: { upstreamCommit, sourceFiles, compiledSha256: sha256,
    esbuild: '0.28.2', fflate: '0.8.3', originalFunctions: ['readManifest', 'filesFromZip', 'PackImporter.stage', 'PackImporter.install'],
    validationStubs: false, sourceModification: false } };
}
