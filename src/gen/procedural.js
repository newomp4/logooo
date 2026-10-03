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
import { ORIGIN, Path, Point, circle, ellipse, rect, roundedPolygon, ring, leaf, unite, subtract, intersect, xor, clearance } from './geom.js';
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
    // one radius for every corner: mixing tight and round corners looks off
    item = roundedPolygon(pts, h * rng.pick([0.12, 0.2, 0.32]));
  } else if (kind === 'poly') {
    const n = rng.pick([5, 6]);
    item = roundedPolygon(ring(n, size * 0.55, rng.pick([0, 180 / n])), size * rng.float(0.08, 0.18));
  } else if (kind === 'arc') {
    const r = size * rng.float(0.45, 0.7);
    const t = size * rng.float(0.15, 0.22);
    const span = rng.float(120, 200);
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
  // off-centre slices and chamfers left half-ovals, D shapes and Pac-Man
  // notches; the only motif moves now are an exact twin and a centred hole
  // (purposeful cuts happen once, on the whole mark, in finish())
  // twin discs make figure-8s, which came up far too often
  // round motifs stay single discs and ovals: twinned they make figure-8s
  const steps = family === 'poly' || family === 'leaf' || family === 'round' ? 0 : rng.weighted([[0, 3], [1, 2.4]]);
  for (let i = 0; i < steps; i++) {
    // a hole only goes into a lone primitive, with room all round it: punched
    // into a twin it lands near an edge and leaves odd notches
    const op = i === 0 ? rng.weighted([['twin', 3], ['hole', 0.8]]) : 'twin';
    if (op === 'twin') {
      // an exact copy of the base, turned or not, sunk well into its edge
      const spot = edgePoint(item, rng);
      if (!spot) break;
      const add = item.clone({ insert: false });
      add.translate(add.bounds.center.multiply(-1));
      const reach = Math.max(add.bounds.width, add.bounds.height) / 2;
      add.rotate(rng.pick([0, 90, 180]), ORIGIN);
      add.translate(spot.p.add(spot.n.multiply(-reach * rng.float(0.35, 0.6))));
      item = unite(item, add);
    } else {
      const hole = primitive(rng, size() * rng.float(0.4, 0.55), firstKind);
      hole.translate(item.bounds.center);
      const inside = [hole.bounds.topLeft, hole.bounds.topRight, hole.bounds.bottomLeft, hole.bounds.bottomRight].every((pt) => item.contains(pt));
      if (inside && clearance(hole, item) > size() * 0.2) item = subtract(item, hole);
      break;
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
  const mode = rng.weighted([['spin', 1.6], ['dihedral', 1], ['turn', 3.2], ['mirror', 3], ['alone', opts.loose ? 1.2 : 0.4]]);
  // the motif's geometry family too: arc bands pass the checks most easily and
  // would otherwise take over
  const family = rng.weighted([['block', 3], ['round', 2.2], ['band', 0.6], ['poly', 0.8], ['quarter', 0.6], ['leaf', 0.4]]);
  // threes are easy to overdo (tri-tipped marks everywhere), so they stay modest
  const n =
    mode === 'spin' ? rng.weighted([[3, 0.4], [4, 2], [5, 0.6], [6, 0.8], [8, 0.2]])
    : mode === 'dihedral' ? rng.weighted([[2, 1.6], [3, 0.3], [4, 2], [5, 0.4], [6, 0.5]])
    : mode === 'alone' ? 1
    : 2;
  // discs and ovals only work as rings and crosses (three or more around a
  // centre); mirrored or turned in pairs they melt into peanuts and 8s
  if (family === 'round' && n < 3) {
    return { mode: rng.chance(0.5) ? 'spin' : 'dihedral', n: rng.weighted([[3, 0.5], [4, 2], [5, 0.8], [6, 1]]), family };
  }
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
  let d = size * rng.float(apart ? 0.6 : 0.3, apart ? 1 : 0.62);
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

// four quarter-circle bites out of a square leave a concave four-point star
function concaveStar(s) {
  return subtract(rect(0, 0, 2 * s, 2 * s), ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([i, j]) => circle(i * s, j * s, s)));
}

// The purposeful cuts from the references, made once on the whole mark: a
// slit that may open into a diamond, lens or star in the middle; a centred
// opening; a round trim.
function finish(rng, arr) {
  let item = arr.item;
  const reach = Math.max(item.bounds.width, item.bounds.height) / 2;
  const solid = (item.children?.filter((c) => c.area > 0).length ?? 1) === 1;
  const slitFits = solid && (arr.mode === 'mirror' || arr.mode === 'turn' || (arr.mode === 'dihedral' && arr.n % 2 === 0));
  const op = rng.weighted([['none', 2.5], ['trim', 1.2], ['open', solid ? 1.4 : 0], ['slit', slitFits ? 2 : 0]]);
  const middle = (s) => {
    const kind = rng.weighted([['circle', 1.5], ['diamond', 1.5], ['lens', 1.2], ['star', 1.5]]);
    if (kind === 'circle') return circle(0, 0, s);
    if (kind === 'diamond') return new Path({ segments: [[s * 1.5, 0], [0, s], [-s * 1.5, 0], [0, -s]], closed: true });
    if (kind === 'lens') return ellipse(0, 0, s * 1.6, s * 0.65);
    return concaveStar(s * 0.9);
  };
  if (op === 'trim') {
    item = intersect(item, circle(0, 0, reach * rng.float(0.78, 0.94)));
  } else if (op === 'open' && item.contains(ORIGIN)) {
    item = subtract(item, middle(reach * rng.float(0.16, 0.28)));
  } else if (op === 'slit') {
    const cuts = [rect(0, 0, reach * 4, reach * rng.float(0.08, 0.13))];
    if (rng.chance(0.6)) cuts.push(middle(reach * rng.float(0.16, 0.26)));
    const turn = rng.pick([0, 90]);
    item = subtract(item, ...cuts.map((c) => c.rotate(turn, ORIGIN)));
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
  return { item, symmetry: 'auto', limits: { minAspect: 0.55, freePieces: 7, maxNodes: 75, maxFine: 0.012, maxSpikes: 2, smooth: true, maxGap: 0.16 } };
}
