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
import { arcStroke, annulus, wedge, roundCorners } from './shapes.js';

const U = 10;
const S = U * 2;

// primitives without long straight edges: safe to spin four ways
const CURVED = new Set(['disc', 'ellipse', 'arc', 'leaf', 'quarter']);

// Kinds that look right together. A motif sticks to one family, the way the
// reference marks stick to one kind of geometry: welding an oval to a box
// stub makes keys, fish and mittens.
const FAMILY = {
  block: ['rbox', 'slab'],
  round: ['disc', 'ellipse'],
  band: ['arc'],
  poly: ['poly'],
  quarter: ['quarter'],
  leaf: ['leaf'],
};

function primitive(rng, size, kind) {
  let item;
  if (kind === 'disc') item = circle(0, 0, size * rng.float(0.4, 0.6));
  else if (kind === 'ellipse') item = ellipse(0, 0, size * rng.float(0.45, 0.7), size * rng.float(0.22, 0.38));
  else if (kind === 'rbox') {
    const w = size * rng.float(0.55, 1.1);
    const h = size * rng.float(0.4, 0.8);
    item = rect(0, 0, w, h, (Math.min(w, h) / 2) * rng.pick([0.25, 0.4, 0.6, 1]));
  } else if (kind === 'slab') {
    const w = size * rng.float(0.7, 1.2);
    const h = size * rng.float(0.4, 0.6);
    const lean = h * rng.float(0.3, 0.9) * rng.pick([1, -1]);
    const pts = [[-w / 2 - lean / 2, h / 2], [w / 2 - lean / 2, h / 2], [w / 2 + lean / 2, -h / 2], [-w / 2 + lean / 2, -h / 2]];
    const radii = pts.map(() => h * rng.pick([0.12, 0.12, 0.45]));
    item = roundedPolygon(pts, (i) => radii[i]);
  } else if (kind === 'poly') {
    const n = rng.pick([5, 6]);
    item = roundedPolygon(ring(n, size * 0.55, rng.pick([0, 180 / n])), size * rng.float(0.08, 0.18));
  } else if (kind === 'arc') {
    const r = size * rng.float(0.45, 0.7);
    const t = size * rng.float(0.13, 0.2);
    const span = rng.float(80, 170);
    const a0 = -90 - span / 2;
    item = rng.chance(0.6) ? arcStroke(0, 0, r, a0, a0 + span, t) : intersect(annulus(r - t, r + t), wedge(a0, a0 + span, r * 2));
  } else if (kind === 'quarter') {
    const r = size * rng.float(0.6, 0.9);
    item = intersect(circle(0, 0, r), rect(r / 2, -r / 2, r, r));
  } else {
    item = leaf(size * rng.float(0.8, 1.2), size * rng.float(0.38, 0.55));
  }
  item.translate(item.bounds.center.multiply(-1));
  return item;
}

function motif(rng, family) {
  const kinds = FAMILY[family];
  const firstKind = rng.pick(kinds);
  let item = primitive(rng, S, firstKind);
  const straight = family === 'block' || family === 'poly';
  const size = () => Math.max(item.bounds.width, item.bounds.height);
  // single primitives can't take a twin or a slice without falling apart
  const steps = family === 'poly' || family === 'leaf' ? 0 : rng.weighted([[0, 3], [1, 2.2], [2, 0.5]]);
  for (let i = 0; i < steps; i++) {
    const op = rng.weighted([['twin', 3], ['bevel', family === 'block' ? 1.5 : 0], ['slice', 1.2], ['hole', 0.8]]);
    if (op === 'twin') {
      // a second piece of the same family and nearly the same size, sunk well in
      const spot = edgePoint(item, rng);
      if (!spot) break;
      const add = primitive(rng, S * rng.float(0.7, 1), rng.pick(kinds));
      const reach = Math.max(add.bounds.width, add.bounds.height) / 2;
      add.rotate(spot.angle + rng.pick([0, 90]), ORIGIN);
      add.translate(spot.p.add(spot.n.multiply(-reach * rng.float(0.35, 0.65))));
      item = unite(item, add);
    } else if (op === 'bevel') {
      // a corner chamfered off at 45°
      const c = item.bounds.center;
      const corner = rng.pick([item.bounds.topLeft, item.bounds.topRight, item.bounds.bottomLeft, item.bounds.bottomRight]);
      const dir = corner.subtract(c).normalize();
      const cut = rect(0, 0, size() * 2, size() * 2);
      cut.rotate(dir.angle + 45, ORIGIN);
      cut.translate(corner.add(dir.multiply(size() * (1 - rng.float(0.12, 0.25)))));
      item = subtract(item, cut);
    } else if (op === 'slice') {
      // a straight gap across the motif
      const band = rect(0, 0, size() * 3, size() * rng.float(0.08, 0.13));
      band.rotate(rng.pick([0, 45, 90, 135]), ORIGIN);
      band.translate(item.bounds.center);
      item = subtract(item, band);
    } else {
      const hole = primitive(rng, size() * rng.float(0.45, 0.6), rng.pick(kinds));
      hole.translate(item.bounds.center);
      const corners = [hole.bounds.topLeft, hole.bounds.topRight, hole.bounds.bottomLeft, hole.bounds.bottomRight];
      if (corners.every((pt) => item.contains(pt))) item = subtract(item, hole);
    }
  }
  return { item, straight, bent: false, family };
}

// Places copies of the motif around the centre. Returns the arrangement so
// finishing touches can respect its symmetry.
// Which arrangement a mark gets is decided once, up front: if it were rolled
// per attempt, the arrangements that pass the checks most easily (rings of
// separate pieces) would win by attrition and crowd everything else out.
export function formPlan(rng, opts = {}) {
  const mode = rng.weighted([['spin', 2.2], ['dihedral', 1.4], ['turn', 3.2], ['mirror', 3], ['alone', opts.loose ? 1.2 : 0.4]]);
  // the motif's geometry family too: arc bands pass the checks most easily and
  // would otherwise take over
  const family = rng.weighted([['block', 3], ['round', 3], ['band', 1.2], ['poly', 0.8], ['quarter', 0.6], ['leaf', 0.4]]);
  // threes are easy to overdo (tri-tipped marks everywhere), so they stay modest
  const n =
    mode === 'spin' ? rng.weighted([[3, 0.4], [4, 2], [5, 0.6], [6, 0.8], [8, 0.2]])
    : mode === 'dihedral' ? rng.weighted([[2, 1.6], [3, 0.3], [4, 2], [5, 0.4], [6, 0.5]])
    : mode === 'alone' ? 1
    : 2;
  return { mode, n, family };
}

function arrange(rng, m, plan) {
  const base = m.item;
  const size = Math.max(base.bounds.width, base.bounds.height);
  let { mode, n } = plan;
  if (mode === 'alone') return { item: base, mode, n: 1 };
  // spun bent strokes, or four straight-edged pieces spun one way, can read as a
  // hooked cross: mirror each piece so the arrangement can't spin
  if (mode === 'spin' && (m.bent || (n === 4 && m.straight))) mode = 'dihedral';
  // five or more copies all leaning one way read as a spiral or a saw blade
  if (mode === 'spin' && n >= 5) mode = 'dihedral';

  // four or more copies melted together make flowers and cogs, so those
  // always stand apart; pairs, mirrors and threes may merge
  const apart = n >= 4 && mode !== 'mirror';
  const spin0 = rng.float(0, 360);
  let d = size * rng.float(apart ? 0.6 : 0.3, apart ? 1 : 0.85);
  const build = () => {
    const piece = base.clone({ insert: false }).rotate(spin0, ORIGIN);
    piece.translate(new Point(d, 0));
    let unit = piece;
    if (mode === 'dihedral') unit = unite(piece, piece.clone({ insert: false }).scale(1, -1, ORIGIN));
    if (mode === 'mirror') unit = unite(piece, piece.clone({ insert: false }).scale(-1, 1, ORIGIN));
    const list = mode === 'mirror' ? [unit] : Array.from({ length: n }, (_, i) => unit.clone({ insert: false }).rotate((360 * i) / n, ORIGIN));
    return { piece, unit, list };
  };
  let { piece, list: copies } = build();
  if (mode === 'mirror') n = 1;
  if (apart) {
    // push the copies out until there's a clear gap between neighbours
    for (let tries = 0; tries < 8 && (copies[0].intersects(copies[1]) || clearance(copies[0], copies[1]) < U * 0.35); tries++) {
      d *= 1.18;
      ({ piece, list: copies } = build());
    }
    if (copies[0].intersects(copies[1])) return null;
  }

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
  const plan = opts.plan ?? formPlan(rng, opts);
  const m = motif(rng, plan.family);
  if (!m.item || m.item.isEmpty()) return null;
  const arr = arrange(rng, m, plan);
  if (!arr?.item || arr.item.isEmpty()) return null;
  // rounding scaled to the mark so corners never read as stray points
  const span = Math.max(arr.item.bounds.width, arr.item.bounds.height);
  const item = roundCorners(finish(rng, arr), span * rng.float(0.015, 0.04));
  return { item, symmetry: 'auto', limits: { minAspect: 0.55, freePieces: 7, maxNodes: 75, maxFine: 0.012, maxSpikes: 2 } };
}
