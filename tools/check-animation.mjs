#!/usr/bin/env node
/** Pure Node numerical acceptance. Does not edit animation, artwork, or a browser. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = ['runtime/animation.js', 'runtime/words.js', 'pack/assets/atlas.png', 'pack/art-data.json'];
const snapshots = Object.fromEntries(await Promise.all(inputs.map(async name => [name, await readFile(resolve(project, name))])));
// This module has no relative imports. Import the exact bytes as ESM, without
// relying on the caller's package.json or changing the source's extension.
const load = bytes => import('data:text/javascript;base64,' + bytes.toString('base64'));
const { createAnimator, ANIMATION_CONTRACT } = await load(snapshots['runtime/animation.js']);
const { WORD_DEFINITIONS, CUSTOM_MOTION_DEFINITIONS } = await load(snapshots['runtime/words.js']);
const numericKeys = ['eyeL','eyeR','happyL','happyR','eyeTiltL','eyeTiltR','browY','browTilt','mouthW','mouthH','blush','tear','headTilt','headY','bodyY','bodySX','bodySY','bodyTilt','armL','armR','handIn','earLiftL','earLiftR','earInL','earInR','earCurlL','earCurlR','earTipL','earTipR','footLiftL','footLiftR','tail','yawOffset'];
const shapes = ['smile','open','o','sad'];
const nativeSeconds = { nod:.7, shake:.7, spin:.6, wave:1.6, bow:1.6, shiver:1.8, flap:1.4 };
const gestures = [...Object.entries(nativeSeconds).map(([id, seconds]) => ({ id, seconds, face: id === 'bow' ? 'bowing' : id === 'wave' || id === 'flap' ? 'happy' : 'neutral' })), ...CUSTOM_MOTION_DEFINITIONS];
const expressions = WORD_DEFINITIONS.filter(w => w.kind === 'expression').map(w => w.id);
const failures = [], checks = [], coverage = [], comparison = {};
let poseCount = 0, maxMouthSumError = 0;
const extrema = Object.fromEntries([...numericKeys, ...shapes.map(s => 'mouthMix.'+s)].map(k => [k,{ min:Infinity,max:-Infinity }]));
function check(name, fn) {
  try { const details = fn(); checks.push({ name, passed:true, ...(details === undefined ? {} : { details }) }); }
  catch (error) { const failure={ name, passed:false, message:error.message }; checks.push(failure); failures.push(failure); }
}
function values(pose) { return { ...Object.fromEntries(numericKeys.map(k => [k,pose[k]])), ...Object.fromEntries(shapes.map(k => ['mouthMix.'+k,pose.mouthMix[k]])) }; }
function validate(pose, label) {
  assert.ok(pose && typeof pose === 'object', label+' pose');
  assert.ok(shapes.includes(pose.mouthShape), label+' mouthShape');
  for (const key of numericKeys) assert.ok(Number.isFinite(pose[key]), `${label}: ${key} is ${pose[key]}`);
  for (const key of shapes) assert.ok(Number.isFinite(pose.mouthMix?.[key]) && pose.mouthMix[key] >= -1e-12 && pose.mouthMix[key] <= 1+1e-12, label+' mouthMix.'+key);
  const sum = shapes.reduce((s,k)=>s+pose.mouthMix[k],0), error=Math.abs(sum-1);
  maxMouthSumError=Math.max(maxMouthSumError,error);
  assert.ok(error < 1e-12,label+' mouthMix is not normalized');
  for (const key of ['eyeL','eyeR']) assert.ok(pose[key]>=0 && pose[key]<=1.15+1e-12,label+' eye range');
  for (const key of ['happyL','happyR','blush','tear']) assert.ok(pose[key]>=0 && pose[key]<=1+1e-12,label+' '+key+' range');
  assert.ok(Math.abs(pose.yawOffset)<=1+1e-12,label+' yaw');
  assert.ok(pose.bodySX>0 && pose.bodySY>0,label+' positive body scale');
  assert.ok(Math.abs(pose.earTipL)<=4 && Math.abs(pose.earTipR)<=4,label+' ear tip bounds');
  for (const [key,value] of Object.entries(values(pose))) { extrema[key].min=Math.min(extrema[key].min,value); extrema[key].max=Math.max(extrema[key].max,value); }
  poseCount++;
}
function frame(t,dt,extra={}) {
  return { t,dt,face:'neutral',mode:'idle',modeT:t,blink:0,eyeClose:0,talk:0,drowse:0,sit:0,gesture:null,viewYaw:0,lookScreen:[0,0],legsScreen:[[104,212,104,241],[150,212,150,241]],swingScreen:0,...extra };
}
function track(kind,id,scheme,hz,seconds,face='neutral') {
  const animator=createAnimator({scheme}), outputs=[], warm=.5, release=1, end=warm+seconds+release;
  for(let i=0;i<=Math.ceil(end*hz);i++) {
    const t=i/hz, local=t-warm, active=local>=0 && local<=seconds;
    const blinkAge=local-1.05, blink=active && blinkAge>=0 && blinkAge<.16 ? Math.sin(Math.PI*blinkAge/.16) : 0;
    const talk=active && local>.3 && local<.8 ? Math.exp(-7*(local-.3)) : 0;
    const f=frame(t,i?1/hz:0,{face:active?(kind==='expression'?id:face):'neutral',blink,talk,
      gesture:kind==='gesture' && active ? {kind:id,k:Math.min(1,Math.max(0,local/seconds))} : null});
    const pose=animator.step(f);validate(pose,`${kind}/${id}/${scheme}/${hz}/${i}`);
    if(hz===60 || i%2===0) outputs.push(pose);
  }
  return outputs;
}
check('25 expression IDs exactly match the current vocabulary',()=>{
  assert.equal(expressions.length,25);assert.deepEqual([...ANIMATION_CONTRACT.expressionIds].sort(),[...expressions].sort());
  return {count:25,ids:expressions};
});
check('17 owned gesture IDs and 10 custom durations match current registration',()=>{
  assert.equal(gestures.length,17);assert.deepEqual([...ANIMATION_CONTRACT.gestureIds].sort(),gestures.map(g=>g.id).sort());
  for(const g of CUSTOM_MOTION_DEFINITIONS)assert.equal(ANIMATION_CONTRACT.customSeconds[g.id],g.seconds,g.id);
  return {count:17,ids:gestures.map(g=>g.id),nativePulseSeconds:nativeSeconds,customPulseSeconds:ANIMATION_CONTRACT.customSeconds};
});
for(const scheme of ['gentle','lively']) for(const item of [...expressions.map(id=>({kind:'expression',id,seconds:3.8,face:id})),...gestures.map(g=>({...g,kind:'gesture'}))]) {
  check(`${item.kind}/${item.id}/${scheme}: 60 and 120 Hz finite poses`,()=>{
    const slow=track(item.kind,item.id,scheme,60,item.seconds,item.face), fast=track(item.kind,item.id,scheme,120,item.seconds,item.face);
    const diff={};for(let i=0;i<Math.min(slow.length,fast.length);i++)for(const [key,a] of Object.entries(values(slow[i]))) {
      const d=Math.abs(a-values(fast[i])[key]);if(!diff[key] || d>diff[key].absolute)diff[key]={absolute:d,atSeconds:i/60};
      if(!comparison[key] || d>comparison[key].absolute)comparison[key]={absolute:d,atSeconds:i/60,kind:item.kind,id:item.id,scheme};
    }
    coverage.push({kind:item.kind,id:item.id,scheme,rates:[60,120],samples60:slow.length,samples120CommonTime:fast.length,allFinite:true,mouthMixNormalized:true});
    return {samples60:slow.length,commonSamples120:fast.length};
  });
}
check('dt=0 holds a warmed non-neutral pose and both ear springs',()=>{
  const a=createAnimator({scheme:'lively'});let f,p;
  for(let i=0;i<=120;i++) { f=frame(i/60,i?1/60:0,{face:'bashful',talk:.4,gesture:{kind:'ear-fold',k:Math.min(.5,i/240)},swingScreen:8});p=a.step(f);validate(p,'pause warmup'); }
  const before=values(p), springs=a.inspect().earSprings;let maxDrift=0;
  for(let i=0;i<60;i++){p=a.step({...f,dt:0});validate(p,'paused');for(const [k,v]of Object.entries(values(p)))maxDrift=Math.max(maxDrift,Math.abs(v-before[k]));}
  assert.ok(maxDrift<1e-12);assert.deepEqual(a.inspect().earSprings,springs);
  return {repeatedPausedSteps:60,maxNumericDrift:maxDrift,earSpringStateUnchanged:true};
});
const disruptions=[];
for(const disruption of [{name:'one-second dt',dt:1,tAdvance:1},{name:'NaN dt with advancing native time',dt:NaN,tAdvance:1/60},{name:'NaN dt with unchanged native time',dt:NaN,tAdvance:0}]) {
  check(disruption.name+' remains finite and recovers',()=>{
    const a=createAnimator({scheme:'lively'});let t=0,p;
    for(let i=0;i<=90;i++){t=i/60;p=a.step(frame(t,i?1/60:0,{face:'excited',talk:.8,gesture:{kind:'celebrate',k:Math.min(.65,i/140)},swingScreen:30}));validate(p,'disruption warmup');}
    t+=disruption.tAdvance;p=a.step(frame(t,disruption.dt,{face:'surprised',talk:1,gesture:{kind:'peek',k:.7},swingScreen:-40}));validate(p,disruption.name);
    const afterEvent=a.inspect();for(let i=0;i<240;i++){t+=1/60;p=a.step(frame(t,1/60));validate(p,'recovery');}
    assert.ok(Math.abs(p.eyeL-1)<1e-8 && Math.abs(p.eyeR-1)<1e-8);
    assert.ok(p.mouthMix.smile>1-1e-8 && Math.abs(p.mouthW-9)<1e-8 && Math.abs(p.mouthH-2.4)<1e-8);
    assert.ok(Math.abs(p.bodySX-1)<1e-8 && Math.abs(p.bodySY-1)<1e-8);
    for(const side of ['L','R']){const s=a.inspect().earSprings[side];assert.ok(Number.isFinite(s.x)&&Number.isFinite(s.v)&&Math.abs(s.x)<=4&&Math.abs(s.v)<=45);}
    const row={name:disruption.name,firstPoseFinite:true,effectiveDt:afterEvent.frame.dt,recoverySeconds:4,neutralEyesAndMouthRecovered:true,earSpringFiniteAndBounded:true,counters:a.inspect().counters};disruptions.push(row);return row;
  });
}
check('Scheme switching remains finite; unsupported IDs fail explicitly',()=>{
  const a=createAnimator();for(let i=0;i<180;i++){if(i===45)a.setScheme('lively');if(i===110)a.setScheme('gentle');validate(a.step(frame(i/60,i?1/60:0,{face:'happy',gesture:{kind:'greet',k:Math.min(1,i/180)}})),'scheme switch');}
  assert.throws(()=>a.setScheme('unknown'),RangeError);return {switches:2};
});
const unchanged={};for(const name of inputs){const end=hash(await readFile(resolve(project,name)));unchanged[name]={start:hash(snapshots[name]),end,unchanged:end===hash(snapshots[name])};if(!unchanged[name].unchanged)failures.push({name:'Frozen source changed: '+name,passed:false});}
const scriptPath=resolve(project,'tools/check-animation.mjs');
const report={
  schemaVersion:1,checkedAtUTC:new Date().toISOString(),passed:failures.length===0,
  scope:'Pure Node numerical execution of the exact current animation source. Covers finite output, normalization, 25 expression and 17 owned-gesture tracks at 60/120 Hz, pause, long/invalid dt and recovery. No browser, pixels, subjective motion smoothness, real-time FPS or audio lip-sync was tested.',
  runtime:{node:process.version,platform:process.platform,arch:process.arch},scriptSHA256:hash(await readFile(scriptPath)),sourceHashes:unchanged,
  counts:{expressions:expressions.length,gestures:gestures.length,schemes:2,ratePairs:coverage.length,validatedPoses:poseCount,checks:checks.length,passedChecks:checks.filter(c=>c.passed).length,failures:failures.length},
  mouthMix:{maximumSumError:maxMouthSumError,tolerance:1e-12,weightsRange:[0,1]},
  sixtyVsOneTwenty:{method:'Compare exact shared absolute times, including expression/gesture onset and return to neutral. Values are model units, degrees or normalized values according to the field. Differences are measured, not promoted to a visual or frame-rate claim.',maximumAbsoluteDifferenceByField:comparison},
  observedExtrema:extrema,coverage,disruptions,checks,failures,
};
const out=resolve(project,'docs/qa/animation-numeric.json');await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,...report.counts,maxMouthSumError,sourceUnchanged:Object.values(unchanged).every(x=>x.unchanged),report:out}));
if(failures.length){console.error(JSON.stringify(failures,null,2));process.exitCode=1;}
