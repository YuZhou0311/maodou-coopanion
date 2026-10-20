#!/usr/bin/env node
/** Operator-run pointer regression. --help does not open Chrome or a server. */
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createPreviewServer } from '../preview-host/serve.mjs';
import { projectRoot, atomicWrite, hashFile } from '../preview-host/pack-tools.mjs';
const help = `Usage: node tools/qa-pointer-v131.mjs [--software-webgl] [--chromium=/path] [--out=docs/qa/drag-release-v1_3_1/browser]
One owned server/browser. Runs the real opaque native iframe with (1) the preview
pointer bridge and (2) the actual patched desktop pointer handlers, temporarily
substituted by Playwright routing. The second harness stubs only Electron cursor
poll/follow APIs; it does not certify OS capture or cross-display behaviour.
Mouse input and CDP touch-cancel are real browser input. Blur is explicitly a
synthetic window-lifecycle event. Missing metadata is an explicit protocol check.
Never changes production files. Failures are retained; no pass-seeking retries.
`;
const o = {};
for (const arg of process.argv.slice(2)) {
  if (arg === '--help') { console.log(help); process.exit(0); }
  if (arg === '--software-webgl') o.software = true;
  else if (/^--(?:chromium|out)=/.test(arg)) { const k = arg.indexOf('='); o[arg.slice(2, k)] = arg.slice(k + 1); }
  else throw new Error(help);
}
const out = resolve(projectRoot, o.out ?? 'docs/qa/drag-release-v1_3_1/browser'); await mkdir(out, { recursive: true });
const path = resolve(out, 'report.json');
const report = { startedAt: new Date().toISOString(), status: 'in_progress', passed: false, sourcesUnchanged: false,
  scope: 'Browser-native DOM input into the unchanged opaque figure frame. Desktop-host event handlers are exercised with Electron bridge stubs; real OS focus/capture and displays remain a separate integration check.',
  browserFlags: ['--no-sandbox'], hosts: [], errors: [], warnings: [], sourceHashes: {} };
if (o.software) report.browserFlags.push('--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader');
const save = () => atomicWrite(path, JSON.stringify(report, null, 2) + '\n');
const sources = ['runtime/host-adapter.js', 'preview-host/app.js', 'host-fix/pet-app.js', 'tools/qa-pointer-v131.mjs'];
for (const p of sources) report.sourceHashes[p] = await hashFile(resolve(projectRoot, p));
const app = await readFile(resolve(projectRoot, 'preview-host/app.js'), 'utf8');
const desktop = await readFile(resolve(projectRoot, 'host-fix/pet-app.js'), 'utf8');
const start = app.indexOf("stage.addEventListener('pointerdown', e => {");
const endStart = app.indexOf("stage.addEventListener('pointerleave'", start);
const end = app.indexOf('\n', endStart);
const beginDesktop = desktop.indexOf('const UI_SELECTOR ='), endDesktop = desktop.indexOf("stage.addEventListener('dblclick'");
if ([start, endStart, end, beginDesktop, endDesktop].some(v => v < 0)) throw new Error('Pointer harness source markers changed; refusing an inaccurate extraction');
const desktopApp = app.slice(0, start) + `\n(() => {
  let pointerSeen=false; const lastPointer={x:0,y:0},cursor={},diag={types:new Set(),type:''};
  const at=()=>body?.layout, rendering=()=>true, closeMenu=()=>{},logPointer=()=>{};
  const setInteractive=(on,by)=>{ window.__desktopInteractive={on,by}; };
  const host={onCursor(){},onShown(cb){window.__desktopShown=cb;},followCursor:async()=>null};
  ${desktop.slice(beginDesktop, endDesktop)}
  window.__desktopPointerState=()=>({pressing,activePointerId,releasing,pointerEpoch});
})();\n` + app.slice(end + 1);
let browser, server;
try {
  server = createPreviewServer(); await new Promise((r, j) => { server.once('error', j); server.listen(0, '127.0.0.1', r); });
  const url = `http://127.0.0.1:${server.address().port}/`;
  let pw; try { pw = createRequire(import.meta.url)('playwright'); } catch { pw = createRequire(resolve(projectRoot, 'preview-host/package.json'))('playwright'); }
  browser = await pw.chromium.launch({ executablePath: o.chromium ?? process.env.CHROMIUM_PATH, headless: true, args: report.browserFlags });
  for (const hostName of ['preview', 'desktop-handlers']) {
    const hostReport = { name: hostName, status: 'in_progress', checks: [], errors: [], screenshots: [],
      scope: hostName === 'preview' ? 'Production preview bridge + actual native iframe.' : 'Verbatim patched pet-app pointer section; only surrounding UI/Electron dependencies stubbed. Full-viewport stage matches desktop client coordinates.' };
    report.hosts.push(hostReport);
    const page = await browser.newPage({ viewport: { width: 1120, height: 900 }, deviceScaleFactor: 1, hasTouch: true });
    page.on('pageerror', e => hostReport.errors.push(String(e)));
    page.on('console', e => { if (e.type() === 'error') hostReport.errors.push(e.text()); else if (e.type() === 'warning') report.warnings.push({ host: hostName, warning: e.text() }); });
    try {
      if (hostName === 'desktop-handlers') await page.route('**/app.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: desktopApp }));
      await page.addInitScript(() => {
        globalThis.__maodouQARegister = b => { globalThis.__maodouQABody = b; };
        globalThis.__qaPointer = { events: [], swallowUp: false, swallowLost: false };
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'blur']) window.addEventListener(type, e => {
          const q=globalThis.__qaPointer, row={type,t:e.timeStamp,isTrusted:e.isTrusted,buttons:e.buttons,pointerId:e.pointerId,pointerType:e.pointerType,x:e.clientX,y:e.clientY};
          q.events.push(row); if(q.events.length>3000)q.events.shift();
          if(type==='pointerup'&&q.swallowUp){q.swallowUp=false;row.suppressedForQA=true;e.stopImmediatePropagation();}
          else if(type==='lostpointercapture'&&q.swallowLost){q.swallowLost=false;row.suppressedForQA=true;e.stopImmediatePropagation();}
        },true);
      });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => maodouPreview?.ready, null, { timeout: 30000 });
      if (hostName === 'desktop-handlers') await page.addStyleTag({ content: '#stage{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-height:none!important;min-height:0!important;z-index:9999!important;border:0!important;border-radius:0!important;margin:0!important}' });
      const frame = page.frames().find(f => f.url().includes('/figure-frame')); if (!frame) throw new Error('No native figure iframe');
      await frame.waitForFunction(() => globalThis.__maodouQABody?.inspect);
      const inspect = () => frame.evaluate(() => ({ ...__maodouQABody.inspect(), layout: __maodouQABody.layout() }));
      const advance = (n=1,dt=0) => page.evaluate(async({n,dt})=>maodouPreview.advance(n,dt),{n,dt});
      const sourceSnapshot = () => page.evaluate(async()=>({status:await(await fetch('/api/preview')).json(),stage:await(await fetch('/qa/stage-report.json')).json()}));
      hostReport.sourcesBefore=await sourceSnapshot(); if(!hostReport.sourcesBefore.status.ready)throw new Error('Stale staging');
      async function reset() {
        await page.evaluate(()=>{__qaPointer.swallowUp=false;__qaPointer.swallowLost=false;window.dispatchEvent(new Event('blur'));});
        await page.mouse.up();
        await page.evaluate(async()=>{const p=maodouPreview;p.setPaused(true);p.setScale(.6);p.setSweep(false);p.setYaw(0,true);p.body.set({roam:'off',hold:3600});p.body.do('stand');p.body.do('neutral');await p.advance(80,.05);p.body.place(p.bounds().W/2,1);await p.advance(12,1/60);__qaPointer.events.length=0;});
      }
      async function hit() { return page.evaluate(()=>{const h=maodouPreview.body.layout.hit.find(h=>maodouPreview.body.hit(h));if(!h)throw new Error('No hit centre');const r=document.querySelector('#stage').getBoundingClientRect();return{x:r.left+h.x,y:r.top+h.y,stage:{x:r.left,y:r.top,w:r.width,h:r.height}};}); }
      async function grab() { const p=await hit();await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+65,p.y-75,{steps:6});await advance();const s=await inspect();if(s.mode!=='drag')throw new Error('Real mouse did not start drag');return p; }
      async function released() {
        await advance();const before=await inspect();await page.mouse.move(45,70);await advance();const after=await inspect();
        return { passed: !before.layout.pressing&&!after.layout.pressing&&before.mode!=='drag'&&after.mode!=='drag'&&Math.abs(after.layout.x-before.layout.x)<1e-6,before,after };
      }
      async function run(id,scope,fn) {
        const row={id,scope,passed:false};hostReport.checks.push(row);
        try{await reset();const result=await fn();Object.assign(row,result);row.events=await page.evaluate(()=>__qaPointer.events);}
        catch(e){row.error=String(e.stack??e);}
        await save();
      }
      await run('normal-release','Trusted Playwright mouse.',async()=>{const p=await grab();await page.mouse.move(p.x+110,p.y-80,{steps:3});await page.mouse.up();return released();});
      await run('outside-window-release','Trusted mouse coordinates outside viewport with active capture; not a separate OS window.',async()=>{await grab();await page.mouse.move(1150,180);await page.mouse.up();return released();});
      await run('missing-up-and-lostcapture-then-buttons-zero','Real mouse up/lostcapture intentionally intercepted only in this QA session; subsequent real zero-buttons move must recover.',async()=>{
        const p=await grab();await page.evaluate(()=>{__qaPointer.swallowUp=true;__qaPointer.swallowLost=true;});await page.mouse.up();await advance();
        const missed=await inspect();await page.mouse.move(p.x+95,p.y-70);const result=await released();
        const events=await page.evaluate(()=>__qaPointer.events);const suppressedUp=events.some(e=>e.type==='pointerup'&&e.isTrusted&&e.suppressedForQA);
        return{...result,passed:result.passed&&missed.mode==='drag'&&suppressedUp,missed,suppressedUp,releaseReason:result.before.pointer?.lastRelease?.reason};
      });
      await run('lost-capture','Real browser pointer capture relinquished by DOM API while the mouse remains down.',async()=>{
        const p=await grab();await page.evaluate(()=>{const id=__qaPointer.events.findLast(e=>e.type==='pointerdown').pointerId;document.querySelector('#stage').releasePointerCapture(id);});
        await page.mouse.move(p.x+85,p.y-80);const result=await released();await page.mouse.up();return result;
      });
      await run('pointercancel','CDP touch input generates trusted browser pointercancel; no synthetic PointerEvent.',async()=>{
        const p=await hit(),cdp=await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:7}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+65,y:p.y-75,id:7}]});await advance();const held=await inspect();
        await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});const result=await released();await cdp.detach();
        return{...result,passed:result.passed&&held.mode==='drag',held};
      });
      await run('blur','Real mouse drag followed by explicitly synthetic window blur; this tests the DOM handler, not OS focus delivery.',async()=>{
        await grab();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const result=await released();await page.mouse.up();return result;
      });
      await run('metadata-absent-and-held-leave','Direct compatibility messages into actual native body, explicitly not trusted pointer events.',async()=>{
        const result=await frame.evaluate(()=>{const b=__maodouQABody,h=b.layout().hit[0];b.pointer('down',{x:h.x,y:h.y,t:1000});b.pointer('move',{x:h.x+65,y:h.y-75,t:1020});b.step(0);b.pointer('leave',{});b.step(.05);const held=b.inspect();b.pointer('move',{x:h.x+70,y:h.y-75,t:1040});b.step(0);const absent=b.inspect();b.pointer('move',{x:h.x+70,y:h.y-75,t:1050,buttons:0});b.step(0);const ended=b.inspect();return{held,absent,ended,passed:held.mode==='drag'&&absent.mode==='drag'&&!ended.pointer.pressing&&ended.mode!=='drag'};});
        return result;
      });
      const shot=`${hostName}-released.png`;await atomicWrite(resolve(out,shot),await page.locator('#stage').screenshot());hostReport.screenshots.push({file:shot,sha256:await hashFile(resolve(out,shot))});
      hostReport.sourcesAfter=await sourceSnapshot();hostReport.sourcesUnchanged=hostReport.sourcesAfter.status.ready&&JSON.stringify(hostReport.sourcesBefore.stage.sourceFiles)===JSON.stringify(hostReport.sourcesAfter.stage.sourceFiles);
      hostReport.nativeDiagnostics=await inspect();hostReport.originNullObserved=await page.evaluate(()=>maodouPreview.records.originNullObserved);
      hostReport.passed=hostReport.checks.every(c=>c.passed)&&!hostReport.errors.length&&hostReport.sourcesUnchanged&&hostReport.originNullObserved;
      hostReport.status='complete';
    } catch(e){hostReport.errors.push(String(e.stack??e));hostReport.status='failed';hostReport.passed=false;}
    finally{await page.close();await save();}
  }
} catch(e){report.errors.push(String(e.stack??e));}
finally{
  await browser?.close();if(server){server.closeAllConnections?.();await new Promise(r=>server.close(r));}
  report.finalSourceHashes={};for(const p of sources)report.finalSourceHashes[p]=await hashFile(resolve(projectRoot,p));
  report.sourcesUnchanged=JSON.stringify(report.sourceHashes)===JSON.stringify(report.finalSourceHashes)&&report.hosts.every(h=>h.sourcesUnchanged);
  report.status=report.hosts.length===2&&report.hosts.every(h=>h.status==='complete')&&!report.errors.length?'complete':'completed_with_errors';
  report.passed=report.status==='complete'&&report.sourcesUnchanged&&report.hosts.every(h=>h.passed);
  report.completedAt=new Date().toISOString();await save();console.log(JSON.stringify({passed:report.passed,status:report.status,hosts:report.hosts.map(h=>({name:h.name,passed:h.passed,checks:h.checks.filter(c=>c.passed).length,total:h.checks.length,errors:h.errors})),report:path}));if(!report.passed)process.exitCode=1;
}
