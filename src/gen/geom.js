// Geometry kernel: primitives, symmetry groups, boolean ops and the final
// clean-up pass that turns a paper.js item into a normalized SVG path.
import paper from 'paper/dist/paper-core.js';
import { detailScore, signature as silhouette, offCenter, detectSymmetry, tooPlain, looksOff, solidity, forbidden, fineShare, spikes, dents, sharpCorners, widestGap } from './legibility.js';

paper.setup(new paper.Size(1, 1));
paper.settings.insertItems = false;

const { Path, CompoundPath, Matrix, Point, Segment } = paper;
export { paper, Path, Point };

export const K = 0.5522847498; // cubic handle ratio for a quarter circle
export const ORIGIN = new Point(0, 0);

// ---------------------------------------------------------------- primitives

export function circle(x, y, r) {
  return new Path.Circle({ center: [x, y], radius: r });
}

export function ellipse(x, y, rx, ry, rotate = 0) {
  const e = new Path.Ellipse({ center: [x, y], radius: [rx, ry] });
  if (rotate) e.rotate(rotate, new Point(x, y));
  return e;
}

export function rect(x, y, w, h, radius = 0) {
  return new Path.Rectangle({ point: [x - w / 2, y - h / 2], size: [w, h], radius });
}

// Four-node shape centered on the origin.
// bulge > 0 bows outward (K ≈ ellipse, → 1 squircle), 0 is a diamond,
// bulge < 0 pinches inward into a four-point spark.
export function quad(rx, ry, bulge = K) {
  const segments = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([ox, oy]) => {
    const point = [ox * rx, oy * ry];
    if (bulge >= 0) {
      const len = bulge * (ox ? ry : rx);
      const out = [-oy * len, ox * len];
      return new Segment(point, [-out[0], -out[1]], out);
    }
    const h = Math.min(-bulge, 1);
    const toward = [-ox * rx * h, -oy * ry * h];
    return new Segment(point, toward, toward);
  });
  return new Path({ segments, closed: true });
}

// Moves, rotates (about the item's own origin) and returns the item.
export function place(item, x = 0, y = 0, rotate = 0) {
  if (rotate) item.rotate(rotate, ORIGIN);
  if (x || y) item.translate(new Point(x, y));
  return item;
}

export function shear(item, k) {
  item.transform(new Matrix(1, 0, k, 1, 0, 0));
  return item;
}

// Pointed almond from (0,0) to (length,0).
export function leaf(length, width) {
  const a = length * 0.28;
  const b = width / 2 / 0.75;
  return new Path({
    closed: true,
    segments: [new Segment([0, 0], [a, b], [a, -b]), new Segment([length, 0], [-a, -b], [-a, b])],
  });
}

// Teardrop with its point at the origin and a round end of radius r on +x.
export function drop(length, r) {
  const c = length - r;
  const t = Math.sqrt(c * c - r * r);
  const a = Math.asin(r / c);
  const p = new Path();
  p.moveTo(new Point(0, 0));
  p.lineTo(new Point(t * Math.cos(a), -t * Math.sin(a)));
  p.arcTo(new Point(length, 0), new Point(t * Math.cos(a), t * Math.sin(a)));
  p.closePath();
  return p;
}

// Star polygon points: n tips at radius r, n valleys at radius inner.
export function starPoints(n, r, inner, offsetDeg = 0) {
  return Array.from({ length: n * 2 }, (_, i) => {
    const a = ((offsetDeg - 90 + (180 * i) / n) * Math.PI) / 180;
    const d = i % 2 ? inner : r;
    return [Math.cos(a) * d, Math.sin(a) * d];
  });
}

// Polygon with circular fillets; `radius` may be a function of the corner index.
export function roundedPolygon(points, radius) {
  const radiusAt = typeof radius === 'function' ? radius : () => radius;
  const segments = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const v = new Point(points[i]);
    const e1 = new Point(points[(i - 1 + n) % n]).subtract(v);
    const e2 = new Point(points[(i + 1) % n]).subtract(v);
    const d1 = e1.normalize();
    const d2 = e2.normalize();
    const alpha = Math.acos(Math.max(-1, Math.min(1, d1.dot(d2))));
    let r = radiusAt(i);
    let t = r / Math.tan(alpha / 2);
    const tMax = 0.5 * Math.min(e1.length, e2.length);
    if (t > tMax) {
      t = tMax;
      r = t * Math.tan(alpha / 2);
    }
    if (r < 1e-6) {
      segments.push(new Segment(v));
      continue;
    }
    const h = (4 / 3) * Math.tan((Math.PI - alpha) / 4) * r;
    segments.push(new Segment(v.add(d1.multiply(t)), [0, 0], d1.multiply(-h)));
    segments.push(new Segment(v.add(d2.multiply(t)), d2.multiply(-h), [0, 0]));
  }
  return new Path({ segments, closed: true });
}

// Smooth closed curve r(θ) = r·(1 + Σ amp·cos(k·n·θ + phase)) with n-fold symmetry.
// harmonics: [[k, amp, phase], ...]; zero phases keep it mirror-symmetric too.
export function polar(r, n, harmonics, perSector = 8) {
  const count = n * perSector;
  const segments = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count - Math.PI / 2;
    const t = a + Math.PI / 2;
    let f = 1;
    for (const [k, amp, phase = 0] of harmonics) f += amp * Math.cos(k * n * t + phase);
    segments.push(new Point(Math.cos(a) * r * f, Math.sin(a) * r * f));
  }
  const path = new Path({ segments, closed: true });
  path.smooth({ type: 'catmull-rom', factor: 0.5 });
  return path;
}

// --------------------------------------------------------------- layouts

// n×n grid points centered on the origin.
export function grid(nx, ny = nx, sx = 1, sy = sx) {
  const pts = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      pts.push([(i - (nx - 1) / 2) * sx, (j - (ny - 1) / 2) * sy]);
    }
  }
  return pts;
}

// n points on a circle of radius r, starting at the top.
export function ring(n, r, offsetDeg = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((offsetDeg - 90 + (360 * i) / n) * Math.PI) / 180;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}

// ---------------------------------------------------------------- symmetry

// Cn (rotations) or Dn (rotations + mirrors) as a list of matrices.
export function group(n, mirror) {
  const mats = [];
  for (let i = 0; i < n; i++) {
    mats.push(new Matrix().rotate((360 * i) / n, ORIGIN));
  }
  if (mirror) {
    for (let i = 0; i < n; i++) {
      mats.push(new Matrix().rotate((360 * i) / n, ORIGIN).scale(-1, 1, ORIGIN));
    }
  }
  return mats;
}

function signature(item) {
  const paths = item.children ?? [item];
  return paths
    .flatMap((p) => p.segments.map((s) => `${Math.round(s.point.x * 1000)},${Math.round(s.point.y * 1000)}`))
    .sort()
    .join(' ');
}

// Copies of `shape` under every matrix, with coincident copies removed
// (duplicates would cancel each other out under XOR).
export function orbit(shape, mats) {
  const out = [];
  const seen = new Set();
  for (const m of mats) {
    const copy = shape.clone({ insert: false });
    copy.transform(m);
    const sig = signature(copy);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(copy);
  }
  return out;
}

// ---------------------------------------------------------------- booleans

function fold(items, op) {
  let list = items.flat(Infinity).filter(Boolean);
  if (!list.length) return null;
  // balanced pairing keeps intermediate shapes small and the ops stable
  while (list.length > 1) {
    const next = [];
    for (let i = 0; i < list.length; i += 2) {
      next.push(i + 1 < list.length ? list[i][op](list[i + 1], { insert: false }) : list[i]);
    }
    list = next;
  }
  return list[0];
}

export const unite = (...items) => fold(items, 'unite');
export const xor = (...items) => fold(items, 'exclude');

export function subtract(base, ...cutters) {
  const cut = unite(cutters);
  return base && cut ? base.subtract(cut, { insert: false }) : base;
}

export function intersect(a, b) {
  return a.intersect(b, { insert: false });
}

// ---------------------------------------------------------------- measuring

function samples(item, count) {
  const paths = item.children ?? [item];
  const total = paths.reduce((sum, p) => sum + p.length, 0);
  const pts = [];
  for (const p of paths) {
    const n = Math.max(12, Math.round((count * p.length) / total));
    for (let i = 0; i < n; i++) {
      const { x, y } = p.getPointAt((p.length * i) / n);
      pts.push(x, y);
    }
  }
  return pts;
}

// Smallest distance between two sampled outlines, with `a` scaled about the origin.
function minDistance(a, b, scale = 1) {
  let min = Infinity;
  for (let i = 0; i < a.length; i += 2) {
    const x = a[i] * scale;
    const y = a[i + 1] * scale;
    for (let j = 0; j < b.length; j += 2) {
      const d = (x - b[j]) ** 2 + (y - b[j + 1]) ** 2;
      if (d < min) min = d;
    }
  }
  return Math.sqrt(min);
}

// Smallest distance between the outlines of `a` and `b`.
export function clearance(a, b) {
  return minDistance(samples(a, 64), samples(b, 192));
}

// Distance from the origin to the closest point of an outline.
export function reach(item) {
  const q = item.getNearestPoint(ORIGIN);
  return q ? q.getLength() : 0;
}

// Largest scale of `template` (centered on the origin) that keeps `gap`
// clear of `container`'s outline.
export function fitInside(container, template, gap, maxScale = 1) {
  const inner = samples(template, 64);
  const outer = samples(container, 240);
  const probe = template.getPointAt(0);
  let lo = 0;
  let hi = maxScale;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (container.contains(probe.multiply(mid)) && minDistance(inner, outer, mid) >= gap) lo = mid;
    else hi = mid;
  }
  if (lo < 0.02) return null;
  const t = template.clone({ insert: false });
  t.scale(lo, ORIGIN);
  return t;
}

// ---------------------------------------------------------------- grids

// Traces the outline of filled cells on an n×n grid into path data,
// optionally rounding every corner by `round` (in cell units, ≤ 0.5).
export function gridOutline(filled, n, cell, round = 0) {
  const edges = new Map();
  const add = (x1, y1, x2, y2) => {
    const key = `${x1},${y1}`;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push([x2, y2]);
  };
  const on = (i, j) => i >= 0 && j >= 0 && i < n && j < n && filled(i, j);

  // directed edges keep the filled side on the right
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (!on(i, j)) continue;
      if (!on(i, j - 1)) add(i, j, i + 1, j);
      if (!on(i + 1, j)) add(i + 1, j, i + 1, j + 1);
      if (!on(i, j + 1)) add(i + 1, j + 1, i, j + 1);
      if (!on(i - 1, j)) add(i, j + 1, i, j);
    }
  }

  const loops = [];
  for (const startKey of edges.keys()) {
    while (edges.get(startKey).length) {
      const [sx, sy] = startKey.split(',').map(Number);
      const loop = [[sx, sy]];
      let [x, y] = [sx, sy];
      let dir = null;
      for (let guard = 0; guard < 4 * n * n + 8; guard++) {
        const out = edges.get(`${x},${y}`);
        if (!out?.length) break;
        let pick = 0;
        if (dir && out.length > 1) {
          // at pinch points prefer the right turn so touching regions stay separate
          let best = Infinity;
          out.forEach(([x2, y2], idx) => {
            const cross = dir[0] * (y2 - y) - dir[1] * (x2 - x);
            const score = cross > 0 ? 0 : cross === 0 ? 1 : 2;
            if (score < best) [best, pick] = [score, idx];
          });
        }
        const [nx, ny] = out.splice(pick, 1)[0];
        dir = [nx - x, ny - y];
        [x, y] = [nx, ny];
        if (x === sx && y === sy) break;
        loop.push([x, y]);
      }
      loops.push(loop);
    }
  }

  const offset = n / 2;
  const P = ([x, y]) => [(x - offset) * cell, (y - offset) * cell];
  const fmt = ([x, y]) => `${+x.toFixed(4)},${+y.toFixed(4)}`;
  let d = '';

  for (const raw of loops) {
    // drop collinear points
    const pts = raw.filter((p, i) => {
      const a = raw[(i - 1 + raw.length) % raw.length];
      const b = raw[(i + 1) % raw.length];
      return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
    });
    if (pts.length < 3) continue;
    if (!round) {
      d += `M${pts.map((p) => fmt(P(p))).join('L')}Z`;
      continue;
    }
    const corner = (i) => {
      const v = pts[i];
      const u = pts[(i - 1 + pts.length) % pts.length];
      const w = pts[(i + 1) % pts.length];
      const toward = (a) => {
        const len = Math.hypot(a[0] - v[0], a[1] - v[1]);
        return [v[0] + ((a[0] - v[0]) / len) * round, v[1] + ((a[1] - v[1]) / len) * round];
      };
      const p1 = toward(u);
      const p2 = toward(w);
      const h1 = [p1[0] + (v[0] - p1[0]) * K, p1[1] + (v[1] - p1[1]) * K];
      const h2 = [p2[0] + (v[0] - p2[0]) * K, p2[1] + (v[1] - p2[1]) * K];
      return { p1, p2, h1, h2 };
    };
    const cs = pts.map((_, i) => corner(i));
    d += `M${fmt(P(cs[0].p2))}`;
    for (let i = 1; i <= cs.length; i++) {
      const c = cs[i % cs.length];
      d += `L${fmt(P(c.p1))}C${fmt(P(c.h1))} ${fmt(P(c.h2))} ${fmt(P(c.p2))}`;
    }
    d += 'Z';
  }
  return d ? new CompoundPath(d) : null;
}

export function compound(items) {
  const list = items.filter(Boolean);
  return list.length ? new CompoundPath({ children: list.flatMap((it) => (it.children ? it.removeChildren() : [it])) }) : null;
}

// ---------------------------------------------------------------- finalize

const SIZE = 100;

// Boolean ops occasionally drop or mangle a piece; a mark that no longer
// matches its own symmetry is thrown away. `symmetry` is like 'D4' or 'C2',
// `axis` tilts the mirror line (degrees from vertical).
function isSymmetric(shape, { label, axis = 0 }, tolerance = 0.01) {
  const [, kind, order] = /^([CD])(\d+)$/.exec(label) ?? [];
  if (!kind) return true;
  const c = shape.bounds.center;
  const checks = [];
  if (+order > 1) checks.push(new Matrix().rotate(360 / +order, c));
  if (kind === 'D') checks.push(new Matrix().rotate(axis, c).scale(-1, 1, c).rotate(-axis, c));
  if (!checks.length) return true;
  const { x, y, width, height } = shape.bounds;
  const N = 28;
  let bad = 0;
  let total = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const p = new Point(x + ((i + 0.5) * width) / N, y + ((j + 0.5) * height) / N);
      const inside = shape.contains(p);
      for (const m of checks) {
        total++;
        if (shape.contains(m.transform(p)) !== inside) bad++;
      }
    }
  }
  return bad / total < tolerance;
}

function fit(item) {
  const b = item.bounds;
  const s = SIZE / Math.max(b.width, b.height);
  item.transform(new Matrix().scale(s).translate(-b.x, -b.y));
}

// Normalizes the mark to a 100-unit box, strips dust and rejects shapes
// with slivers or an unbalanced amount of ink.
export function finalize(
  item,
  {
    minFill = 0.16,
    maxFill = 0.86,
    minFeature = 1.15,
    minPart = 30,
    minNodes = 5,
    maxDetail = 0.2,
    tips = 1,
    freePieces = 5,
    balance,
    symTolerance = 0.01,
    minAspect = 0.28,
    maxNodes = 170,
    maxFine = 0.02,
    maxSpikes = Infinity,
    smooth = false,
    maxGap = 0.2,
    loose = false,
  } = {},
  symmetry,
) {
  if (!item || item.isEmpty()) return null;
  let shape = item instanceof CompoundPath ? item : new CompoundPath({ children: [item] });
  shape.reorient(false, true);
  if (shape.isEmpty() || shape.bounds.width < 1e-6 || shape.bounds.height < 1e-6) return null;
  fit(shape);

  // remove specks and zero-length curves, then refit if the bounds moved
  let removed = false;
  for (const child of shape.children.slice()) {
    if (Math.abs(child.area) < 5) {
      child.remove();
      removed = true;
    }
  }
  if (!shape.children.length) return null;
  if (removed) {
    shape.reorient(false, true);
    fit(shape);
  }

  for (const child of shape.children) {
    child.reduce?.({ simplify: true });
    const area = Math.abs(child.area);
    if (area < minPart || (2 * area) / child.length < minFeature) return null;
  }
  // 'auto' means the family doesn't promise a symmetry: measure it instead
  let label = symmetry?.label;
  if (label === 'auto') {
    label = detectSymmetry(shape);
    if (label === 'C1' && !loose) return null;
    if (label === 'C1' && offCenter(shape) > (balance ?? 0.07)) return null;
  } else if (symmetry && !isSymmetric(shape, symmetry, symTolerance)) return null;
  if (tooPlain(shape) || looksOff(shape) || forbidden(shape)) return null;
  // knobs, hooks and tails: small protrusions off a bigger body
  if (fineShare(shape) > maxFine) return null;
  const points = spikes(shape);
  if (points > maxSpikes) return null;
  // fully rounded marks shouldn't keep any sharp corner
  if (smooth && sharpCorners(shape) > 0) return null;
  // pieces that drift apart stop reading as one mark
  if (widestGap(shape) > maxGap) return null;

  const { width, height } = shape.bounds;
  const area = Math.abs(shape.area);
  const fill = area / (width * height);
  if (fill < minFill || fill > maxFill) return null;
  // very flat overall marks read poorly as icons
  if (Math.min(width, height) < minAspect * 100) return null;
  // a lone disc, square or diamond isn't a mark
  const nodes = shape.children.reduce((sum, c) => sum + c.segments.length, 0);
  if (nodes < minNodes || nodes > maxNodes) return null;
  if (shape.children.length === 1 && (Math.abs(fill - Math.PI / 4) < 0.012 || fill > 0.97)) return null;

  // asymmetric marks still need their visual weight near the middle
  if (balance && offCenter(shape) > balance) return null;

  // too much fine detail to read as a logo at icon size
  const detail = detailScore(shape, { tips, freePieces });
  if (detail > maxDetail) return null;

  return {
    d: shape.getPathData(null, 2),
    width: +width.toFixed(2),
    height: +height.toFixed(2),
    fill: +fill.toFixed(3),
    parts: shape.children.length,
    detail: +detail.toFixed(3),
    sig: silhouette(shape),
    symmetry: label,
    solidity: +solidity(shape).toFixed(3),
    nodes,
    spikes: points,
    dents: dents(shape),
  };
}
