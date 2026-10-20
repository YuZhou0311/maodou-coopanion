#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostRoot, vendorRoot, stagedRoot, stageStatus, checkedFile, inRoot } from './pack-tools.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.md': 'text/plain; charset=utf-8' };
const PAGE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self' http://127.0.0.1:* http://localhost:*";

/** Only the local preview UI, the fixed upstream runtime and a staged pack are served. */
export function createPreviewServer() {
  return createServer(async (req, res) => {
    const common = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const send = (status, type, bytes, extra = {}) => {
      res.writeHead(status, { ...common, 'Content-Type': type, ...extra }); res.end(req.method === 'HEAD' ? undefined : bytes);
    };
    if (!['GET', 'HEAD'].includes(req.method)) { send(405, 'text/plain', 'Method not allowed'); return; }
    try {
      const host = String(req.headers.host || '');
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) { send(400, 'text/plain', 'Local host required'); return; }
      const path = new URL(req.url, `http://${host}`).pathname;
      const self = `http://${host}`;
      let file, csp = null, cors = false;
      if (path === '/api/preview') { send(200, MIME['.json'], JSON.stringify(await stageStatus())); return; }
      if (path === '/figure-frame') {
        file = await checkedFile(vendorRoot, 'web/figure-frame.html');
        csp = ['sandbox allow-scripts', "default-src 'none'", `script-src ${self}`, `img-src ${self} data: blob:`, "style-src 'unsafe-inline'", "connect-src 'none'", `frame-ancestors ${self} http://127.0.0.1:* http://localhost:*`].join('; ');
      } else if (path.startsWith('/web/')) {
        file = await checkedFile(vendorRoot, decodeURIComponent(path.slice(1))); cors = true;
      } else if (path.startsWith('/packs/')) {
        const [, , id, ...parts] = path.split('/');
        if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(id)) throw new Error('Invalid pack id');
        file = await checkedFile(inRoot(stagedRoot, id), decodeURIComponent(parts.join('/'))); cors = true;
      } else if (path === '/qa/stage-report.json') {
        file = await checkedFile(hostRoot, 'qa/stage-report.json');
      } else if (['/', '/index.html', '/app.js', '/style.css'].includes(path)) {
        file = await checkedFile(hostRoot, path === '/' ? 'index.html' : path.slice(1)); csp = PAGE_CSP;
      } else { send(404, 'text/plain', 'Not found'); return; }
      send(200, MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', await readFile(file), {
        ...(csp ? { 'Content-Security-Policy': csp } : {}),
        ...(cors && req.headers.origin === 'null' ? { 'Access-Control-Allow-Origin': 'null', Vary: 'Origin' } : {}),
      });
    } catch (error) { send(404, 'text/plain', 'Not found'); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node preview-host/serve.mjs [--port=4323]\nServes the unchanged native opaque iframe and a genuinely staged character; no placeholder is drawn.');
  } else {
    if (args.some(a => !/^--port=\d+$/.test(a))) throw new Error('Use --help for supported arguments');
    const port = Number(args.find(a => a.startsWith('--port='))?.split('=')[1] ?? 4323);
    if (!(port > 0 && port <= 65535)) throw new Error('Invalid port');
    const server = createPreviewServer();
    server.listen(port, '127.0.0.1', () => console.log(`Native preview: http://127.0.0.1:${port}/`));
  }
}
