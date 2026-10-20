/**
 * Local rounding where the crown and hanging ear meet.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A single curve from the crown to a late ear crossing removes the rounded
 * back of the head at intermediate yaw. Keep the authored head immutable and
 * round only the ear's outer edge close to the actual silhouette crossing.
 */
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};

export const SHOULDER_ROUNDING_RADIUS=4;

/**
 * The registered front outline includes the shared hood/ear crown followed
 * by an inner face boundary that is hidden in the frontal drawing. Once an
 * ear turns into the foreground, expose the complete painted head instead
 * of revealing that hidden return branch as a notch in the back of the head.
 * The normal front-to-45-degree morph is applied after this local-key blend.
 */
export function revealFrontHead(out,approved,painted,q) {
  const gain=smooth(.02,.22,q);
  for(let n=0;n<out.length;n++)out[n]=lerp(approved[n],painted[n],gain);
}

export function fairEarShoulder(earRows,isLeft,q,headRaw,{cols=12,rows=64}={}) {
  const gain=smooth(0,.10,q)*(1-smooth(.42,.6,q));
  if(!gain)return;
  const stride=cols+1,sign=isLeft?-1:1,col=isLeft?0:cols;
  const top=headRaw[1],bottom=headRaw[rows*stride*2+1];
  function headAt(y) {
    const row=clamp((y-top)/(bottom-top))*rows,i=Math.min(rows-1,Math.floor(row)),t=row-i;
    const a=(i*stride+col)*2,b=a+stride*2;
    return sign*lerp(headRaw[a],headRaw[b],t);
  }
  for(let i=0;i<earRows.length;i++) {
    const row=earRows[i],y=row.rawY,v=i/(earRows.length-1);
    // Only the attached shoulder can change. Fade the radius at either end
    // of its support so animated rows cannot jump across a hard boundary.
    const support=smooth(0,.04,v)*smooth(top,top+8,y)*(1-smooth(bottom-16,bottom,y))*(1-smooth(.48,.58,v));
    const radius=SHOULDER_ROUNDING_RADIUS*gain*support;
    if(radius<=1e-8)continue;
    const outer=sign*row.rawX+row.width*.5,gap=headAt(y)-outer;
    if(gap<=-radius||gap>=2*radius)continue;
    // Compact smooth maximum of the two outlines: in the visible crossing
    // this adds at most radius/4 to their union. The extension inside the
    // head fades back to zero while remaining fully hidden behind it.
    // Both pieces meet with the same value and slope at gap=radius.
    const delta=gap<radius?(gap+radius)**2/(4*radius):gap*(1-smooth(radius,2*radius,gap));
    // Move only the exterior boundary. The inner-ear edge and the entire
    // head stay fixed; row widths can only increase (by less than 2*radius).
    row.rawX+=sign*delta*.5;
    row.width+=delta;
  }
}
