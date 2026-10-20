#!/usr/bin/env node
/** CPU geometry regression; no browser, image processing, or production writes. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fairEarShoulder, SHOULDER_ROUNDING_RADIUS } from '../runtime/hood-geometry.js';

const epsilon=1e-9,close=(a,b,message)=>assert.ok(Math.abs(a-b)<epsilon,message??`${a} != ${b}`);
const clone=rows=>rows.map(row=>({...row}));
const cols=12,rows=64,stride=cols+1;
const head=new Float64Array((rows+1)*stride*2);
for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
  const y=22+row/rows*142,half=70*Math.sqrt(Math.max(0,1-((row/rows-.5)*2)**2));
  const n=(row*stride+col)*2;head[n]=128+(col/cols*2-1)*half;head[n+1]=y;
}
const headBefore=head.slice();
let maxVisibleOutset=0,maxEarOutset=0,localCases=0;
// Sweep both attachment sides and all relevant turn angles with crossings
// at different heights. Invariants constrain the result without rebuilding
// the smoothing algorithm inside this test.
for(const degrees of [0,.01,.1,1,5,10,15,20,22,25,30,35,40,44,45,60,75])for(const offset of [-10,0,10,25]){
  const input=Array.from({length:49},(_,i)=>({rawX:80-i*.4+offset,rawY:47+i*4,width:24+i*.25,angle:0}));
  const actual=clone(input);fairEarShoulder(actual,true,degrees/75,head);
  const mirrored=input.map(row=>({...row,rawX:256-row.rawX}));fairEarShoulder(mirrored,false,degrees/75,head);
  assert.deepEqual(head,headBefore,'rounding must never move any head vertex');
  for(let i=0;i<actual.length;i++){
    const a=actual[i],b=input[i],delta=a.width-b.width;
    assert.ok(delta>=-epsilon&&delta<2*SHOULDER_ROUNDING_RADIUS+epsilon,'bounded outward-only ear change');
    close(a.rawX+a.width/2,b.rawX+b.width/2,'inner ear boundary stays fixed');
    close(a.rawY,b.rawY,'no vertical flattening');
    close(a.rawX,256-mirrored[i].rawX,'mirrored shoulder X');
    close(a.width,mirrored[i].width,'mirrored shoulder width');
    if(degrees===0||degrees>=45||i===0||i/48>=.58)assert.deepEqual(a,b,'front, authored side keys, fixed roots and free ears stay unchanged');
    maxEarOutset=Math.max(maxEarOutset,delta);
    if(b.rawY<22||b.rawY>164)continue;
    const r=(b.rawY-22)/142*64,lo=Math.min(63,Math.floor(r)),t=r-lo;
    const headOuter=-(head[lo*stride*2]*(1-t)+head[(lo+1)*stride*2]*t);
    const original=Math.max(headOuter,-b.rawX+b.width/2),rounded=Math.max(headOuter,-a.rawX+a.width/2);
    assert.ok(rounded>=original-epsilon,'combined silhouette never shrinks');
    assert.ok(rounded-original<=SHOULDER_ROUNDING_RADIUS/4+epsilon,'local rounding cannot replace the rear silhouette');
    maxVisibleOutset=Math.max(maxVisibleOutset,rounded-original);
  }
  localCases++;
}
const continuityRows=Array.from({length:49},(_,i)=>({rawX:80-i*.4,rawY:47+i*4,width:24+i*.25,angle:0}));
for(const q of [0,.01,.1,.42,.6,1]){
  const before=clone(continuityRows),after=clone(continuityRows);
  fairEarShoulder(before,true,Math.max(0,q-1e-7),head);
  fairEarShoulder(after,true,Math.min(1,q+1e-7),head);
  for(let i=0;i<before.length;i++)assert.ok(Math.abs(after[i].rawX-before[i].rawX)<1e-4&&Math.abs(after[i].width-before[i].width)<1e-4,'continuous yaw support');
}

// Load the exact figure source and its real animation/material dependencies.
// Only DOM/GPU submission is stubbed. The comparison version disables the
// shoulder operation and the latent-front reveal, retaining the registered
// front and the original 45/75-degree keys as the endpoint reference.
const sourceURL=new URL('../runtime/painted-figure.js',import.meta.url);
const source=await readFile(sourceURL,'utf8');
const moduleURL=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
const rendererURL=moduleURL(`export function createAtlasRenderer(){let parts=[];return {
  setAtlas(){},setScene(scene){parts=scene.parts},updatePart(id,patch){Object.assign(parts.find(p=>p.id===id),patch)},
  render(){},resize(){},dispose(){},inspect(){return {parts}}
};}`);
const noShoulderURL=moduleURL('export function fairEarShoulder(){}; export function revealFrontHead(out,approved){out.set(approved)}');
async function loadFigure(disableShoulder){
  const text=source.replace(/from (['"])(\.[^'"]+)\1/g,(all,quote,path)=>{
    const url=path==='./atlas-renderer.js'?rendererURL: disableShoulder&&path==='./hood-geometry.js'?noShoulderURL:new URL(path,sourceURL).href;
    return `from ${quote}${url}${quote}`;
  });
  return (await import(moduleURL(text))).createPaintedFigure;
}
const model=JSON.parse(await readFile(new URL('../pack/model.json',import.meta.url),'utf8'));
const element=()=>({style:{},setAttribute(){},appendChild(child){child.parentNode=this},remove(){}});
const doc={createElementNS:element};
const opts={model,host:{root:{ownerDocument:doc}},asset:x=>x,loadImage:async()=>({})};
const actual=await(await loadFigure(false))('',opts),reference=await(await loadFigure(true))('',opts);
const group=element();let frames=0,sourceShapeFrames=0,maxSourceShapeError=0,maxDepartureFromHiddenFront=0;
let maxRearInwardDent=0,minimumRearArcBulge=Infinity,minimumHeadAreaRatio=Infinity;
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function paintedX(key,row,col){
  const sprite=model.art.sprites['head.'+key],contour=sprite.contour.rows,t=row/64*(contour.length-1);
  const i=Math.min(contour.length-2,Math.floor(t)),k=t-i;
  const left=contour[i].left*(1-k)+contour[i+1].left*k,right=contour[i].right*(1-k)+contour[i+1].right*k;
  const u=Math.fround(col/12),box=model.head[key];
  return Math.fround(box[0]+(left+(right-left)*u)*box[2]);
}
function unrotatedHeadX(snapshot,part,n,frame){
  const p=snapshot.pose,restY=(p.bodyY??0)+(p.headY??0)+Math.max(0,Math.min(1,frame.sit??0))*14+Math.min(10,(frame.low??0)*.32);
  const angle=((p.headTilt??0)+(p.bodyTilt??0)*.35)*Math.PI/180;
  const dx=part.xy[n]-128,dy=part.xy[n+1]-(153+restY);
  return 128+dx*Math.cos(angle)+dy*Math.sin(angle);
}
function headArea(part){
  const points=[];
  for(let row=0;row<=64;row++)points.push(row*13*2);
  for(let row=64;row>=0;row--)points.push((row*13+12)*2);
  let area=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];area+=part.xy[a]*part.xy[b+1]-part.xy[b]*part.xy[a+1];
  }
  return Math.abs(area)*.5;
}
const baseline={face:'neutral',mode:'idle',blink:0,eyeClose:0,talk:0,drowse:0,sit:0,gesture:null,lookScreen:[0,0],
  legsScreen:[[104,212,104,241],[150,212,150,241]],swingScreen:0};
function checkFrame(frame){
  actual.draw(group,null,frame);reference.draw(group,null,frame);
  const a=actual.inspect(),b=reference.inspect(),part=(snapshot,id)=>snapshot.renderer.parts.find(p=>p.id===id);
  const actualHead=part(a,'head'),referenceHead=part(b,'head'),q=Math.abs(a.viewYaw);
  minimumHeadAreaRatio=Math.min(minimumHeadAreaRatio,headArea(actualHead)/headArea(referenceHead));
  if(q<=.02||q>=.6)assert.deepEqual(actualHead.xy,referenceHead.xy,`registered front or authored side key changed at yaw ${a.viewYaw}`);
  for(const key of ['uv','uv2','mix'])assert.deepEqual(actualHead[key],referenceHead[key],`head ${key} must not change`);
  for(const id of ['eyeL','eyeR','mouth'])assert.deepEqual(part(a,id).xy,part(b,id).xy,`facial landmark ${id} must not change`);
  for(let n=0;n<actualHead.xy.length;n++)maxDepartureFromHiddenFront=Math.max(maxDepartureFromHiddenFront,Math.abs(actualHead.xy[n]-referenceHead.xy[n]));
  if(q>=.22&&q<.6){
    const k=smooth(0,.6,q);
    for(let row=1;row<64;row++)for(let col=0;col<=12;col++){
      const front=paintedX('front',row,col),side=a.viewYaw<0?Math.fround(256-paintedX('threeQuarter',row,12-col)):paintedX('threeQuarter',row,col);
      const expected=front+(side-front)*k,n=(row*13+col)*2;
      const error=Math.abs(unrotatedHeadX(a,actualHead,n,frame)-expected);
      assert.ok(error<.00008,`head must expose its full painted profile; row ${row}, col ${col}, yaw ${a.viewYaw}: ${error}`);
      maxSourceShapeError=Math.max(maxSourceShapeError,error);
    }
    sourceShapeFrames++;
  }
  if(!frame.gesture&&q>=20/75&&q<=40/75){
    const col=a.viewYaw<0?12:0,sign=a.viewYaw<0?1:-1;
    const edge=Array.from({length:65},(_,row)=>sign*unrotatedHeadX(a,actualHead,(row*13+col)*2,frame));
    // A concave outward profile stays outside its chords. Check the whole
    // formerly hidden upper-back region; raster noise may be subpixel, but
    // a real notch must not be hidden by a positive-triangle test.
    for(let lo=12;lo<=38;lo++)for(let hi=lo+4;hi<=Math.min(50,lo+18);hi++)for(let mid=lo+1;mid<hi;mid++){
      const chord=edge[lo]+(edge[hi]-edge[lo])*(mid-lo)/(hi-lo);
      maxRearInwardDent=Math.max(maxRearInwardDent,chord-edge[mid]);
    }
    // A 26-unit span of rear head must retain an outward arc instead of a
    // straight bridge from crown to hanging ear.
    for(let lo=12;lo<=38;lo++)minimumRearArcBulge=Math.min(minimumRearArcBulge,edge[lo+6]-(edge[lo]+edge[lo+12])/2);
  }
  for(const id of ['head','earL','earR'])assert.equal(a.meshHealth[id].negativeTriangles,0,`${id} folds at yaw ${a.viewYaw}, ${frame.gesture?.kind??frame.mode}`);
  frames++;
}
// The previous 0/45/75-degree gallery skipped the faulty 20–40-degree band.
for(let degrees=-75;degrees<=75;degrees++)checkFrame({...baseline,t:frames/60,dt:1/60,modeT:frames/60,viewYaw:degrees/75});
// Real whole-ear gesture trajectories exercise the local correction after
// centre-line rotation, including its fade-in/out at intermediate turns.
for(const scheme of ['gentle','lively']){
  actual.setScheme(scheme);reference.setScheme(scheme);
  for(const degrees of [-40,-35,-30,-22,-15,0,15,22,30,35,40])for(const kind of ['ear-wave','flap','stretch'])for(let k=0;k<=20;k++){
    checkFrame({...baseline,t:frames/60,dt:1/60,modeT:frames/60,viewYaw:degrees/75,gesture:{kind,k:k/20}});
  }
}
actual.dispose();reference.dispose();
assert.ok(maxRearInwardDent<.10,'an exposed head boundary contains a visible inward dent');
assert.ok(minimumRearArcBulge>.25,'rear head contains a long flat bridge');
assert.ok(minimumHeadAreaRatio>.90,'the transition removes too much head volume');
console.log(JSON.stringify({passed:true,scope:'CPU geometry only; rendered silhouette and material still require actual captures',
  localCases,frames,sourceShapeFrames,maxSourceShapeError,maxDepartureFromHiddenFront,maxRearInwardDent,minimumRearArcBulge,minimumHeadAreaRatio,maxEarOutset,maxVisibleOutset,
  negativeHeadOrEarTriangles:0,mirroredLocalGeometry:true}));
