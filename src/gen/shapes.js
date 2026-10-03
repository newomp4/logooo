// Exact building blocks. Every outline here is made of straight lines, circular
// arcs and ellipses, combined with boolean ops; softness comes from filleting
// corners with tangent arcs, like Illustrator's live corners. Nothing is traced.
import { paper } from './geom.js';

const { Path, CompoundPath, Point, Segment } = paper;
const rad = (deg) => (deg * Math.PI) / 180;
const polarPt = (r, deg, cx = 0, cy = 0) => new Point(cx + Math.cos(rad(deg)) * r, cy + Math.sin(rad(deg)) * r);

// Straight stroke from a to b with round caps; r is half the width.
export function capsule(ax, ay, bx, by, r) {
  const len = Math.hypot(bx - ax, by - ay);
  const shape = new Path.Rectangle({ point: [-r, -r], size: [len + 2 * r, 2 * r], radius: r });
  shape.rotate((Math.atan2(by - ay, bx - ax) * 180) / Math.PI, new Point(0, 0));
  shape.translate(new Point(ax, ay));
  return shape;
}

// A stroke of half-width w along a polyline whose bends are rounded with
// arcs of the given radius (less where a run is too short for it), drawn as
// one exact outline: offset lines and concentric arcs, no overlapping parts to
// merge. Ends are round, or flat (for cuts that run off the shape anyway).
export function band(points, w, { radius = w * 1.5, round = true } = {}) {
  const P = points.map((p) => new Point(p));
  const n = P.length;
  const dir = (i) => P[i + 1].subtract(P[i]).normalize();
  const left = (d) => new Point(-d.y, d.x);
  // each bend: where the arc meets the runs either side, its centre and radius
  const bends = [];
  for (let i = 1; i < n - 1; i++) {
    const d1 = dir(i - 1);
    const d2 = dir(i);
    const turn = Math.acos(Math.max(-1, Math.min(1, d1.dot(d2))));
    if (turn < 1e-3) continue;
    const room = Math.min(P[i].getDistance(P[i - 1]), P[i].getDistance(P[i + 1])) / 2;
    const tl = Math.min(radius * Math.tan(turn / 2), room);
    const r = Math.max(tl / Math.tan(turn / 2), w * 1.05);
    const t = r * Math.tan(turn / 2);
    let side = left(d1);
    if (side.dot(d2) < 0) side = side.multiply(-1);
    const from = P[i].subtract(d1.multiply(t));
    bends.push({ i, from, to: P[i].add(d2.multiply(t)), centre: from.add(side.multiply(r)), r, corner: P[i] });
  }
  const path = new Path();
  // one side, then back along the other
  const walk = (sign) => {
    const order = sign > 0 ? bends : bends.slice().reverse();
    for (const b of order) {
      const dIn = sign > 0 ? dir(b.i - 1) : dir(b.i).multiply(-1);
      const dOut = sign > 0 ? dir(b.i) : dir(b.i - 1).multiply(-1);
      const a = sign > 0 ? b.from : b.to;
      const z = sign > 0 ? b.to : b.from;
      const start = a.add(left(dIn).multiply(w));
      const end = z.add(left(dOut).multiply(w));
      // this side runs inside the bend when its offset points at the centre
      const inner = left(dIn).dot(b.centre.subtract(a)) > 0;
      const mid = b.centre.add(b.corner.subtract(b.centre).normalize().multiply(b.r + (inner ? -w : w)));
      path.lineTo(start);
      path.arcTo(mid, end);
    }
  };
  const d0 = dir(0);
  const dn = dir(n - 2);
  path.moveTo(P[0].add(left(d0).multiply(w)));
  walk(1);
  path.lineTo(P[n - 1].add(left(dn).multiply(w)));
  if (round) path.arcTo(P[n - 1].add(dn.multiply(w)), P[n - 1].subtract(left(dn).multiply(w)));
  else path.lineTo(P[n - 1].subtract(left(dn).multiply(w)));
  walk(-1);
  path.lineTo(P[0].subtract(left(d0).multiply(w)));
  if (round) path.arcTo(P[0].subtract(d0.multiply(w)), P[0].add(left(d0).multiply(w)));
  path.closePath();
  return path;
}

// A stroke of half-width w along a circular arc of radius R round the
// origin, from angle a0 to a1 (degrees), with round ends: one exact outline.
export function arcBand(R, a0, a1, w) {
  const mid = (a0 + a1) / 2;
  const tangent = (deg) => new Point(-Math.sin(rad(deg)), Math.cos(rad(deg)));
  const path = new Path();
  path.moveTo(polarPt(R + w, a0));
  path.arcTo(polarPt(R + w, mid), polarPt(R + w, a1));
  path.arcTo(polarPt(R, a1).add(tangent(a1).multiply(w)), polarPt(R - w, a1));
  path.arcTo(polarPt(R - w, mid), polarPt(R - w, a0));
  path.arcTo(polarPt(R, a0).subtract(tangent(a0).multiply(w)), polarPt(R + w, a0));
  path.closePath();
  return path;
}

// Polygon from [[x, y], ...].
export function polygon(points) {
  return new Path({ segments: points, closed: true });
}

// Wedge from the origin between two angles (degrees, span ≤ 180), reaching r.
// `gap` pulls both sides in parallel, so neighbouring wedges sit gap apart.
export function wedge(a0, a1, r, gap = 0) {
  const span = rad(a1 - a0);
  // the two sides, each shifted inward by gap/2, meet at this distance along the bisector
  const apex = gap ? gap / 2 / Math.sin(span / 2) : 0;
  const bis = (a0 + a1) / 2;
  const origin = polarPt(apex, bis);
  const far = r * 3;
  const side = (a, inward) => {
    const n = polarPt(gap / 2, a + inward);
    return [polarPt(far, a).add(n), n];
  };
  const [p0] = side(a0, 90);
  const [p1] = side(a1, -90);
  return polygon([[origin.x, origin.y], [p0.x, p0.y], [polarPt(far * 1.5, bis).x, polarPt(far * 1.5, bis).y], [p1.x, p1.y]]);
}

// ----------------------------------------------------------- live corners

// Fillets every sharp corner of a path (or compound path) with a tangent arc
// of the given radius, between lines and curves alike. Smooth joins are left
// alone; the radius shrinks where the neighbouring edges are short.
export function roundCorners(item, radius, minAngle = 5) {
  if (!item || radius <= 0) return item;
  const paths = item.children ? item.children.slice() : [item];
  const rounded = paths.map((p) => roundPath(p, radius, minAngle)).filter(Boolean);
  return new CompoundPath({ children: rounded });
}

function roundPath(source, radius, minAngle) {
  const path = source.clone({ insert: false });
  path.reduce?.({});
  // booleans sometimes leave hair-thin edges where curves meet; a fillet can't
  // grow past them, so they'd leave a sharp corner behind: merge them away
  const tiny = Math.max(radius * 0.25, 0.02);
  for (let pass = 0; pass < 3; pass++) {
    for (const c of path.curves.slice()) {
      if (path.curves.length <= 3) break;
      if (c.length < tiny) {
        // the next curve keeps its own outgoing handle, so it isn't bent out of shape
        c.segment1.handleOut = c.segment2.handleOut;
        c.segment2.remove();
      }
    }
  }
  const curves = path.curves;
  const n = curves.length;
  if (n < 2) return path;

  const corners = new Array(n).fill(null);
  const trims = curves.map(() => [0, 0]);
  for (let i = 0; i < n; i++) {
    const prev = curves[(i - 1 + n) % n];
    const next = curves[i];
    const tin = prev.getTangentAtTime(1);
    const tout = next.getTangentAtTime(0);
    if (!tin || !tout || tin.isZero() || tout.isZero()) continue;
    const turn = Math.abs(tin.getDirectedAngle(tout));
    if (turn < minAngle || turn > 175) continue;
    const th = rad(turn);
    const t = Math.min(radius * Math.tan(th / 2), prev.length * 0.45, next.length * 0.45);
    if (t < 1e-3) continue;
    corners[i] = { t, th };
    trims[(i - 1 + n) % n][1] = t;
    trims[i][0] = t;
  }
  if (!corners.some(Boolean)) return path;

  const parts = curves.map((c, i) => {
    const [a, b] = trims[i];
    const from = a ? c.getTimeAt(a) : 0;
    const to = b ? c.getTimeAt(c.length - b) : 1;
    return c.getPart(from ?? 0, to ?? 1);
  });

  // handle length of a cubic standing in for a circular arc of turn th, radius r
  const filletHandle = ({ t, th }) => (4 / 3) * Math.tan(th / 4) * (t / Math.tan(th / 2));
  const segments = [];
  for (let i = 0; i < n; i++) {
    const part = parts[i];
    const corner = corners[i];
    if (corner) {
      const dir = part.getTangentAtTime(0).normalize();
      segments.push(new Segment(part.point1, dir.multiply(-filletHandle(corner)), part.handle1));
    } else if (segments.length) {
      segments[segments.length - 1].handleOut = part.handle1;
    } else {
      segments.push(new Segment(part.point1, null, part.handle1));
    }
    const nextCorner = corners[(i + 1) % n];
    const out = nextCorner ? part.getTangentAtTime(1).normalize().multiply(filletHandle(nextCorner)) : null;
    segments.push(new Segment(part.point2, part.handle2, out));
  }
  // close the loop: without a corner at 0 the first and last points coincide
  if (!corners[0]) {
    const last = segments.pop();
    segments[0].handleIn = last.handleIn;
  }
  return new Path({ segments, closed: true });
}
