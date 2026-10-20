/**
 * One continuous painted material across the attached hood and ear roots.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Directional head cutouts contain their own edge shading. Extending that
 * boundary texel out over an attached ear makes an artificial dark stripe.
 * At every angle, both sides of the attachment share coordinates in the
 * approved front's clean skin. Only this internal attachment band is remapped;
 * free ears, pink lining, alpha, facial details and the exterior outline stay
 * in their existing authored layers. The front view uses the same field: an
 * angle-dependent opt-out would leave the original ear-root shadow at rest.
 */
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};

export function applyHoodMaterial({head,headRaw,ears,frontUV,cols=12,rows=64}) {
  head.rootWeight.fill(0);
  const stride=cols+1;
  const top=headRaw[1],bottom=headRaw[rows*stride*2+1];
  function sample(x,y,outA,outB,n) {
    const v=clamp((y-top)/Math.max(.0001,bottom-top)),row=v*rows;
    const r0=Math.min(rows-1,Math.floor(row)),fr=row-r0;
    const rowStart=r0*stride*2,nextStart=rowStart+stride*2;
    const left=lerp(headRaw[rowStart],headRaw[nextStart],fr);
    const right=lerp(headRaw[rowStart+cols*2],headRaw[nextStart+cols*2],fr);
    const rawU=(x-left)/Math.max(.0001,right-left),u=clamp(rawU);
    // Unwrap the internal join onto clean interior paint. This shrinks no
    // geometry and adds no color; it avoids reusing a cutout's old border.
    const interiorU=.18+.64*u,column=interiorU*cols;
    const c0=Math.min(cols-1,Math.floor(column)),fc=column-c0;
    const a=rowStart+c0*2,b=nextStart+c0*2;
    for(let k=0;k<2;k++) {
      const value=lerp(lerp(frontUV[a+k],frontUV[a+2+k],fc),lerp(frontUV[b+k],frontUV[b+2+k],fc),fr);
      outA[n*2+k]=value;
      if(outB)outB[n*2+k]=value;
    }
    return rawU;
  }
  for(let n=0;n<headRaw.length/2;n++) {
    const v=clamp((headRaw[n*2+1]-top)/Math.max(.0001,bottom-top));
    const u=(n%stride)/cols;
    const edge=1-smooth(.14,.38,Math.min(u,1-u));
    const band=smooth(.09,.17,v)*(1-smooth(.62,.78,v));
    const weight=edge*band;
    // UV attributes interpolate across triangle edges even when this
    // vertex's blend weight is zero. Every vertex needs the same valid
    // material field; leaving a zero UV would sample unrelated atlas cells.
    sample(headRaw[n*2],headRaw[n*2+1],head.rootUV,head.rootUV2,n);
    head.rootMix[n]=0;head.rootWeight[n]=weight;
  }
  for(const {part,raw} of ears)for(let n=0;n<raw.length/2;n++) {
    // The root is a single piece of fabric with the hood. Directional edge
    // paint must not re-enter this shared field at small or zero yaw. Supply
    // both UV attributes even when mix is zero, so every interpolated texel
    // remains in the head-skin atlas cell rather than an unrelated sprite.
    sample(raw[n*2],raw[n*2+1],part.rootUV,part.rootUV2,n);
    part.rootMix[n]=0;
  }
}
