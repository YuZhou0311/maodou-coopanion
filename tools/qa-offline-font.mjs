#!/usr/bin/env node
/** Focused final offline-font regression. Production rig and native QA unchanged. */
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {projectRoot,hashFile,atomicWrite} from '../preview-host/pack-tools.mjs';
const out=resolve(projectRoot,'docs/qa/v1.3.1/offline');await mkdir(out,{recursive:true});
const html=resolve(projectRoot,'exports/Maodou-Offline-Preview-v1.3.1.html');
const report={status:'in_progress',passed:false,startedAt:new Date().toISOString(),scope:'Focused file:// regression after embedding the missing Chinese UI font; does not replace native interaction, visual or performance acceptance.',checks:[],errors:[],warnings:[],networkRequests:[],screenshots:[]};
const check=(name,passed,details={})=>report.checks.push({name,passed:!!passed,...details});
let browser;
try{
 const require=createRequire(resolve(projectRoot, 'preview-host/package.json'));
 browser=await require('playwright').chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1120,height:900},deviceScaleFactor:1});
 await context.route(/^https?:\/\//,route=>{report.networkRequests.push(route.request().url());return route.abort('blockedbyclient');});
 const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());else if(m.type()==='warning')report.warnings.push(m.text());});
 report.html={file:'exports/Maodou-Offline-Preview-v1.3.1.html',sha256:await hashFile(html)};
 await page.goto(pathToFileURL(html).href,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.maodouStandalone?.ready);
 await page.evaluate(async()=>{await document.fonts.ready;maodouStandalone.setPaused(true);await maodouStandalone.advance(36,1/60);});
 report.observation=await page.evaluate(()=>({ready:maodouStandalone.ready,renderedFrames:maodouStandalone.renderedFrames,source:maodouStandalone.source,inspect:maodouStandalone.body.inspect(),records:maodouStandalone.records,expressions:document.querySelectorAll('#expressions [data-word]').length,motions:document.querySelectorAll('#motions [data-word]').length,fontFamily:getComputedStyle(document.documentElement).fontFamily,fontFaces:[...document.fonts].map(f=>({family:f.family,status:f.status})),fontCheck:document.fonts.check('16px "Maodou Preview UI"','大耳帽兜温柔活泼转向表情动作')}));
 const o=report.observation;
 check('embedded Chinese font is loaded and used',o.fontCheck&&o.fontFaces.some(f=>f.family.replace(/["']/g,'')==='Maodou Preview UI'&&f.status==='loaded')&&o.fontFamily.includes('Maodou Preview UI'));
 check('actual local character and complete controls render',o.ready&&o.renderedFrames>=36&&o.expressions===25&&o.motions===28);
 check('no remote request is needed',report.networkRequests.length===0);
 check('no renderer or host error',o.inspect.figure.renderer.ready&&!o.inspect.figure.renderer.errors.length&&!o.records.errors.length);
 const stage=JSON.parse(await readFile(resolve(projectRoot,'preview-host/qa/stage-report.json'),'utf8'));
 const hashes=new Map(stage.files.map(f=>[f.path,f.sha256]));
 check('same final staged character code and model',o.source.figureSha256===hashes.get('figure.js')&&o.source.modelSha256===hashes.get('model.json'));
 const png=resolve(out,'offline-preview-full.png');await atomicWrite(png,await page.screenshot({fullPage:true}));
 report.screenshots.push({file:'offline-preview-full.png',sha256:await hashFile(png),scope:'Actual offline UI after the embedded Chinese font finished loading.'});
 // One real control interaction verifies the repaired labels are still usable.
 await page.locator('#expressions [data-word="happy"]').click();
 await page.evaluate(async()=>maodouStandalone.advance(45,1/60));
 const happy=await page.evaluate(()=>maodouStandalone.body.inspect());
 check('real expression button changes the rendered character',happy.frame.face==='happy'&&happy.figure.pose.eyeL<.4,{face:happy.frame.face,eyeL:happy.figure.pose.eyeL});
 check('HTML unchanged during focused check',report.html.sha256===await hashFile(html));
 report.status='complete';report.passed=report.checks.every(c=>c.passed)&&!report.errors.length;
}catch(e){report.status='failed';report.errors.push(String(e.stack??e));}
finally{await browser?.close();report.completedAt=new Date().toISOString();await atomicWrite(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,passed:report.passed,checks:report.checks.map(c=>({name:c.name,passed:c.passed})),errors:report.errors}));if(!report.passed)process.exitCode=1;}
