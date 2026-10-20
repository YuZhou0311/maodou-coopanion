import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as kit from './vendor/coopanion/web/kit/body.js';
import { CUSTOM_WORDS, CORE_EXPRESSIONS, CORE_MOTIONS, VOCAB, PERSONALITY_AXES, VOCABULARY_STATUS } from '../runtime/words.js';
import { projectRoot, hostRoot, hashFile, atomicWrite } from './pack-tools.mjs';

const checks = [];
function check(name, fn) { try { const details = fn(); checks.push({ name, passed: true, ...(details ? { details } : {}) }); } catch (e) { checks.push({ name, passed: false, error: String(e.stack || e) }); } }
const manifest = JSON.parse(await readFile(resolve(projectRoot, 'pack/figure.json'), 'utf8'));
check('Core ids exactly match the fixed native kit', () => { assert.deepEqual(CORE_EXPRESSIONS, kit.KIT_EXPRESSIONS); assert.deepEqual(CORE_MOTIONS, kit.KIT_MOTIONS); });
check('53 unique native-grammar ids and labels describe 25 expressions and 28 motions', () => {
  const names = new Set();
  for (const w of VOCAB) {
    assert.match(w.id, /^[a-z0-9][a-z0-9-]{0,31}$/);
    for (const n of [w.id, ...Object.values(w.names).flat()]) { assert.equal(names.has(n), false, `duplicate name ${n}`); names.add(n); }
  }
  assert.equal(VOCAB.length, 53); assert.equal(VOCAB.filter(w => w.kind === 'expression').length, 25); assert.equal(VOCAB.filter(w => w.kind === 'motion').length, 28);
});
check('The production manifest matches registration and personality axes', () => { assert.deepEqual(manifest.vocab, VOCAB); assert.deepEqual(manifest.axes, PERSONALITY_AXES); });
check('Native createPet accepts each custom word with its own face or gesture id', () => {
  const output = [];
  for (const [id, def] of Object.entries(CUSTOM_WORDS)) {
    let frame;
    const el = () => ({ setAttribute() {}, set innerHTML(_) {} });
    const ctl = kit.createPet({ petG: el(), shadowEl: el(), fxG: el() }, {
      bounds: () => ({ W: 600, H: 400, S: .6, floorY: 350 }), roam: 'off', words: CUSTOM_WORDS,
      sfx: { play() {} }, figure: { draw(_g, _f, value) { frame = value; } },
    });
    assert.equal(ctl.doWord(id), true); ctl.step(.01); ctl.render();
    if (def.motion) { assert.equal(frame.gesture.kind, id); assert.equal(ctl.pet.pulse.dur, def.motion.seconds); }
    else { assert.ok(kit.FACES[def.expression.like]); assert.equal(frame.face, id); }
    output.push({ id, kind: def.motion ? 'motion' : 'expression', frameId: def.motion ? frame.gesture.kind : frame.face });
  }
  return { words: output, characterDrawingTested: false };
});
check('Registration explicitly carries no visual pass claim', () => { assert.equal(VOCABULARY_STATUS.registrationOnly, true); assert.equal(VOCABULARY_STATUS.visualValidationClaimed, false); });
const sourceHashes = {};
for (const p of ['runtime/words.js', 'pack/figure.json', 'preview-host/vendor/coopanion/web/kit/body.js', 'preview-host/words-contract.mjs']) sourceHashes[p] = await hashFile(resolve(projectRoot, p));
const report = { checkedAt: new Date().toISOString(), passed: checks.every(c => c.passed), scope: 'Registration and real native CPU dispatch only. No character geometry, browser, artwork, distinct visible expressions or animation smoothness was tested.', sourceHashes, checks };
const path = resolve(hostRoot, 'qa/words-contract.json'); await atomicWrite(path, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, checks: checks.length, failed: checks.filter(c => !c.passed), report: path }));
if (!report.passed) process.exitCode = 1;
