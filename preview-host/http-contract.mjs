// Exercises real HTTP headers/routes without initializing a browser or a pet.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPreviewServer } from './serve.mjs';
import { hostRoot, vendorRoot, hash, hashFile, atomicWrite, sourceStatus } from './pack-tools.mjs';

const server = createPreviewServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`, checks = [];
async function check(name, fn) {
  try { const details = await fn(); checks.push({ name, passed: true, ...(details ? { details } : {}) }); }
  catch (e) { checks.push({ name, passed: false, error: String(e.stack || e) }); }
}
try {
  await check('Fixed upstream files match their provenance hashes', async () => {
    const p = JSON.parse(await readFile(resolve(vendorRoot, 'provenance.json'), 'utf8'));
    for (const file of p.files) assert.equal(await hashFile(resolve(vendorRoot, file.path)), file.sha256);
    return { files: p.files.length, commit: p.commit };
  });
  await check('UI loads with a local-resource CSP', async () => {
    const r = await fetch(base + '/'); assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(await r.text(), /等待角色资产接入/);
  });
  await check('Frame HTML is byte-identical to the native document', async () => {
    const r = await fetch(base + '/figure-frame'); assert.equal(r.status, 200);
    assert.equal(hash(Buffer.from(await r.arrayBuffer())), await hashFile(resolve(vendorRoot, 'web/figure-frame.html')));
  });
  await check('Frame CSP requires opaque origin and forbids connect', async () => {
    const r = await fetch(base + '/figure-frame'), csp = r.headers.get('content-security-policy');
    assert.match(csp, /sandbox allow-scripts;/); assert.doesNotMatch(csp, /allow-same-origin/);
    assert.match(csp, /connect-src 'none'/); assert.ok(csp.includes(`script-src ${base}`));
  });
  await check('Opaque script request receives native null-origin CORS and JavaScript MIME', async () => {
    const r = await fetch(base + '/web/figure-frame.js', { headers: { Origin: 'null' } });
    assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), 'null');
    assert.match(r.headers.get('content-type'), /text\/javascript/);
  });
  await check('Other origins do not receive permissive CORS', async () => {
    const r = await fetch(base + '/web/figure-frame.js', { headers: { Origin: 'https://example.invalid' } });
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  });
  await check('Sources outside the allowed routes cannot be read', async () => {
    for (const p of ['/runtime/host-adapter.js', '/references/', '/packs/no-such-pack/figure.js', '/web/%2e%2e%2f%2e%2e%2fpack/figure.json']) {
      assert.equal((await fetch(base + p)).status, 404);
    }
  });
  await check('Preview status does not claim a missing character is ready', async () => {
    const r = await fetch(base + '/api/preview'), s = await r.json(), source = await sourceStatus();
    assert.equal(r.status, 200); assert.equal(s.source.complete, source.complete);
    if (!source.complete) assert.equal(s.ready, false);
    return { sourceComplete: s.source.complete, stagedReady: s.ready, missing: s.source.missing };
  });
  await check('HTTP endpoint rejects mutation requests', async () => {
    assert.equal((await fetch(base + '/api/preview', { method: 'POST' })).status, 405);
  });
} finally { await new Promise(resolve => server.close(resolve)); }
const report = { checkedAt: new Date().toISOString(), passed: checks.every(c => c.passed), scope: 'Real local HTTP requests and byte/header verification only. No browser was started; opaque-origin execution is still pending a real character.', checks };
const path = resolve(hostRoot, 'qa/http-contract.json');
await atomicWrite(path, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, checks: checks.length, failed: checks.filter(c => !c.passed), report: path }));
if (!report.passed) process.exitCode = 1;
