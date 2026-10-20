#!/usr/bin/env python3
"""Compose actual runtime captures for delivery. No character drawing or recoloring.
Usage: python tools/build-release-contact.py [--output preview/release]
Reads the latest complete words-final and release-acceptance reports each run;
source PNG hashes must match those reports. Never reads failed angles-final.
Requires Pillow; bundled Noto Sans CJK font is licensed under OFL.txt.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageChops
import argparse, datetime, hashlib, io, json, math, re

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / 'tools/fonts/NotoSansCJKsc-Regular.otf'
BG = '#ede9f2'; INK = '#51495e'; MUTED = '#8a7e99'; LINE = '#ded6e6'; CARD = '#faf9fc'
EXPRS = ['neutral','happy','wink','love','shy','surprised','angry','sad','sleepy','thinking','smug','pout','worried','determined','flustered','scared','excited','cry','confused','cozy','curious','bashful','pleading','proud','sparkle']

def sha(b): return hashlib.sha256(b).hexdigest()
def font(n): return ImageFont.truetype(str(FONT), n)
def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp'); tmp.write_bytes(data); tmp.replace(path)
def pngbytes(im):
    b=io.BytesIO(); im.save(b, format='PNG', optimize=True); return b.getvalue()
def relative(path): return str(path.relative_to(ROOT))

def report(folder):
    p=ROOT/'docs/qa'/folder/'report.json'; raw=p.read_bytes(); d=json.loads(raw)
    if d.get('status') != 'complete' or not d.get('sourcesUnchanged'): raise RuntimeError(f'Capture report not complete/stable: {p}')
    return d, {'file':relative(p),'sha256':sha(raw),'completedAt':d.get('completedAt'),'sourcesBefore':d.get('sourcesBefore'),'sourcesAfter':d.get('sourcesAfter')}

def load_capture(folder, rec):
    raster=rec.get('raster')
    chosen=raster if raster else rec
    p=ROOT/'docs/qa'/folder/chosen['file']; raw=p.read_bytes()
    if chosen.get('sha256') != sha(raw): raise RuntimeError(f'PNG no longer matches report: {p}')
    im=Image.open(io.BytesIO(raw)).convert('RGBA'); im.load()
    transparent=im.getchannel('A').getextrema()[0] < 255
    if transparent:
        bbox=im.getchannel('A').getbbox()
        if not bbox: raise ValueError(f'Empty capture: {p}')
        x0,y0,x1,y1=bbox; pad=5
        bbox=(max(0,x0-pad),max(0,y0-pad),min(im.width,x1+pad),min(im.height,y1+pad))
        method='actual transparent logical-space canvas; alpha crop and uniform thumbnail only'
    else:
        # Native stage footer is below 91% height. Detect the whole character and
        # ground shadow above it; crop only. RGB and original background remain.
        area=im.crop((0,0,im.width,int(im.height*.91))).convert('RGB')
        bg=Image.new('RGB',area.size,area.getpixel((0,0)))
        diff=ImageChops.difference(area,bg)
        mask=ImageChops.lighter(ImageChops.lighter(diff.getchannel('R'),diff.getchannel('G')),diff.getchannel('B')).point(lambda v:255 if v>3 else 0)
        bbox=mask.getbbox()
        if not bbox: raise ValueError(f'No stage figure: {p}')
        x0,y0,x1,y1=bbox; pad=8
        bbox=(max(0,x0-pad),max(0,y0-pad),min(im.width,x1+pad),min(area.height,y1+pad))
        method='actual opaque stage; lossless crop including original background and ground shadow; no background removal'
    cut=im.crop(bbox)
    return cut, {'id':rec['id'],'source':relative(p),'sourceSHA256':sha(raw),'sourceSize':list(im.size),'cropBox':list(bbox),'transparent':transparent,'method':method,'requestedAngle':rec.get('requestedAngle'),'word':rec.get('word'),'kind':rec.get('kind')}

def title(draw,w,title,subtitle,eyebrow):
    draw.text((60,35),eyebrow,font=font(17),fill=MUTED)
    draw.text((58,69),title,font=font(48),fill=INK)
    draw.text((60,145),subtitle,font=font(20),fill=MUTED)
    draw.line((60,193,w-60,193),fill=LINE,width=2)

def compose(items, labels, columns, cardw, cardh, heading, subtitle, eyebrow, footer):
    gap=20; margin=60; top=222; rows=math.ceil(len(items)/columns)
    w=margin*2+columns*cardw+(columns-1)*gap; h=top+rows*cardh+(rows-1)*gap+91
    canvas=Image.new('RGBA',(w,h),BG); d=ImageDraw.Draw(canvas)
    title(d,w,heading,subtitle,eyebrow); metas=[]
    for i,(im,meta) in enumerate(items):
        x=margin+(i%columns)*(cardw+gap);y=top+(i//columns)*(cardh+gap)
        d.rounded_rectangle((x,y+3,x+cardw,y+cardh+3),radius=20,fill='#e4deeb')
        d.rounded_rectangle((x,y,x+cardw,y+cardh),radius=20,fill=CARD,outline=LINE,width=1)
        d.text((x+20,y+13),f'{i+1:02}',font=font(15),fill=MUTED)
        d.text((x+57,y+10),labels[i],font=font(23 if columns==3 else 21),fill=INK)
        area=(x+12,y+49,cardw-24,cardh-67)
        scale=min(area[2]/im.width,area[3]/im.height,1.0)
        if not meta['transparent'] and scale<1: raise RuntimeError('Opaque source must remain at native pixels; enlarge card.')
        displayed=im if scale==1 else im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
        ox=area[0]+(area[2]-displayed.width)//2;oy=area[1]+(area[3]-displayed.height)//2
        canvas.alpha_composite(displayed,(ox,oy))
        m=dict(meta);m.update({'label':labels[i],'cardBox':[x,y,cardw,cardh],'destinationBox':[ox,oy,displayed.width,displayed.height],'uniformScale':scale});metas.append(m)
    d.text((60,h-53),footer,font=font(16),fill=MUTED)
    return canvas.convert('RGB'), metas

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',default='preview/release');args=parser.parse_args()
    out=(ROOT/args.output).resolve()
    if not out.is_relative_to(ROOT): raise ValueError('Output must stay inside project')
    if not FONT.exists(): raise FileNotFoundError('Missing bundled tools/fonts/NotoSansCJKsc-Regular.otf')
    words,wm=report('v1.3.1/words');am=None
    wi={r['word']:r for r in words['screenshots']}
    if len(wi)!=53 or len([r for r in wi.values() if r['kind']=='expression'])!=25: raise ValueError('Expected current 53 words / 25 expressions')
    # Labels read from current vocabulary source; no duplicated semantic text.
    wordsrc=(ROOT/'runtime/words.js').read_text()
    names=dict(re.findall(r"(?:expression|motion)\('([^']+)',\s*'([^']+)'",wordsrc))
    picks=[('angle-front-0','正面 · 0°'),('angle-right-45','向右看 · 45°'),('angle-right-75','向右看 · 75°')]
    overview=[];ol=[];angle_state='awaiting final transparent release captures; direction cards omitted'
    af=ROOT/'docs/qa/v1.3.1/release'
    if (af/'report.json').exists() and all((af/(k+'-transparent.png')).exists() for k,_ in picks):
        angles,am=report('v1.3.1/release')
        def records(node):
            if isinstance(node,dict):
                if 'file' in node and 'sha256' in node: yield node
                for value in node.values(): yield from records(value)
            elif isinstance(node,list):
                for value in node: yield from records(value)
        available={Path(r['file']).name:r for r in records(angles)}
        for k,label in picks:
            filename=k+'-transparent.png'
            if filename not in available: raise RuntimeError('Final release report lacks PNG hash: '+filename)
            r=dict(available[filename]);r.update({'id':k,'file':filename,'requestedAngle':int(k.rsplit('-',1)[1])})
            overview.append(load_capture('v1.3.1/release',r));ol.append(label)
        angle_state='final transparent release captures'
    chosen=['happy','wink','cry','bashful','ear-wave','ear-fold','cuddle','stretch','celebrate']
    if not overview: chosen=['neutral','surprised','sleepy']+chosen
    for k in chosen:
        overview.append(load_capture('v1.3.1/words',wi[k]));ol.append(names[k])
    subtitle='三个方向，九种表情与动作瞬间。' if am else '十二种表情与动作瞬间。'
    card,cm=compose(overview,ol,3,480,474,'异色大耳帽兜 · v1.3.1',subtitle,'COOPANION  /  角色一览','实际运行截图 · 动作卡展示其中一帧')
    allitems=[load_capture('v1.3.1/words',wi[k]) for k in EXPRS]
    expression,em=compose(allitems,[names[k] for k in EXPRS],5,280,310,'25 种表情 · 大耳帽兜','从平静、开心到害羞、好奇；看看每一种小情绪。','COOPANION  /  表情对照','实际运行透明截图 · 单帧表情对照，完整切换以运行效果为准')
    rendered=[('character-overview.png',card,cm),('expression-gallery.png',expression,em)]
    if am:
        turning,tm=compose(overview[:3],ol[:3],3,480,474,'异色大耳帽兜 · v1.3.1','正面与两种侧向姿态。','COOPANION  /  方向预览','实际运行截图')
        rendered.append(('turning-preview.png',turning,tm))
    # Recheck inputs before publishing; a concurrent recapture must not silently
    # produce a contact sheet with mixed old/new PNGs or source reports.
    for meta in cm+em:
        if sha((ROOT/meta['source']).read_bytes())!=meta['sourceSHA256']:raise RuntimeError('Inputs changed during composition; rerun after capture completes')
    for meta in [m for m in [wm,am] if m]:
        if sha((ROOT/meta['file']).read_bytes())!=meta['sha256']:raise RuntimeError('Report changed during composition; rerun')
    if not am:
        # Do not leave an earlier direction banner beside a report that omits it.
        (out/'turning-preview.png').unlink(missing_ok=True)
    outputs=[]
    for filename,im,cells in rendered:
        b=pngbytes(im);p=out/filename;atomic(p,b);outputs.append({'file':relative(p),'sha256':sha(b),'size':list(im.size),'cards':cells})
    manifest={'schemaVersion':1,'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Technical layout of actual runtime PNGs. No character generation, painting, color adjustment or inferred animation/FPS acceptance. Transparent canvases exclude native outer SVG transforms and particles; opaque angle crops include actual stage shadow.','reports':{'words':wm,'angles':am},'angleState':angle_state,'font':{'file':relative(FONT),'sha256':sha(FONT.read_bytes()),'license':'tools/fonts/OFL.txt','sourceURL':'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf'},'outputs':outputs}
    atomic(out/'contact-sources.json',(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode())
    print(json.dumps({'status':'complete','outputs':[{'file':o['file'],'size':o['size'],'cards':len(o['cards'])} for o in outputs],'sourceReports':{'words':wm['sha256'],'angles':am['sha256'] if am else None}},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
