#!/usr/bin/env node
// The model is injected by Coopanion. An opaque pack frame does not fetch JSON.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const [art, approved, ears, featureProfiles] = await Promise.all([
  readFile(resolve(root, 'pack/art-data.json'), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'runtime/approved-front.json'), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'runtime/approved-front-ears.json'), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'runtime/feature-profiles.json'), 'utf8').then(JSON.parse),
]);
const model = {
  format: 'maodou-painted-mesh', version: '1.3.1',
  coordinates: 'Coopanion logical units; x right, y down, feet at 256. Authored yaw +/-75 degrees.',
  view: [-150, -60, 406, 282], renderEdge: 640,
  headHeightScale: .965,
  outline: { width: 0.48, color: [0.51, 0.36, 0.42, 0.72] },
  art,
  featureProfiles,
  approvedFront: {
    source: approved.source,
    registration: approved.registration.preferredUniformModelRegistration,
    contour: approved.approvedFrontContour,
    ears,
    approvalScope: approved.approvalScope,
  },
  yawKeys: [0, 0.6, 1],
  head: { front: [54, 22, 148, 142], threeQuarter: [52, 23, 153, 141], side: [54, 24, 143, 140] },
  torso: { front: [83, 155, 90, 87], threeQuarter: [85, 155, 88, 87], side: [96, 155, 72, 87] },
  schemes: ['gentle', 'lively'],
  provenance: {
    acceptedFront: 'front-master-02; selected by the user, 2026-10-20',
    headSkinRole: 'AI-painted color/UV source only. Front geometry is registered to the accepted front contour.',
    sourceArt: 'GPT image generation with official character image references; independently generated layers.',
    rig: 'Original painted mesh and silhouette-mask rig. This is not a Cubism moc3/cmo3 file.',
    nativeHostCommit: '04ce022a8c1e96e6053d9cbbe8f6dc555aa93f33',
  },
};
for (const id of ['head.front','head.threeQuarter','head.side','ear.front','ear.outer','torso.front','eye.open','mouth.smile']) {
  if (!art.sprites[id]?.contour && !art.sprites[id]?.uvRect) throw new Error('Missing actual art: ' + id);
}
await writeFile(resolve(root, 'pack/model.json'), JSON.stringify(model) + '\n');
console.log(JSON.stringify({ model: 'pack/model.json', sprites: Object.keys(art.sprites).length, frontSource: approved.source.sha256 }));
