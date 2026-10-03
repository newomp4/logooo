// Exact building blocks. Every outline here is made of straight lines, circular
// arcs and ellipses, combined with boolean ops; softness comes from filleting
// corners with tangent arcs, like Illustrator's live corners. Nothing is traced.
import { paper, circle, unite } from './geom.js';

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

// A stroke along a polyline, with round joins and caps.
export function polyStroke(points, r) {
  const parts = [];
  for (let i = 1; i < points.length; i++) parts.push(capsule(...points[i - 1], ...points[i], r));
  return unite(parts);
}

// A stroke along a circular arc (degrees, a0 < a1, span < 360) with round caps.
export function arcStroke(cx, cy, R, a0, a1, r) {
  const mid = (a0 + a1) / 2;
  const band = new Path();
  band.moveTo(polarPt(R + r, a0, cx, cy));
  band.arcTo(polarPt(R + r, mid, cx, cy), polarPt(R + r, a1, cx, cy));
  band.lineTo(polarPt(R - r, a1, cx, cy));
  band.arcTo(polarPt(R - r, mid, cx, cy), polarPt(R - r, a0, cx, cy));
  band.closePath();
  const ends = [a0, a1].map((a) => {
    const p = polarPt(R, a, cx, cy);
    return circle(p.x, p.y, r);
  });
  return unite(band, ...ends);
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
      if (c.length < tiny) c.segment2.remove();
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
