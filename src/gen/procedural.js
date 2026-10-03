// Procedural marks. Instead of a fixed recipe, each mark is grown by a small
// random program, the way a designer sketches:
//   1. a motif: one primitive, maybe with another attached to its edge, a
//      notch bitten out or a hole punched in
//   2. an arrangement: the motif spun around a centre, mirrored, turned 180°,
//      or left alone
//   3. a finish: trimmed into a silhouette, opened in the middle, or slit
// then every corner gets a live-corner fillet. Each step's choices are random,
// so marks don't fall into a handful of recognisable recipes. generate() grows
// a few of these per mark and keeps the one that scores best.
import { ORIGIN, Point, circle, ellipse, rect, roundedPolygon, ring, leaf, unite, subtract, intersect, xor, clearance } from './geom.js';
import { arcStroke, annulus, polyStroke, wedge, roundCorners } from './shapes.js';

const U = 10;
const S = U * 2;

// primitives without long straight edges: safe to spin four ways
const CURVED = new Set(['disc', 'ellipse', 'arc', 'leaf', 'quarter']);

function primitive(rng, size, pool) {
  const kind = rng.weighted(
    pool ?? [['disc', 2], ['ellipse', 2.2], ['rbox', 3], ['slab', 3], ['poly', 1.2], ['arc', 2], ['stroke', 1.4], ['quarter', 1.6], ['leaf', 1.2]],
  );
  let item;
  if (kind === 'disc') item = circle(0, 0, size * rng.float(0.4, 0.6));
  else if (kind === 'ellipse') item = ellipse(0, 0, size * rng.float(0.45, 0.7), size * rng.float(0.18, 0.38));
  else if (kind === 'rbox') {
    const w = size * rng.float(0.5, 1.1);
    const h = size * rng.float(0.35, 0.8);
    item = rect(0, 0, w, h, (Math.min(w, h) / 2) * rng.pick([0.15, 0.35, 0.6, 1]));
  } else if (kind === 'slab') {
    const w = size * rng.float(0.7, 1.2);
    const h = size * rng.float(0.35, 0.6);
    const lean = h * rng.float(0.3, 0.9) * rng.pick([1, -1]);
    const pts = [[-w / 2 - lean / 2, h / 2], [w / 2 - lean / 2, h / 2], [w / 2 + lean / 2, -h / 2], [-w / 2 + lean / 2, -h / 2]];
    const radii = pts.map(() => h * rng.pick([0.06, 0.06, 0.42]));
    item = roundedPolygon(pts, (i) => radii[i]);
  } else if (kind === 'poly') {
    const n = rng.pick([3, 5, 6]);
    item = roundedPolygon(ring(n, size * 0.55, rng.pick([0, 180 / n])), size * rng.float(0.05, 0.15));
  } else if (kind === 'arc') {
    const r = size * rng.float(0.45, 0.7);
    const t = size * rng.float(0.12, 0.2);
    const span = rng.float(80, 170);
    const a0 = -90 - span / 2;
    item = rng.chance(0.6) ? arcStroke(0, 0, r, a0, a0 + span, t) : intersect(annulus(r - t, r + t), wedge(a0, a0 + span, r * 2));
  } else if (kind === 'stroke') {
    const t = size * rng.float(0.1, 0.17);
    const a = (rng.pick([45, 90, 135]) * Math.PI) / 180;
    const l1 = size * rng.float(0.4, 0.7);
    const l2 = size * rng.float(0.4, 0.8);
    item = polyStroke([[-l1, 0], [0, 0], [Math.cos(a) * l2, -Math.sin(a) * l2]], t);
  } else if (kind === 'quarter') {
    const r = size * rng.float(0.6, 0.9);
    item = intersect(circle(0, 0, r), rect(r / 2, -r / 2, r, r));
  } else {
    item = leaf(size * rng.float(0.8, 1.2), size * rng.float(0.3, 0.5));
  }
  item.translate(item.bounds.center.multiply(-1));
  return { item, kind };
}

// a random point on the outer edge, with the outward normal there
function edgePoint(item, rng) {
  const loops = (item.children ?? [item]).filter((c) => Math.abs(c.area) > 1);
  if (!loops.length) return null;
  const path = loops.reduce((a, b) => (Math.abs(b.area) > Math.abs(a.area) ? b : a));
  const at = rng.next() * path.length;
  const p = path.getPointAt(at);
  let n = path.getNormalAt(at);
  if (!p || !n) return null;
  if (item.contains(p.add(n.multiply(0.5)))) n = n.multiply(-1);
  return { p, n, angle: n.angle };
}

function motif(rng) {
  const first = primitive(rng, S);
  let item = first.item;
  let straight = CURVED.has(first.kind) ? 0 : 1;
  let bent = first.kind === 'stroke';
  // mostly one primitive: busy motifs spun around a centre turn into cogs
  const steps = rng.weighted([[0, 3], [1, 2.2], [2, 0.5]]);
  for (let i = 0; i < steps; i++) {
    const spot = edgePoint(item, rng);
    if (!spot) break;
    const op = rng.weighted([['attach', 3], ['notch', 2], ['hole', 0.8]]);
    if (op === 'attach') {
      const add = primitive(rng, S * rng.float(0.45, 0.8));
      if (!CURVED.has(add.kind)) straight++;
      if (add.kind === 'stroke') bent = true;
      const reach = Math.max(add.item.bounds.width, add.item.bounds.height) / 2;
      add.item.rotate(spot.angle + rng.pick([0, 90]), ORIGIN);
      // sink it well into the edge: barely-touching joins look accidental
      add.item.translate(spot.p.add(spot.n.multiply(reach * rng.float(-0.2, 0.25))));
      item = unite(item, add.item);
    } else if (op === 'notch') {
      const bite = primitive(rng, S * rng.float(0.28, 0.45), [['disc', 3], ['rbox', 2], ['ellipse', 1.5], ['poly', 0.8]]);
      const reach = Math.max(bite.item.bounds.width, bite.item.bounds.height) / 2;
      bite.item.rotate(spot.angle, ORIGIN);
      bite.item.translate(spot.p.add(spot.n.multiply(reach * rng.float(-0.4, 0.1))));
      item = subtract(item, bite.item);
    } else {
      const hole = primitive(rng, S * rng.float(0.22, 0.38), [['disc', 2], ['rbox', 2], ['ellipse', 1.5]]).item;
      const c = item.bounds.center;
      hole.translate(c);
      const corners = [hole.bounds.topLeft, hole.bounds.topRight, hole.bounds.bottomLeft, hole.bounds.bottomRight];
      if (corners.every((pt) => item.contains(pt))) item = subtract(item, hole);
    }
  }
  return { item, straight, bent };
}

// Places copies of the motif around the centre. Returns the arrangement so
// finishing touches can respect its symmetry.
function arrange(rng, m, opts) {
  const base = m.item;
  const size = Math.max(base.bounds.width, base.bounds.height);
  let mode = rng.weighted([['spin', 4], ['dihedral', 2.5], ['turn', 3], ['mirror', 2.5], ['alone', opts.loose ? 1.2 : 0.4]]);
  if (mode === 'alone') return { item: base, mode, n: 1 };

  let n = mode === 'spin' ? rng.weighted([[3, 2], [4, 2], [5, 1], [6, 1.2], [8, 0.3]]) : mode === 'dihedral' ? rng.weighted([[2, 1.2], [3, 1], [4, 2], [5, 0.6], [6, 0.8]]) : 2;
  // spun bent strokes, or four straight-edged pieces spun one way, can read as a
  // hooked cross: mirror each piece so the arrangement can't spin
  if (mode === 'spin' && (m.bent || (n === 4 && m.straight))) mode = 'dihedral';
  // five or more copies all leaning one way read as a spiral or a saw blade
  if (mode === 'spin' && n >= 5) mode = 'dihedral';

  const d = size * rng.float(0.3, 0.85);
  const piece = base.clone({ insert: false }).rotate(rng.float(0, 360), ORIGIN);
  piece.translate(new Point(d, 0));
  let unit = piece;
  if (mode === 'dihedral') unit = unite(piece, piece.clone({ insert: false }).scale(1, -1, ORIGIN));
  if (mode === 'mirror') {
    unit = unite(piece, piece.clone({ insert: false }).scale(-1, 1, ORIGIN));
    n = 1;
  }
  const copies = mode === 'mirror' ? [unit] : Array.from({ length: n }, (_, i) => unit.clone({ insert: false }).rotate((360 * i) / n, ORIGIN));

  // neighbours should clearly merge or clearly stand apart; near misses and
  // grazing overlaps look accidental
  const [a, b] = mode === 'mirror' ? [piece, piece.clone({ insert: false }).scale(-1, 1, ORIGIN)] : n > 1 ? [copies[0], copies[1]] : [];
  if (a && b) {
    if (a.intersects(b) || a.contains(b.interiorPoint) || b.contains(a.interiorPoint)) {
      const shared = Math.abs(intersect(a, b).area) / Math.abs(a.area);
      if (shared < 0.08) return null;
    } else if (clearance(a, b) < U * 0.3) {
      return null;
    }
  }
  // overlaps usually merge; now and then they cancel out instead
  const item = rng.chance(0.15) ? xor(copies) : unite(copies);
  if (mode !== 'mirror') item.rotate(-90, ORIGIN);
  return { item, mode, n };
}

function finish(rng, arr) {
  let item = arr.item;
  const reach = Math.max(item.bounds.width, item.bounds.height) / 2;
  const slitFits = arr.mode === 'mirror' || arr.mode === 'turn' || (arr.mode === 'dihedral' && arr.n % 2 === 0);
  const op = rng.weighted([['none', 4], ['trim', 1.6], ['open', 1.2], ['slit', slitFits ? 1 : 0]]);
  if (op === 'trim') {
    // cut the outer edge into a round silhouette
    item = intersect(item, circle(0, 0, reach * rng.float(0.78, 0.94)));
  } else if (op === 'open' && item.contains(ORIGIN)) {
    item = subtract(item, circle(0, 0, reach * rng.float(0.16, 0.3)));
  } else if (op === 'slit') {
    item = subtract(item, rect(0, 0, reach * 4, reach * rng.float(0.08, 0.14)));
  }
  return item;
}

// One procedural mark; symmetry is measured afterwards.
export function form(rng, opts = {}) {
  const m = motif(rng);
  if (!m.item || m.item.isEmpty()) return null;
  const arr = arrange(rng, m, opts);
  if (!arr?.item || arr.item.isEmpty()) return null;
  const item = roundCorners(finish(rng, arr), U * rng.float(0.06, 0.2));
  return { item, symmetry: 'auto', limits: { minAspect: 0.55, freePieces: 7, maxNodes: 75 } };
}
