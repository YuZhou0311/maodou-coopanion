#!/usr/bin/env node
// Actual native render views for visual review; no synthetic pose drawings.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createPreviewServer} from '../preview-host/serve.mjs';
const opts=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return [a.slice(2,i),a.slice(i+1)]}));
const out=resolve(opts.out??'docs/qa/v1.3.2/focus');await mkdir(out,{recursive:true});
const server=createPreviewServer();await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
let browser;
try {
let pw;try{pw=createRequire(import.meta.url)('playwright')}catch{pw=createRequire(resolve('preview-host/package.json'))('playwright')}
browser=await pw.chromium.launch({executablePath:opts.chromium??process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1120,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.addInitScript(()=>{globalThis.__maodouQARegister=body=>globalThis.__maodouQABody=body});
await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.maodouPreview?.ready);
const frame=page.frames().find(f=>f.url().includes('/figure-frame'));
await frame.waitForFunction(()=>globalThis.__maodouQABody?.inspect);
await page.evaluate(async()=>{const p=maodouPreview;p.setPaused(true);p.setSweep(false);p.setScale(1.35);p.body.set({roam:'off',hold:3600});p.body.do('stand');p.body.do('neutral');await p.advance(60,.05);p.body.place(p.bounds().W/2,1);await p.advance(30,1/60)});
const angles=opts.angles?opts.angles.split(',').map(Number):[-75,-60,-45,-30,-15,0,15,30,45,60,75],samples=[];
for(const angle of angles){
const result=await frame.evaluate(angle=>{const b=__maodouQABody;b.set({viewYaw:angle/75,viewYawImmediate:true});b.step(0);return {data:document.querySelector('canvas').toDataURL(),state:b.inspect().figure}},angle);
const file=`yaw-${angle}.png`;await writeFile(resolve(out,file),Buffer.from(result.data.split(',')[1],'base64'));samples.push({angle,file,state:result.state});
}
await writeFile(resolve(out,'report.json'),JSON.stringify({status:'complete',errors,samples},null,2));
console.log(JSON.stringify({out,samples:samples.map(s=>({angle:s.angle,errors:s.state.errors,invalid:s.state.renderer.lastInvalidParts,triangles:Object.fromEntries(Object.entries(s.state.meshHealth).map(([k,v])=>[k,v.negativeTriangles]))})),errors}));
} finally {await browser?.close();await new Promise(ok=>server.close(ok));}
