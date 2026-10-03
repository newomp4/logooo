// Signed-distance modelling. A shape is a function (x, y) → distance to its
// edge, negative inside. Smooth unions give filleted joins and smooth cuts give
// soft corners; the field is traced into a path with marching squares.
import { isoContour } from './geom.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// polynomial smooth min / max; k is roughly the fillet radius
function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
const smax = (a, b, k) => -smin(-a, -b, k);

// ---------------------------------------------------------------- shapes

export const circle = (r, cx = 0, cy = 0) => (x, y) => Math.hypot(x - cx, y - cy) - r;

// Ellipse with half-axes a, b (approximate distance, exact edge).
export function ellipse(a, b, cx = 0, cy = 0, rotDeg = 0) {
  const t = (-rotDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return (x, y) => {
    const px = (x - cx) * c - (y - cy) * s;
    const py = (x - cx) * s + (y - cy) * c;
    const k0 = Math.hypot(px / a, py / b);
    const k1 = Math.hypot(px / (a * a), py / (b * b));
    return k0 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1;
  };
}

// Stroke from a to b with round caps; r is half the stroke width.
export function capsule(ax, ay, bx, by, r) {
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey || 1e-9;
  return (x, y) => {
    const wx = x - ax;
    const wy = y - ay;
    const h = clamp((wx * ex + wy * ey) / len2, 0, 1);
    return Math.hypot(wx - ex * h, wy - ey * h) - r;
  };
}

// Stroke along a circular arc (center cx, cy, radius R) from angle a0 to a1 (radians, a0 < a1).
export function arc(cx, cy, R, a0, a1, r) {
  const mid = (a0 + a1) / 2;
  const half = (a1 - a0) / 2;
  const ends = [a0, a1].map((a) => [cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    let d = Math.atan2(dy, dx) - mid;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) <= half) return Math.abs(Math.hypot(dx, dy) - R) - r;
    return Math.min(...ends.map(([ex, ey]) => Math.hypot(x - ex, y - ey))) - r;
  };
}

// A stroke along a polyline [[x, y], ...] whose corners bend round arcs of
// radius `bend` instead of turning sharply; r is half the stroke width.
export function path(points, bend, r) {
  const parts = [];
  let start = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [vx, vy] = points[i];
    const [nx, ny] = points[i + 1];
    const d1 = norm(px - vx, py - vy);
    const d2 = norm(nx - vx, ny - vy);
    const alpha = Math.acos(clamp(d1[0] * d2[0] + d1[1] * d2[1], -1, 1));
    const t = Math.min(bend / Math.tan(alpha / 2), 0.45 * Math.hypot(px - vx, py - vy), 0.45 * Math.hypot(nx - vx, ny - vy));
    const rad = t * Math.tan(alpha / 2);
    const t1 = [vx + d1[0] * t, vy + d1[1] * t];
    const t2 = [vx + d2[0] * t, vy + d2[1] * t];
    parts.push(capsule(start[0], start[1], t1[0], t1[1], r));
    if (rad > 1e-6 && alpha < Math.PI - 1e-3) {
      const bis = norm(d1[0] + d2[0], d1[1] + d2[1]);
      const h = rad / Math.sin(alpha / 2);
      const c = [vx + bis[0] * h, vy + bis[1] * h];
      let a0 = Math.atan2(t1[1] - c[1], t1[0] - c[0]);
      let a1 = Math.atan2(t2[1] - c[1], t2[0] - c[0]);
      let sweep = a1 - a0;
      sweep = Math.atan2(Math.sin(sweep), Math.cos(sweep));
      if (sweep < 0) [a0, a1] = [a1, a0 - sweep];
      else a1 = a0 + sweep;
      parts.push(arc(c[0], c[1], rad, a0, a1, r));
    }
    start = t2;
  }
  const end = points[points.length - 1];
  parts.push(capsule(start[0], start[1], end[0], end[1], r));
  return union(...parts);
}

function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

// Exact distance to a closed polygon [[x, y], ...].
export function polygon(pts) {
  return (x, y) => {
    let d = Infinity;
    let sign = 1;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) {
      const [vix, viy] = pts[i];
      const [vjx, vjy] = pts[j];
      const ex = vjx - vix;
      const ey = vjy - viy;
      const wx = x - vix;
      const wy = y - viy;
      const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
      d = Math.min(d, (wx - ex * h) ** 2 + (wy - ey * h) ** 2);
      const c1 = y >= viy;
      const c2 = y < vjy;
      const c3 = ex * wy > ey * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sign = -sign;
    }
    return sign * Math.sqrt(d);
  };
}

// Box with half-sizes hw, hh and corner radius r.
export function roundBox(hw, hh, r = 0, cx = 0, cy = 0) {
  return (x, y) => {
    const qx = Math.abs(x - cx) - hw + r;
    const qy = Math.abs(y - cy) - hh + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
}

// Distance field of any paper.js path (holes included, even-odd).
export function shape(item) {
  const flat = item.clone({ insert: false });
  flat.flatten(0.15);
  const loops = (flat.children ?? [flat]).map((p) => p.segments.map((s) => [s.point.x, s.point.y]));
  const edges = [];
  for (const pts of loops) {
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) edges.push([pts[i][0], pts[i][1], pts[j][0], pts[j][1]]);
  }
  const { x: bx, y: by, width: bw, height: bh } = flat.bounds;
  return (x, y) => {
    // quick reject far outside the bounds
    const ox = Math.max(bx - x, 0, x - (bx + bw));
    const oy = Math.max(by - y, 0, y - (by + bh));
    if (ox > 6 || oy > 6) return Math.hypot(ox, oy);
    let d = Infinity;
    let inside = false;
    for (const [vix, viy, vjx, vjy] of edges) {
      const ex = vjx - vix;
      const ey = vjy - viy;
      const wx = x - vix;
      const wy = y - viy;
      const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1e-12), 0, 1);
      d = Math.min(d, (wx - ex * h) ** 2 + (wy - ey * h) ** 2);
      if ((viy > y) !== (vjy > y) && x < vix + ((y - viy) / (vjy - viy)) * (vjx - vix)) inside = !inside;
    }
    return (inside ? -1 : 1) * Math.sqrt(d);
  };
}

// Annulus between radii inner and outer.
export const annulus = (inner, outer) => (x, y) => Math.abs(Math.hypot(x, y) - (inner + outer) / 2) - (outer - inner) / 2;

// Wedge between angles a0 and a1 (radians, span < π), apex at the origin.
export function wedge(a0, a1) {
  const n0 = [Math.sin(a0), -Math.cos(a0)];
  const n1 = [-Math.sin(a1), Math.cos(a1)];
  return (x, y) => Math.max(x * n0[0] + y * n0[1], x * n1[0] + y * n1[1]);
}

// ------------------------------------------------------------ operations

export const union = (...fs) => (x, y) => {
  let d = Infinity;
  for (const f of fs) d = Math.min(d, f(x, y));
  return d;
};

// union with filleted joins
export const blend = (k, ...fs) => (x, y) => {
  let d = fs[0](x, y);
  for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y), k);
  return d;
};

export const cut = (a, b, k = 0) => (x, y) => smax(a(x, y), -b(x, y), k);
export const clip = (a, b, k = 0) => (x, y) => smax(a(x, y), b(x, y), k);
export const xor = (a, b) => (x, y) => {
  const p = a(x, y);
  const q = b(x, y);
  return Math.max(Math.min(p, q), -Math.max(p, q));
};
export const grow = (f, r) => (x, y) => f(x, y) - r;

// Moves and rotates a shape (rotation about the origin first, degrees).
export function move(f, dx = 0, dy = 0, rotDeg = 0) {
  const t = (-rotDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return (x, y) => {
    const px = x - dx;
    const py = y - dy;
    return f(px * c - py * s, px * s + py * c);
  };
}

// n copies around the origin; k > 0 melts neighbouring copies together.
export function spin(f, n, k = 0) {
  const copies = Array.from({ length: n }, (_, i) => move(f, 0, 0, (360 * i) / n));
  return k > 0 ? blend(k, ...copies) : union(...copies);
}

export const mirrorX = (f) => (x, y) => f(Math.abs(x), y);

// ---------------------------------------------------------------- tracing

// Shapes built here are symmetric by construction; tracing adds a little noise.
export const TRACED = { symTolerance: 0.025 };

// Finds the shape's extent on a coarse grid, then traces it finely.
export function trace(f, reach = 70) {
  const coarse = 64;
  let extent = 0;
  for (let j = 0; j <= coarse; j++) {
    for (let i = 0; i <= coarse; i++) {
      const x = -reach + (2 * reach * i) / coarse;
      const y = -reach + (2 * reach * j) / coarse;
      if (f(x, y) < 1) extent = Math.max(extent, Math.abs(x), Math.abs(y));
    }
  }
  if (!extent || extent >= reach) return null;
  const half = extent + 4;
  const res = Math.round(clamp((2 * half) / 0.32, 140, 300) / 2) * 2;
  return isoContour((x, y) => -f(x, y), half, res, 0);
}
