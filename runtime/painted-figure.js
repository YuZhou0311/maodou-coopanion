/**
 * Painted Maodou mesh rig. SPDX-License-Identifier: AGPL-3.0-or-later
 * Actual GPT-painted atlas pixels supply every visible character part.
 * The rest head XY is measured from user-selected front-master-02, separately
 * from the clean skin UV. Turning uses authored painted 0/45/75-degree keys.
 * Near-ear coverage is a moving spatial field in the character's opaque core,
 * not a whole-ear alpha fade or a change of the entire ear's drawing order.
 */
import { createAtlasRenderer } from './atlas-renderer.js';
import { createAnimator } from './animation.js';
import { CUSTOM_MOTION_IDS } from './words.js';

const SVG = 'http://www.w3.org/2000/svg', HTML = 'http://www.w3.org/1999/xhtml';
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rad = Math.PI / 180;
const keyNames = ['front', 'threeQuarter', 'side'];

// Shape-preserving cubic interpolation in y; no ellipses define the head.
function curve(points) {
  const p = points.map(([x,y]) => [y,x]);
  const d = p.slice(1).map((v,i) => (v[1]-p[i][1])/(v[0]-p[i][0]));
  const m = p.map((_,i) => i === 0 ? d[0] : i === p.length-1 ? d.at(-1) :
    d[i-1]*d[i] <= 0 ? 0 : 2/(1/d[i-1]+1/d[i]));
  return y => {
    if (y <= p[0][0]) return p[0][1];
    if (y >= p.at(-1)[0]) return p.at(-1)[1];
    let i=0; while(p[i+1][0] < y) i++;
    const h=p[i+1][0]-p[i][0], t=(y-p[i][0])/h, t2=t*t, t3=t2*t;
    return (2*t3-3*t2+1)*p[i][1]+(t3-2*t2+t)*h*m[i]+(-2*t3+3*t2)*p[i+1][1]+(t3-t2)*h*m[i+1];
  };
}
function sampleRow(sprite, v) {
  const rows = sprite.contour.rows, t = clamp(v)*(rows.length-1);
  const i = Math.min(rows.length-2, Math.floor(t)), k=t-i;
  return [lerp(rows[i].left,rows[i+1].left,k), lerp(rows[i].right,rows[i+1].right,k)];
}
function grid(cols, rows) {
  const count=(cols+1)*(rows+1), st=new Float32Array(count*2), indices=new Uint16Array(cols*rows*6);
  let j=0;
  for(let y=0;y<=rows;y++) for(let x=0;x<=cols;x++) {st[j++]=x/cols;st[j++]=y/rows;}
  j=0;
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) {
    const a=y*(cols+1)+x,b=a+1,c=a+cols+1,d=c+1;
    indices[j++]=a;indices[j++]=b;indices[j++]=c;indices[j++]=b;indices[j++]=d;indices[j++]=c;
  }
  return {count,st,indices};
}
function uvGrid(sprite, mesh, { mirror=false, contour=true }={}) {
  const out=new Float32Array(mesh.count*2), [au,av,aw,ah]=sprite.uvRect;
  // The runtime supplies ONE exterior silhouette stroke. Sample just inside
  // painted skin borders so an atlas-cell perimeter is not drawn a second
  // time across an ear/head or limb/body join. Geometry remains unchanged.
  const inset=4/sprite.cutSize[0];
  for(let n=0;n<mesh.count;n++) {
    const u=mesh.st[n*2], v=mesh.st[n*2+1];
    const sv=contour?clamp(v,3/sprite.cutSize[1],1-3/sprite.cutSize[1]):v;
    const edge=contour?sampleRow(sprite,sv):[0,1];
    const d=contour?Math.min(inset,(edge[1]-edge[0])*.38):0;
    const s=lerp(edge[0]+d,edge[1]-d,mirror?1-u:u);
    out[2*n]=au+s*aw;out[2*n+1]=av+sv*ah;
  }
  return out;
}
function rotate(x,y,px,py,degrees) {
  const a=degrees*rad, c=Math.cos(a),s=Math.sin(a),dx=x-px,dy=y-py;
  return [px+dx*c-dy*s, py+dx*s+dy*c];
}
function lerpKnots(values,v) {
  const knots=[0,.2,.5,.8,1]; let i=0;
  while(i<3&&v>knots[i+1])i++;
  return lerp(values[i],values[i+1],smooth(knots[i],knots[i+1],v));
}
function interpolateKey(q) {
  return q<.6?{a:0,b:1,k:smooth(0,.6,q)}:{a:1,b:2,k:smooth(.6,1,q)};
}

export async function createPaintedFigure(base, opts) {
  const model=opts.model;
  if(model?.format !== 'maodou-painted-mesh' || !model.art?.sprites || !model.approvedFront?.contour) {
    throw new Error('Maodou requires its complete model.json with the approved front contour and painted atlas metadata.');
  }
  const doc=opts.host?.root?.ownerDocument ?? document;
  const canvas=doc.createElementNS(HTML,'canvas');
  const view=model.view ?? [-36,-28,292,282], viewW=view[2]-view[0],viewH=view[3]-view[1];
  canvas.width=model.renderEdge??512;canvas.height=Math.round(canvas.width*viewH/viewW);
  canvas.setAttribute('aria-label','异色大耳帽兜');
  Object.assign(canvas.style,{width:'100%',height:'100%',display:'block',pointerEvents:'none'});
  const foreign=doc.createElementNS(SVG,'foreignObject');
  for(const [key,value]of Object.entries({x:view[0],y:view[1],width:viewW,height:viewH}))foreign.setAttribute(key,value);
  foreign.setAttribute('pointer-events','none'); foreign.appendChild(canvas);
  let errors=[],lastFrame=null,pose=null,lastYaw=0,disposed=false,renderCount=0,scheme=opts.scheme?.includes?.('lively')?'lively':'gentle';
  const animator=createAnimator({scheme});
  const renderer=createAtlasRenderer(canvas,{
    view,maxEdge:model.renderEdge??512,outline:model.outline,
    // A native SVG foreignObject may composite between animation callbacks.
    preserveDrawingBuffer:true,
    onError:e=>{errors.push(String(e?.message??e));if(errors.length>20)errors.shift();},
  });
  try { renderer.setAtlas(await opts.loadImage(opts.asset(model.art.atlas.file)),{version:model.art.atlas.sha256}); }
  catch(e){renderer.dispose();throw e;}
  const art=model.art.sprites, parts=[], byId=new Map();
  function make(id,spriteId,mesh,z,options={}) {
    const p={id,xy:new Float32Array(mesh.count*2),uv:uvGrid(art[spriteId],mesh,{contour:options.contour!==false,mirror:options.mirror}),
      uv2:new Float32Array(mesh.count*2),mix:new Float32Array(mesh.count),vertexAlpha:new Float32Array(mesh.count).fill(1),
      indices:mesh.indices,z,clip:options.clip,alpha:1};
    p.uv2.set(p.uv);parts.push(p);byId.set(id,{p,mesh,spriteId});return p;
  }
  const headMesh=grid(12,64),torsoMesh=grid(10,40),earMesh=grid(12,48),limbMesh=grid(5,12),faceMesh=grid(1,1),lidMesh=grid(12,2);
  const tail=make('tail','tail',limbMesh,0);
  const earL=make('earL','ear.front',earMesh,2,{mirror:true}),earR=make('earR','ear.front',earMesh,2);
  const footL=make('footL','foot.left',limbMesh,5),footR=make('footR','foot.right',limbMesh,5);
  const armL=make('armL','arm.left',limbMesh,9),armR=make('armR','arm.right',limbMesh,9);
  const body=make('body','torso.front',torsoMesh,12), head=make('head','head.front',headMesh,18);
  const faceClip={mask:'face',mode:'inside'};
  const features={};
  for(const side of ['L','R']) {
    features['blush'+side]=make('blush'+side,'blush',faceMesh,20,{contour:false,clip:faceClip});
    features['eye'+side]=make('eye'+side,'eye.open',faceMesh,23,{contour:false,clip:faceClip});
    features['lid'+side]=make('lid'+side,'eye.closed',lidMesh,24,{contour:false,clip:faceClip});
    features['brow'+side]=make('brow'+side,side==='L'?'brow.left':'brow.right',faceMesh,22,{contour:false,clip:faceClip});
    features['tear'+side]=make('tear'+side,'tear',faceMesh,25,{contour:false,clip:faceClip});
  }
  features.mouth=make('mouth','mouth.smile',faceMesh,24,{contour:false,clip:faceClip});
  const frontL=make('earFrontL','ear.front',earMesh,32,{mirror:true,clip:{mask:'solid',mode:'inside'}});
  const frontR=make('earFrontR','ear.front',earMesh,32,{clip:{mask:'solid',mode:'inside'}});
  // The foreground uses EXACTLY the same geometry and samples as the base.
  for(const [front,back]of[[frontL,earL],[frontR,earR]]){front.xy=back.xy;front.uv=back.uv;front.uv2=back.uv2;front.mix=back.mix;}
  // Include the head/torso anti-aliased fringe. A hard opaque-core mask leaves
  // the pink head-edge pixels visible through the near ear as a false seam.
  renderer.setScene({parts,masks:[{id:'face',parts:['head']},{id:'solid',parts:['head','body','armL','armR'],supportThreshold:.06}]});
  const headUV=keyNames.map(k=>uvGrid(art['head.'+k],headMesh));
  const bodyUV=keyNames.map(k=>uvGrid(art['torso.'+k],torsoMesh));
  const headLeftUV=keyNames.map((k,i)=>i?uvGrid(art['head.'+k],headMesh,{mirror:true}):headUV[0]);
  const bodyLeftUV=keyNames.map((k,i)=>i?uvGrid(art['torso.'+k],torsoMesh,{mirror:true}):bodyUV[0]);
  const earUV={L:[uvGrid(art['ear.front'],earMesh,{mirror:true}),uvGrid(art['ear.outer'],earMesh,{mirror:true})],
    R:[uvGrid(art['ear.front'],earMesh),uvGrid(art['ear.outer'],earMesh)]};
  const featureUV={};
  for(const id of ['eye.open','eye.closed','eye.happy','mouth.smile','mouth.open','mouth.o','mouth.sad'])featureUV[id]=uvGrid(art[id],faceMesh,{contour:false});
  const approved=model.approvedFront, reg=approved.registration;
  const leftCurve=curve(approved.contour.left),rightCurve=curve(approved.contour.right);
  const earRows=approved.ears.rows;
  function restEar(side,u,v){
    const t=clamp(v)*(earRows.length-1),i=Math.min(earRows.length-2,Math.floor(t)),k=t-i;
    const lo=lerp(earRows[i][side][0],earRows[i+1][side][0],k),hi=lerp(earRows[i][side][1],earRows[i+1][side][1],k);
    const py=lerp(earRows[i].y,earRows[i+1].y,k);
    return [reg.targetCenterX+(lerp(lo,hi,u)-reg.sourceCenterX)*reg.scale,reg.targetTopY+(py-reg.sourceTopY)*reg.scale];
  }
  const restEarWidths=Object.fromEntries(['L','R'].map(side=>[side,
    Array.from({length:49},(_,row)=>restEar(side,1,row/48)[0]-restEar(side,0,row/48)[0])
  ]));
  const headKeys=keyNames.map((key,ki)=>{
    const pos=new Float32Array(headMesh.count*2),spr=art['head.'+key],box=model.head[key];
    for(let n=0;n<headMesh.count;n++){
      const u=headMesh.st[n*2],v=headMesh.st[n*2+1];
      if(ki===0){
        const py=reg.sourceTopY+v*565, px=lerp(leftCurve(py),rightCurve(py),u);
        pos[n*2]=reg.targetCenterX+(px-reg.sourceCenterX)*reg.scale;
        pos[n*2+1]=reg.targetTopY+(py-reg.sourceTopY)*reg.scale;
      }else{
        const edge=sampleRow(spr,v),s=lerp(edge[0],edge[1],u);
        pos[n*2]=box[0]+s*box[2];pos[n*2+1]=box[1]+v*box[3];
      }
    }
    return pos;
  });
  const torsoKeys=keyNames.map(key=>{
    const pos=new Float32Array(torsoMesh.count*2),spr=art['torso.'+key],box=model.torso[key];
    for(let n=0;n<torsoMesh.count;n++){
      const u=torsoMesh.st[n*2],v=torsoMesh.st[n*2+1],edge=sampleRow(spr,v);
      pos[n*2]=box[0]+lerp(edge[0],edge[1],u)*box[2];pos[n*2+1]=box[1]+v*box[3];
    }
    return pos;
  });
  // A left-facing key reverses source columns as well as X. Merely negating
  // X for one end of a morph makes corresponding vertices cross at mid-yaw.
  // The approved front remains unmirrored; each destination row stays L->R.
  function leftFacingKeys(keys,cols){
    return keys.map((key,index)=>{
      if(!index)return key;
      const out=new Float32Array(key.length),rowWidth=cols+1;
      for(let n=0;n<key.length/2;n++){
        const row=Math.floor(n/rowWidth),col=n%rowWidth,source=(row*rowWidth+cols-col)*2;
        out[n*2]=256-key[source];out[n*2+1]=key[source+1];
      }
      return out;
    });
  }
  const headLeftKeys=leftFacingKeys(headKeys,12),torsoLeftKeys=leftFacingKeys(torsoKeys,10);
  let extent=[-22,20,278,257],hits=[[128,96,66],[128,197,45],[38,180,29],[218,180,29]],anchors={gaze:[128,116],bubble:[128,16],z:[180,40],hearts:[86,170,30],tears:[[87,128],[169,128]]};
  let occlusion={left:0,right:0},headBounds=[54,22,202,164],faceCenters={};
  function setMix(p,uv1,uv2,k){p.uv.set(uv1);p.uv2.set(uv2??uv1);p.mix.fill(k);}
  function transformHead(x,y){
    const q=pose??{}, sit=clamp(lastFrame?.sit??0),low=lastFrame?.low??0;
    const restY=(q.bodyY??0)+(q.headY??0)+sit*14+Math.min(10,low*.32);
    // A 3.5% crown trim, anchored at the chin. Ear roots and facial features
    // follow the same continuous map; the lower hanging ears keep their length.
    y+=Math.max(0,164-y)*(1-(model.headHeightScale??1));
    return rotate(x,y+restY,128,153+restY,(q.headTilt??0)+(q.bodyTilt??0)*.35);
  }
  function transformBody(x,y){
    const sit=clamp(lastFrame?.sit??0),low=lastFrame?.low??0;
    const sx=(pose.bodySX??1)*(1+sit*.04),sy=(pose.bodySY??1)*(1-sit*.19);
    const X=128+(x-128)*sx, Y=240+(y-240)*sy+(pose.bodyY??0)+Math.min(8,low*.23);
    return rotate(X,Y,128,238,pose.bodyTilt??0);
  }
  function morph(p,keys,uvs,state,transform){
    setMix(p,uvs[state.a],uvs[state.b],state.k);
    for(let n=0;n<p.xy.length;n+=2){
      let x=lerp(keys[state.a][n],keys[state.b][n],state.k),y=lerp(keys[state.a][n+1],keys[state.b][n+1],state.k);
      const out=transform(x,y);p.xy[n]=out[0];p.xy[n+1]=out[1];
    }
  }
  function spriteBox(p,mesh,spriteId,box,{angle=0,pivot=null,transform=null,alpha=1,mirror=false}={}){
    const spr=art[spriteId];
    for(let n=0;n<mesh.count;n++){
      const u=mesh.st[n*2],v=mesh.st[n*2+1],edge=sampleRow(spr,v);
      let x=box[0]+lerp(edge[0],edge[1],u)*box[2],y=box[1]+v*box[3];
      if(mirror)x=256-x;
      if(angle)[x,y]=rotate(x,y,pivot?.[0]??box[0]+box[2]/2,pivot?.[1]??box[1]+box[3]/2,angle);
      if(transform)[x,y]=transform(x,y);
      p.xy[n*2]=x;p.xy[n*2+1]=y;
    }
    p.vertexAlpha.fill(clamp(alpha));
  }
  function quad(p,cx,cy,w,h,angle=0,alpha=1){
    for(let n=0;n<4;n++){
      let x=cx+(faceMesh.st[n*2]-.5)*w,y=cy+(faceMesh.st[n*2+1]-.5)*h;
      if(angle)[x,y]=rotate(x,y,cx,cy,angle);
      [x,y]=transformHead(x,y);p.xy[n*2]=x;p.xy[n*2+1]=y;
    }
    p.vertexAlpha.fill(clamp(alpha));
  }
  function closedLid(p,cx,cy,width,happy,angle,alpha){
    const mid=model.featureProfiles.closedEyeMidline,center=mid[6],curvature=lerp(6,-11,happy);
    for(let n=0;n<lidMesh.count;n++){
      const u=lidMesh.st[n*2],v=lidMesh.st[n*2+1],column=Math.round(u*12),sourceCenter=mid[column];
      // Warp ONE painted stroke about its measured centre line. Convex,
      // straight and concave lids stay opaque, instead of ghosting two arcs.
      let x=cx+(u-.5)*width,y=cy+(v-sourceCenter)*5+(sourceCenter-center)*curvature;
      if(angle)[x,y]=rotate(x,y,cx,cy,angle);
      [x,y]=transformHead(x,y);p.xy[n*2]=x;p.xy[n*2+1]=y;
    }
    p.vertexAlpha.fill(clamp(alpha));
  }
  function ears(q,sign,state){
    const front=[81,66,52,34,34],near45=[95,95,91,77,67],near75=[135,134,139,146,143];
    const far45=[175,191,207,218,223],far75=[166,175,185,195,201];
    for(const side of ['L','R']){
      const isLeft=side==='L', near=sign>=0?isLeft:!isLeft, p=isLeft?earL:earR,over=isLeft?frontL:frontR;
      const base=front,mid=near?near45:far45.map(x=>256-x),end=near?near75:far75.map(x=>256-x);
      const centers=[base,mid,end],mix=smooth(.05,.57,q)*(near?1:.12);
      setMix(p,earUV[side][0],earUV[side][1],mix);
      const widths=near?[72,82,96]:[72,51,35],heights=near?[198,195,195]:[198,185,181];
      const width=lerp(widths[state.a],widths[state.b],state.k),height=lerp(heights[state.a],heights[state.b],state.k);
      const lift=pose['earLift'+side]??0,inward=pose['earIn'+side]??0,curl=pose['earCurl'+side]??0,tip=pose['earTip'+side]??0;
      const raise=clamp(pose['earRaise'+side]??0),spread=clamp(pose['earSpread'+side]??0,-1,1);
      const ss=isLeft?1:-1;
      // Rotate short centre-line segments, then rotate each cross-section.
      // This raises the whole soft paddle with a fixed root, rather than
      // shortening its Y coordinates until the lower triangles fold over.
      const rows=[];
      for(let row=0;row<=48;row++){
        const v=row/48,e1=sampleRow(art['ear.front'],v),e2=sampleRow(art['ear.outer'],v);
        const profile=lerp(e1[1]-e1[0],e2[1]-e2[0],mix)/.93;
        let center=lerp(lerpKnots(centers[state.a],v),lerpKnots(centers[state.b],v),state.k);
        if(!isLeft)center=256-center;
        let rowWidth=width*profile,y=47+v*height;
        if(state.a===0){
          const rest=restEar(side,.5,v),target=lerpKnots(centers[1],v);
          center=lerp(rest[0],isLeft?target:256-target,state.k);
          y=lerp(rest[1],47+v*heights[1],state.k);
          rowWidth=lerp(restEarWidths[side][row],widths[1]*profile,state.k);
        }
        const delay=v*v*(3-2*v);
        center+=ss*(inward*delay+Math.sin(curl*rad)*v*v*36-tip*v*v);
        y-=lift*v*v;y+=(pose.bodyY??0)*v*.15;
        const angle=ss*(raise*69+spread*9)*smooth(.015,.47,v)*rad;
        const previous=rows[row-1];
        let x=center,dy=y;
        if(previous){
          const theta=(angle+previous.angle)*.5,dx=center-previous.rawX,stepY=y-previous.rawY;
          x=previous.x+dx*Math.cos(theta)-stepY*Math.sin(theta);
          dy=previous.y+dx*Math.sin(theta)+stepY*Math.cos(theta);
        }
        rows.push({rawX:center,rawY:y,x,y:dy,width:rowWidth,angle});
      }
      let coverage=0;
      for(let n=0;n<earMesh.count;n++){
        const u=earMesh.st[n*2],v=earMesh.st[n*2+1];
        const r=rows[Math.round(v*48)],offset=(u-.5)*r.width;
        let x=r.x+offset*Math.cos(r.angle),y=r.y+offset*Math.sin(r.angle);
        // Tip bend also rolls the soft paddle, without detaching its root.
        // Roll in proportion to the actual cross-section: the rounded cap
        // tapers to zero, so a constant-width twist would fold its triangles.
        y+=offset*ss*Math.sin(curl*rad)*v*.12;
        [x,y]=transformHead(x,y);p.xy[n*2]=x;p.xy[n*2+1]=y;
        const turnProgress=near?smooth(.025,.44,q):0;
        const poseProgress=smooth(3,27,inward)*.9;
        const progress=Math.max(turnProgress,poseProgress);
        const rollU=isLeft?u:1-u;
        const field=(1-smooth(progress*1.13-.11,progress*1.13+.11,rollU))*smooth(.025,.36,v)*smooth(0,.035,progress);
        over.vertexAlpha[n]=field;coverage+=field;
      }
      occlusion[isLeft?'left':'right']=coverage/earMesh.count;
    }
  }
  function face(q,sign,state){
    const proj={
      near:[[.23,.657,1],[.58,.655,.91],[.825,.66,.61]],
      far:[[.77,.657,1],[.952,.627,.43],[1.145,.62,.24]],
      browNear:[[.293,.227,1],[.612,.24,.84],[.802,.25,.66]],
      browFar:[[.71,.227,1],[.91,.21,.58],[1.12,.21,.32]],
      mouth:[[.5,.784,1],[.823,.775,.84],[.965,.768,.52]],
    };
    const hboxes=keyNames.map(k=>model.head[k]);
    const box=hboxes[0].map((_,i)=>lerp(hboxes[state.a][i],hboxes[state.b][i],state.k));
    function point(rows){
      const uv=rows[0].map((_,i)=>lerp(rows[state.a][i],rows[state.b][i],state.k));
      let x=box[0]+uv[0]*box[2],y=box[1]+uv[1]*box[3];
      if(sign<0)x=256-x;
      return [x,y,uv[2]];
    }
    const gaze=lastFrame.lookScreen??[0,0],lookX=clamp(gaze[0]/5,-1,1)*(1-q*.65)*2.5,lookY=clamp(gaze[1]/5,-1,1)*1.8;
    for(const side of ['L','R']){
      const near=sign>=0?side==='L':side==='R',p=point(proj[near?'near':'far']);
      const open=clamp(pose['eye'+side]??1,0,1.15),happy=clamp(pose['happy'+side]??0);
      const wide=22*p[2]*(1+.07*Math.max(0,open-1)),height=Math.max(1,36.8*open);
      const alpha=smooth(.28,.34,open),angle=pose['eyeTilt'+side]??0;
      quad(features['eye'+side],p[0]+lookX,p[1]+lookY,wide,height,angle,alpha);
      closedLid(features['lid'+side],p[0]+lookX,p[1]+lookY+1,wide*1.06,happy,angle,1-alpha);
      const brow=point(proj[near?'browNear':'browFar']);
      quad(features['brow'+side],brow[0],brow[1]+(pose.browY??0),10.7*brow[2],8.1,(side==='L'?1:-1)*(pose.browTilt??0));
      quad(features['blush'+side],p[0]+(side==='L'?-3:3),p[1]+22,36*p[2],25,0,(pose.blush??0)*.75);
      const drop=(lastFrame.t*.72+(side==='L'?0:.48))%1;
      quad(features['tear'+side],p[0]+(side==='L'?-7:7)*p[2],p[1]+19+drop*14,5.1*p[2],7.8,0,(pose.tear??0)*Math.sin(drop*Math.PI));
      faceCenters[side]=transformHead(p[0]+lookX,p[1]+lookY);
    }
    const m=point(proj.mouth),mix=pose.mouthMix??{[pose.mouthShape??'smile']:1};
    const entries=Object.entries(mix).filter(([k])=>featureUV['mouth.'+k]).sort((a,b)=>b[1]-a[1]);
    const first=entries[0]??['smile',1],second=entries[1]??first;
    setMix(features.mouth,featureUV['mouth.'+first[0]],featureUV['mouth.'+second[0]],second===first?0:second[1]/Math.max(.00001,first[1]+second[1]));
    quad(features.mouth,m[0]+lookX*.25,m[1],(pose.mouthW??9)*m[2],pose.mouthH??2.4);
  }
  function boundsOf(p){
    const b=[Infinity,Infinity,-Infinity,-Infinity];
    for(let n=0;n<p.xy.length;n+=2){b[0]=Math.min(b[0],p.xy[n]);b[1]=Math.min(b[1],p.xy[n+1]);b[2]=Math.max(b[2],p.xy[n]);b[3]=Math.max(b[3],p.xy[n+1]);}
    return b;
  }
  function meshHealth(){
    const result={};
    for(const p of [head,body,earL,earR]){
      let minArea=Infinity,negativeTriangles=0;
      for(let i=0;i<p.indices.length;i+=3){
        const a=p.indices[i]*2,b=p.indices[i+1]*2,c=p.indices[i+2]*2;
        const area=((p.xy[b]-p.xy[a])*(p.xy[c+1]-p.xy[a+1])-(p.xy[b+1]-p.xy[a+1])*(p.xy[c]-p.xy[a]))*.5;
        minArea=Math.min(minArea,area);if(area<-.00001)negativeTriangles++;
      }
      result[p.id]={bounds:boundsOf(p),minArea,negativeTriangles};
    }
    return result;
  }
  function updateBounds(){
    const bs=[head,body,earL,earR,armL,armR,footL,footR,...(Math.abs(lastYaw)>.06?[tail]:[])].map(boundsOf);
    extent=[Math.min(...bs.map(b=>b[0]))-.7,Math.min(...bs.map(b=>b[1]))-.7,Math.max(...bs.map(b=>b[2]))+.7,Math.max(...bs.map(b=>b[3]))+.7];
    headBounds=bs[0];const hx=(headBounds[0]+headBounds[2])/2,hy=(headBounds[1]+headBounds[3])/2;
    hits=[[hx,hy,Math.min(headBounds[2]-headBounds[0],headBounds[3]-headBounds[1])*.43],[128,200,39]];
    for(const p of [earL,earR])for(const v of [.42,.72,.9]){
      const row=Math.round(v*48),n=(row*13+6)*2;hits.push([p.xy[n],p.xy[n+1],17]);
    }
    const left=faceCenters.L??[86,117],right=faceCenters.R??[170,117];
    anchors={gaze:[(left[0]+right[0])/2,(left[1]+right[1])/2],bubble:[hx,Math.max(view[1]+4,headBounds[1]-7)],z:[headBounds[2]-9,headBounds[1]+14],
      hearts:[hx-30,hx+30,headBounds[1]+5],tears:[[left[0],left[1]+16],[right[0],right[1]+16]],tear:[right[0],right[1]+16]};
  }
  const figure={
    colors:{z:'#65bcc9'},
    gestures:['nod','shake','spin','wave','bow','shiver','flap',...CUSTOM_MOTION_IDS],
    get extent(){return extent;},get hits(){return hits;},get anchors(){return anchors;},
    groupTilt(mode,tilt,lean){return mode==='drag'||mode==='air'?tilt+lean:clamp(tilt+lean,-15,15);},
    draw(group,_face,frame){
      if(disposed)return;
      if(foreign.parentNode!==group)group.appendChild(foreign);
      lastFrame=frame;pose=animator.step(frame);
      lastYaw=clamp((frame.viewYaw??0)+(pose.yawOffset??0),-1,1);
      const q=Math.abs(lastYaw),sign=lastYaw<0?-1:1,state=interpolateKey(q);
      morph(body,sign<0?torsoLeftKeys:torsoKeys,sign<0?bodyLeftUV:bodyUV,state,transformBody);
      morph(head,sign<0?headLeftKeys:headKeys,sign<0?headLeftUV:headUV,state,transformHead);
      ears(q,sign,state);
      const handIn=pose.handIn??0;
      const armKeys={near:[[68,171,38,34],[90,171,31,34],[104,171,23,34]],far:[[150,171,38,34],[151,171,27,34],[149,171,17,34]]};
      for(const side of ['L','R']){
        const isLeft=side==='L',near=sign>=0?isLeft:!isLeft,rows=armKeys[near?'near':'far'];
        const box=rows[0].map((_,i)=>lerp(rows[state.a][i],rows[state.b][i],state.k));
        if(sign<0)box[0]=256-box[0]-box[2];
        box[0]+=(isLeft?1:-1)*handIn;
        const pivot=[isLeft?box[0]+box[2]-3:box[0]+3,box[1]+2];
        spriteBox(isLeft?armL:armR,limbMesh,isLeft?'arm.left':'arm.right',box,{angle:pose['arm'+side]??0,pivot,transform:transformBody});
      }
      const footW=26-q*5,gap=19-q*7,footShift=sign*q*6;
      spriteBox(footL,limbMesh,'foot.left',[128-gap-footW/2+footShift+(pose.footXL??0),231-(pose.footLiftL??0),footW,25],{angle:-3+q*4-(pose.footXL??0)*.35});
      spriteBox(footR,limbMesh,'foot.right',[128+gap-footW/2+footShift+(pose.footXR??0),231-(pose.footLiftR??0),footW,25],{angle:3-q*4-(pose.footXR??0)*.35});
      spriteBox(tail,limbMesh,'tail',[128-sign*(39+q*5)-14,207,28,25],{angle:pose.tail??0,transform:transformBody,alpha:smooth(.04,.3,q)});
      face(q,sign,state);updateBounds();renderer.render();renderCount++;
    },
    setScheme(id){scheme=String(id).includes('lively')?'lively':'gentle';animator.setScheme(scheme);},
    setRenderEdge(edge){const e=clamp(Math.round(edge),256,640);renderer.resize(e,Math.round(e*viewH/viewW),{maxEdge:e});},
    inspect(){return {format:model.format,version:model.version,scheme,renderCount,disposed,viewYaw:lastYaw,
      pose:pose?{...pose}:null,occlusion:{...occlusion},extent:extent.slice(),headBounds:headBounds.slice(),faceCenters:{...faceCenters},
      approvedFrontSource:model.approvedFront.source.sha256,meshHealth:meshHealth(),errors:errors.slice(),renderer:renderer.inspect(),animator:animator.inspect()};},
    dispose(){if(disposed)return;disposed=true;renderer.dispose();foreign.remove();},
  };
  return figure;
}
