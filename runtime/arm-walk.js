/**
 * Sagittal walking projection of an existing painted arm.
 * Inputs and outputs are model-space positions before the shared body pose.
 * The old gesture drawing remains the blend's zero endpoint. No new artwork
 * or outline is generated; original UVs and cross-section colours survive.
 */
export function walkingArmPoint({ x, y, v, edge, rootEdge, box, pivot, angle, blend }) {
  const weight = Math.max(0, Math.min(1, blend ?? 0));
  const a = angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const restX = pivot[0]+(x-pivot[0])*c-(y-pivot[1])*s;
  const restY = pivot[1]+(x-pivot[0])*s+(y-pivot[1])*c;
  if (!weight) return [restX,restY];
  const shoulderX = box[0]+(rootEdge[0]+rootEdge[1])*.5*box[2], shoulderY=box[1];
  const rowCenter = box[0] + (edge[0]+edge[1])*.5*box[2];
  // The atlas cut is diagonally laid out. Re-centre each painted cross-section
  // on the shoulder's downward axis before the pendulum rotation. This is what
  // distinguishes a forward/backward stride from mirrored lateral arm lifts.
  const dx=(x-rowCenter)*.78,dy=v*box[3];
  const hangX=shoulderX+dx*c-dy*s,hangY=shoulderY+dx*s+dy*c;
  return [restX+(hangX-restX)*weight,restY+(hangY-restY)*weight];
}
