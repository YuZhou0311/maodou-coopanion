#!/usr/bin/env python3
"""Rebuild the offline UI font from the bundled OFL Noto source. No network.
Requires fontTools; Brotli comes from its Python extension or local Node zlib.
Reads only the listed UI inputs.
"""
from pathlib import Path
import hashlib, io, json, re, shutil, subprocess
from fontTools import subset
from fontTools.ttLib import TTFont, woff2

# This environment has Node's native Brotli but no Python Brotli extension.
# Use the same standard Brotli stream through Node; fontTools still constructs
# and validates the WOFF2 table transforms. No install or network is required.
if not woff2.haveBrotli:
    class NodeBrotli:
        MODE_FONT=2;MODE_TEXT=1
        @staticmethod
        def compress(data, mode=0):
            code="const z=require('node:zlib');const fs=require('node:fs');process.stdout.write(z.brotliCompressSync(fs.readFileSync(0),{params:{[z.constants.BROTLI_PARAM_MODE]:Number(process.argv[1])}}));"
            return subprocess.run([shutil.which('node') or 'node','-e',code,str(mode)],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True).stdout
        @staticmethod
        def decompress(data):
            code="const z=require('node:zlib');const fs=require('node:fs');process.stdout.write(z.brotliDecompressSync(fs.readFileSync(0)));"
            return subprocess.run([shutil.which('node') or 'node','-e',code],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True).stdout
    woff2.brotli=NodeBrotli;woff2.haveBrotli=True

ROOT=Path(__file__).resolve().parents[1]
INPUTS=['preview-host/standalone.html','preview-host/standalone-app.js','preview-host/app.js','pack/figure.json']
FONT=ROOT/'tools/fonts/NotoSansCJKsc-Regular.otf'
OUTPUT=ROOT/'tools/fonts/MaodouPreviewUI.woff2'
def sha(b):return hashlib.sha256(b).hexdigest()
def atomic(p,b):
    t=p.with_name(p.name+'.tmp');t.write_bytes(b);t.replace(p)
def main():
    chars=set(chr(c) for c in range(32,127))
    # Common UI punctuation, currency and degree/arrow symbols.
    chars.update(' \u00a0。，“”‘’！？：；、（）【】《》〈〉…—–·•×÷±°←↑→↓↔￥¥€£©®™✓✕')
    sources=[]
    for rel in INPUTS:
        raw=(ROOT/rel).read_bytes(); text=raw.decode('utf-8'); chars.update(text)
        # Also include literal Unicode escapes in JS/JSON strings.
        chars.update(chr(int(m,16)) for m in re.findall(r'\\u([0-9a-fA-F]{4})',text))
        chars.update(chr(int(m,16)) for m in re.findall(r'\\u\{([0-9a-fA-F]{1,6})\}',text))
        sources.append({'file':rel,'sha256':sha(raw)})
    source_bytes=FONT.read_bytes(); font=TTFont(io.BytesIO(source_bytes),recalcTimestamp=False)
    available=font.getBestCmap(); wanted={ord(c) for c in chars if c.isprintable()};supported=wanted & set(available)
    options=subset.Options();options.hinting=False;options.layout_features=['*'];options.name_IDs=['*'];options.name_languages=['*'];options.name_legacy=True
    worker=subset.Subsetter(options=options);worker.populate(unicodes=supported);worker.subset(font)
    names={1:'Maodou Preview UI',2:'Regular',3:'MaodouPreviewUI-Regular-Subset-1',4:'Maodou Preview UI Regular',6:'MaodouPreviewUI-Regular',16:'Maodou Preview UI',17:'Regular'}
    for rec in font['name'].names:
        if rec.nameID in names:rec.string=names[rec.nameID].encode(rec.getEncoding(),errors='replace')
    if 'CFF ' in font:
        cff=font['CFF '].cff;cff.fontNames=['MaodouPreviewUI-Regular'];top=cff.topDictIndex[0];top.FullName=names[4];top.FamilyName=names[1]
    font.flavor='woff2';buf=io.BytesIO();font.save(buf);out=buf.getvalue()
    check=TTFont(io.BytesIO(out)); cmap=check.getBestCmap()
    if not supported.issubset(cmap):raise RuntimeError('Subset lost requested source-supported characters')
    for s in sources:
        if sha((ROOT/s['file']).read_bytes())!=s['sha256']:raise RuntimeError('UI input changed during build; rerun')
    atomic(OUTPUT,out)
    report={'status':'complete','font':str(OUTPUT.relative_to(ROOT)),'sha256':sha(out),'bytes':len(out),'requestedPrintableCharacters':len(wanted),'includedCharacters':len(supported),'sourceUnsupportedCharacters':''.join(chr(c) for c in sorted(wanted-set(available))),'sourceFont':{'file':str(FONT.relative_to(ROOT)),'sha256':sha(source_bytes)},'license':'tools/fonts/OFL.txt','family':'Maodou Preview UI','inputs':sources,'validation':'Decoded generated WOFF2 and verified every source-supported requested character is retained.'}
    atomic(OUTPUT.with_suffix('.json'),(json.dumps(report,ensure_ascii=False,indent=2)+'\n').encode())
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
