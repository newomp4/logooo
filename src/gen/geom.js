// Geometry kernel: primitives, layouts, boolean ops and the final
// clean-up pass that turns a paper.js item into a normalized SVG path.
import paper from 'paper/dist/paper-core.js';
import { detailScore, signature as silhouette, offCenter, detectSymmetry, tooPlain, looksOff, solidity, forbidden, fineShare, spikes, dents, sharpCorners, widestGap, seams } from './legibility.js';

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
  const probe = (template.children?.[0] ?? template).getPointAt(0);
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

// Why the last finalize() call turned a shape down (for the debug sheets).
export let lastReject = '';
const reject = (why) => {
  lastReject = why;
  return null;
};

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
  if (!item || item.isEmpty()) return reject('empty');
  let shape = item instanceof CompoundPath ? item : new CompoundPath({ children: [item] });
  shape.reorient(false, true);
  if (shape.isEmpty() || shape.bounds.width < 1e-6 || shape.bounds.height < 1e-6) return reject('empty');
  fit(shape);

  // remove specks and zero-length curves, then refit if the bounds moved
  let removed = false;
  for (const child of shape.children.slice()) {
    if (Math.abs(child.area) < 5) {
      child.remove();
      removed = true;
    }
  }
  if (!shape.children.length) return reject('empty');
  if (removed) {
    shape.reorient(false, true);
    fit(shape);
  }

  for (const child of shape.children) {
    child.reduce?.({ simplify: true });
    const area = Math.abs(child.area);
    if (area < minPart || (2 * area) / child.length < minFeature) return reject('sliver');
  }
  // 'auto' means the family doesn't promise a symmetry: measure it instead
  let label = symmetry?.label;
  if (label === 'auto') {
    label = detectSymmetry(shape);
    if (label === 'C1' && !loose) return reject('asymmetric');
    if (label === 'C1' && offCenter(shape) > (balance ?? 0.07)) return reject('unbalanced');
  } else if (symmetry && !isSymmetric(shape, symmetry, symTolerance)) return reject('asymmetric');
  if (tooPlain(shape)) return reject('plain');
  if (looksOff(shape)) return reject('off');
  if (forbidden(shape, label)) return reject('forbidden');
  // knobs, hooks and tails: small protrusions off a bigger body
  if (fineShare(shape) > maxFine) return reject('fine');
  const points = spikes(shape);
  if (points > maxSpikes) return reject('spikes');
  // fully rounded marks shouldn't keep any sharp corner, or seam bumps
  if (smooth && sharpCorners(shape) > 0) return reject('sharp');
  if (smooth && seams(shape) > 0) return reject('seams');
  // pieces that drift apart stop reading as one mark
  if (widestGap(shape) > maxGap) return reject('apart');

  const { width, height } = shape.bounds;
  const area = Math.abs(shape.area);
  const fill = area / (width * height);
  if (fill < minFill || fill > maxFill) return reject('fill');
  // very flat overall marks read poorly as icons
  if (Math.min(width, height) < minAspect * 100) return reject('flat');
  // a lone disc, square or diamond isn't a mark
  const nodes = shape.children.reduce((sum, c) => sum + c.segments.length, 0);
  if (nodes < minNodes || nodes > maxNodes) return reject('nodes');
  if (shape.children.length === 1 && (Math.abs(fill - Math.PI / 4) < 0.012 || fill > 0.97)) return reject('plain');

  // asymmetric marks still need their visual weight near the middle
  if (balance && offCenter(shape) > balance) return reject('unbalanced');

  // too much fine detail to read as a logo at icon size
  const detail = detailScore(shape, { tips, freePieces });
  if (detail > maxDetail) return reject('detail');

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
