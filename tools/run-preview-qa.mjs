#!/usr/bin/env node
// One owned local server and one owned test browser per run. No user browser.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const server=spawn(process.execPath,[resolve(root,'preview-host/serve.mjs'),'--port=4323'],{cwd:root,stdio:['ignore','pipe','pipe']});
let opened=false;
try {
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Preview server did not start')),10000);
    server.stdout.on('data',buffer=>{if(buffer.toString().includes('Native preview:')){opened=true;clearTimeout(timeout);resolve();}});
    server.stderr.on('data',buffer=>process.stderr.write(buffer));
    server.on('error',reject);server.on('exit',code=>{if(!opened){clearTimeout(timeout);reject(new Error('Server exited: '+code));}});
  });
  const child=spawn(process.execPath,[resolve(root,'preview-host/qa-native-browser.mjs'),...process.argv.slice(2)],{cwd:root,stdio:'inherit'});
  process.exitCode=await new Promise((resolve,reject)=>{child.on('exit',code=>resolve(code??1));child.on('error',reject);});
}finally{server.kill('SIGTERM');}
