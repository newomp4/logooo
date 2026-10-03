// Procedural marks. Where the recipes in blend.js start from a reference,
// these grow a mark from scratch out of the same vocabulary:
//   line    a stroke that wanders a 45° lattice, bending round, never doubling
//           back or crossing itself, often symmetric by construction
//   pieces  grid blocks or soft primitives, laid out by their own symmetry
//   carve   a solid body with a procedural channel, holes or opening
// Placement is measured, not guessed: copies of a piece are slid apart until
// they keep a set gap, or overlap by a set share, so nothing just grazes.
import { ORIGIN, circle, ellipse, rect, quad, roundedPolygon, ring, unite, subtract, intersect, xor, fitInside } from './geom.js';
import { band, roundCorners } from './shapes.js';

const U = 10;
const DIRS = Array.from({ length: 8 }, (_, k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
const copy = (it) => it.clone({ insert: false });
const centre = (it) => it.translate(it.bounds.center.multiply(-1));
const sizeOf = (it) => Math.max(it.bounds.width, it.bounds.height);
// a point on the outline, for paths and compound paths alike
const pointOn = (it) => (it.children?.[0] ?? it).getPointAt(0);

export const PROC_LIMITS = { minAspect: 0.45, freePieces: 9, maxNodes: 150, maxFine: 0.015, maxSpikes: 4, smooth: true, maxGap: 0.2 };

// ------------------------------------------------------------------ strokes

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
function pointToSegment(p, a, b) {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab)));
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t);
}
function crosses(a, b, c, d) {
  const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
}
const segmentGap = (a, b, c, d) => (crosses(a, b, c, d) ? 0 : Math.min(pointToSegment(a, c, d), pointToSegment(b, c, d), pointToSegment(c, a, b), pointToSegment(d, a, b)));

// No two runs that aren't neighbours come closer than `min`.
function clearOfItself(pts, min) {
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = i + 2; j < pts.length - 1; j++) {
      if (segmentGap(pts[i], pts[i + 1], pts[j], pts[j + 1]) < min) return false;
    }
  }
  return true;
}

// A path on a 45° lattice. 'mirror' builds half and reflects it across the
// vertical axis, 'turn' builds half and turns it 180° about the middle, so
// those strokes are symmetric by construction.
function walk(rng, sym) {
  const segs = sym === 'free' ? rng.int(2, 4) : rng.int(1, 3);
  let dir = sym === 'mirror' ? rng.pick([0, 1, 7]) : rng.int(0, 7);
  let p = [0, 0];
  const half = [p];
  const turns = [];
  for (let i = 0; i < segs; i++) {
    if (i) {
      // 45°, 90°, or now and then a 135° hook; never straight back
      const t = rng.weighted([[1, 3], [-1, 3], [2, 3], [-2, 3], [3, 0.7], [-3, 0.7]]);
      dir = (dir + t + 8) % 8;
      turns.push(t);
    }
    const len = U * rng.pick([1, 1.5, 2, 2.5]);
    p = [p[0] + DIRS[dir][0] * len, p[1] + DIRS[dir][1] * len];
    half.push(p);
  }
  if (sym === 'mirror') {
    // stays on its own side of the axis
    if (half.slice(1).some(([x]) => x < U * 0.5)) return null;
    return { pts: [...half.slice(1).reverse().map(([x, y]) => [-x, y]), ...half], sig: `m${turns}` };
  }
  if (sym === 'turn') return { pts: [...half.slice(1).reverse().map(([x, y]) => [-x, -y]), ...half], sig: `t${turns}` };
  return { pts: half, sig: `f${turns}` };
}

function strokePiece(rng) {
  for (let tries = 0; tries < 12; tries++) {
    const sym = rng.weighted([['free', 3], ['mirror', 2], ['turn', 2]]);
    const path = walk(rng, sym);
    if (!path) continue;
    const w = U * rng.float(0.28, 0.36);
    if (!clearOfItself(path.pts, w * 3)) continue;
    const item = band(path.pts, w, { radius: Math.max(U * rng.float(0.35, 1), w * 1.3), round: rng.chance(0.75) });
    return { item: centre(item), axes: sym === 'mirror' ? ['v'] : [], diagonal: true, kind: `line ${path.sig}` };
  }
  return null;
}

// ------------------------------------------------------------------ pieces

// 3 to 5 cells grown on a 3 × 3 grid, merged and rounded
function blockPiece(rng) {
  const n = rng.int(3, 5);
  const cells = new Set(['1,1']);
  for (let k = 0; cells.size < n && k < 60; k++) {
    const [x, y] = rng.pick([...cells]).split(',').map(Number);
    const [dx, dy] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    if (x + dx >= 0 && y + dy >= 0 && x + dx <= 2 && y + dy <= 2) cells.add(`${x + dx},${y + dy}`);
  }
  // a plus reads as a first-aid cross
  if (['0,1', '1,0', '1,2', '2,1'].every((c) => cells.has(c))) return null;
  const list = [...cells].map((c) => c.split(',').map(Number));
  // a straight bar is a plain capsule; cut as holes, bars read as pause and minus signs
  if (new Set(list.map(([x]) => x)).size < 2 || new Set(list.map(([, y]) => y)).size < 2) return null;
  const item = unite(list.map(([x, y]) => rect((x + 0.5) * U, (y + 0.5) * U, U * 1.002, U * 1.002)));
  // the cell pattern's own symmetry, about its bounding box
  const xs = list.map(([x]) => x);
  const ys = list.map(([, y]) => y);
  const sx = Math.min(...xs) + Math.max(...xs);
  const sy = Math.min(...ys) + Math.max(...ys);
  const holds = (f) => list.every(([x, y]) => cells.has(f(x, y)));
  const axes = [holds((x, y) => `${sx - x},${y}`) && 'v', holds((x, y) => `${x},${sy - y}`) && 'h'].filter(Boolean);
  const shape = [...cells].sort().join(';');
  return { item: centre(roundCorners(item, U * rng.float(0.2, 0.45))), axes, kind: `block ${shape}` };
}

function softPiece(rng) {
  const kind = rng.weighted([['oval', 2], ['squircle', 2], ['pill', 2], ['half', 2]]);
  const a = U * rng.float(1, 1.6);
  const b = a * rng.float(0.45, 0.85);
  if (kind === 'half') return { item: centre(intersect(circle(0, 0, a), rect(0, -a / 2, 2 * a, a))), axes: ['v'], kind: 'half' };
  const item = kind === 'oval' ? ellipse(0, 0, a, b) : kind === 'squircle' ? quad(a, b, rng.float(0.7, 0.92)) : rect(0, 0, 2 * a, 2 * b, b);
  return { item, axes: ['v', 'h'], kind };
}

// ------------------------------------------------------------------ layout

function samplesOf(item, n = 64) {
  const loops = item.children ?? [item];
  const total = loops.reduce((s, l) => s + l.length, 0);
  return loops.flatMap((l) => Array.from({ length: Math.max(8, Math.round((n * l.length) / total)) }, (_, i) => l.getPointAt((l.length * i) / Math.max(8, Math.round((n * l.length) / total)))));
}

// Gap between two shapes; negative when they touch or overlap.
function gapBetween(a, b) {
  if (a.intersects(b) || a.contains(pointOn(b)) || b.contains(pointOn(a))) return -1;
  const pa = samplesOf(a);
  const pb = samplesOf(b);
  let min = Infinity;
  for (const p of pa) for (const q of pb) min = Math.min(min, (p.x - q.x) ** 2 + (p.y - q.y) ** 2);
  return Math.sqrt(min);
}

// Share of the first copy covered by any other copy.
function overlapOf(items) {
  const [a, ...rest] = items;
  const area = Math.abs(a.area);
  return Math.max(...rest.map((b) => (a.intersects(b) || a.contains(pointOn(b)) ? Math.abs(intersect(a, b).area) / area : 0)));
}

// The offset d at which copies stand `gap` apart, or overlap by `overlap`.
function settle(build, want, size) {
  const score = (d) => {
    const items = build(d);
    if (want.gap != null) return Math.min(...items.slice(1).map((b) => gapBetween(items[0], b))) - want.gap;
    return want.overlap - overlapOf(items);
  };
  let lo = 0;
  let hi = size;
  for (let k = 0; score(hi) < 0 && k < 6; k++) hi *= 1.6;
  if (score(hi) < 0) return null;
  for (let k = 0; k < 11; k++) {
    const mid = (lo + hi) / 2;
    if (score(mid) < 0) lo = mid;
    else hi = mid;
  }
  return hi;
}

// Copies of a piece in a layout its symmetry allows: a 180° pair, a mirrored
// pair or four mirrored corners for anything; a ring only for pieces with a
// mirror axis, set along the radius (otherwise turned copies make pinwheels).
function lay(rng, piece, { ring: rings = false, merge: mergeChance = 0.4, only = null } = {}) {
  const { item, axes } = piece;
  let options = [['pair', 3], ['mirror', 3], ['quad', 2]];
  // rings of solid pieces read as flowers and cogs; rings of strokes don't
  if (rings && axes.length) options.push(['ring', 2.5]);
  if (only) options = options.filter(([mode]) => only.includes(mode));
  if (!options.length) return null;
  const mode = rng.weighted(options);
  const size = sizeOf(item);
  // rings always stand apart, for the same reason; merged mirrored strokes
  // spell letters (V, Y, M)
  const merge = mode !== 'ring' && !(piece.diagonal && mode === 'mirror') && rng.chance(mergeChance);
  const want = merge ? { overlap: rng.float(0.12, 0.3) } : { gap: size * rng.float(0.08, 0.16) };
  // strokes live on a 45° lattice; blocks and soft shapes stay square to the page
  const turn = () => (piece.diagonal ? rng.int(0, 7) * 45 : rng.int(0, 3) * 90);
  let build;
  if (mode === 'pair') {
    const base = copy(item).rotate(turn(), ORIGIN);
    const [dx, dy] = DIRS[piece.diagonal ? rng.int(0, 7) : rng.int(0, 3) * 2];
    build = (d) => {
      const a = copy(base).translate([dx * d, dy * d]);
      return [a, copy(a).rotate(180, ORIGIN)];
    };
  } else if (mode === 'mirror') {
    const base = copy(item).rotate(turn(), ORIGIN);
    const lift = rng.chance(0.3) ? size * rng.float(-0.3, 0.3) : 0;
    build = (d) => {
      const a = copy(base).translate([d, lift]);
      return [a, copy(a).scale(-1, 1, ORIGIN)];
    };
  } else if (mode === 'quad') {
    const base = copy(item).rotate(rng.pick([0, 90, 180, 270]), ORIGIN);
    const k = rng.float(0.75, 1.3);
    build = (d) => {
      const a = copy(base).translate([d, d * k]);
      return [a, copy(a).scale(-1, 1, ORIGIN), copy(a).scale(1, -1, ORIGIN), copy(a).scale(-1, -1, ORIGIN)];
    };
  } else {
    const n = rng.weighted([[4, 3], [5, 2], [6, 2]]);
    // the mirror axis along the radius, pointing out or in
    const along = axes.includes('h') && !axes.includes('v') ? 0 : axes.includes('h') && rng.chance(0.5) ? 0 : 90;
    const base = copy(item).rotate(along + rng.pick([0, 180]), ORIGIN);
    build = (d) => Array.from({ length: n }, (_, k) => copy(base).translate([d, 0]).rotate((360 * k) / n - 90, ORIGIN));
  }
  const d = settle(build, want, size);
  if (d == null) return null;
  return { items: build(d), mode, merge };
}

// Distance from the middle to the nearest ink, when the middle is empty.
function freeRadius(item) {
  if (item.contains(ORIGIN)) return 0;
  return Math.min(...samplesOf(item, 240).map((p) => p.length));
}

function withCore(rng, item) {
  const free = freeRadius(item);
  if (free < sizeOf(item) * 0.1 || !rng.chance(0.3)) return item;
  const r = free * rng.float(0.45, 0.65);
  const dot = rng.chance(0.7) ? circle(0, 0, r) : roundedPolygon([[r * 1.2, 0], [0, r * 1.2], [-r * 1.2, 0], [0, -r * 1.2]], r * 0.2);
  return unite(item, dot);
}

const finish = (rng, item) => roundCorners(item, sizeOf(item) * rng.float(0.025, 0.045));

// ------------------------------------------------------------------ styles

export function line(rng) {
  const piece = strokePiece(rng);
  if (!piece) return null;
  const laid = lay(rng, piece, { ring: true, merge: 0.25 });
  if (!laid) return null;
  const item = withCore(rng, unite(laid.items));
  return { item: finish(rng, item), symmetry: 'auto', limits: PROC_LIMITS, kind: `${piece.kind}/${laid.mode}${laid.merge ? '+' : ''}` };
}

export function pieces(rng) {
  const block = rng.chance(0.7);
  const piece = block ? blockPiece(rng) : softPiece(rng);
  if (!piece) return null;
  // plain soft shapes standing apart are just dots; they overlap instead
  const laid = lay(rng, piece, { merge: block ? 0.4 : 1 });
  if (!laid) return null;
  // soft pieces may cancel out where they overlap
  const cancel = laid.merge && !block && rng.chance(0.5);
  const item = withCore(rng, cancel ? xor(laid.items) : unite(laid.items));
  return { item: finish(rng, item), symmetry: 'auto', limits: PROC_LIMITS, kind: `${piece.kind.split(' ')[0]}/${laid.mode}${laid.merge ? '+' : ''}${cancel ? '^' : ''}` };
}

const R = U * 2.5;

// Bodies symmetric across both axes, so any symmetric cut keeps a symmetry.
function body(rng) {
  const kind = rng.weighted([['circle', 2], ['squircle', 3], ['rounded', 2], ['octagon', 1], ['hexagon', 1], ['pill', 1]]);
  const wide = rng.chance(0.3) ? rng.float(0.78, 0.92) : 1;
  if (kind === 'squircle') return { kind, item: quad(R, R * wide, rng.float(0.75, 0.92)) };
  if (kind === 'rounded') return { kind, item: rect(0, 0, 2 * R, 2 * R * wide, R * rng.float(0.25, 0.5)) };
  if (kind === 'octagon') return { kind, item: roundedPolygon(ring(8, R, 22.5), R * 0.18) };
  if (kind === 'hexagon') return { kind, item: roundedPolygon(ring(6, R, rng.pick([0, 30])), R * 0.16) };
  if (kind === 'pill') return { kind, item: rect(0, 0, 2 * R, 1.3 * R, 0.65 * R) };
  return { kind, item: circle(0, 0, R) };
}

export function carve(rng) {
  const { kind: shape, item: solid } = body(rng);
  let item;
  let detail;
  if (rng.chance(0.6)) {
    // a symmetric stroke run right through the body; a mirrored one with a
    // single bend is just a V (an envelope), so those need two
    const path = walk(rng, rng.chance(0.7) ? 'turn' : 'mirror');
    if (!path || (path.sig[0] === 'm' && path.pts.length < 5)) return null;
    const ends = [path.pts[0], path.pts[path.pts.length - 1]].map(([x, y]) => Math.hypot(x, y));
    const far = Math.max(...path.pts.map(([x, y]) => Math.hypot(x, y)));
    // a channel that curls back in on itself would leave islands
    if (Math.min(...ends) < far * 0.7) return null;
    const pts = path.pts.map(([x, y]) => [(x * R * 1.35) / Math.min(...ends), (y * R * 1.35) / Math.min(...ends)]);
    const w = R * rng.float(0.07, 0.11);
    if (!clearOfItself(pts, w * 4)) return null;
    item = subtract(solid, band(pts, w, { radius: R * rng.float(0.15, 0.45), round: false }));
    detail = `channel ${path.sig}`;
  } else {
    // pieces laid out and punched through, keeping thick walls
    const soft = rng.chance(0.3);
    const piece = soft ? softPiece(rng) : rng.chance(0.55) ? strokePiece(rng) : blockPiece(rng);
    if (!piece) return null;
    // two soft holes side by side read as a pair of eyes
    const laid = lay(rng, piece, { ring: true, merge: 0, only: soft ? ['quad', 'ring'] : null });
    if (!laid) return null;
    const holes = unite(laid.items);
    holes.scale((R * 2) / sizeOf(holes), ORIGIN);
    const fitted = fitInside(solid, holes, R * rng.float(0.16, 0.24), 0.8);
    if (!fitted || sizeOf(fitted) < R * 0.9) return null;
    item = subtract(solid, fitted);
    detail = `holes ${piece.kind.split(' ')[0]}/${laid.mode}`;
  }
  return { item: finish(rng, item), symmetry: 'auto', limits: PROC_LIMITS, kind: `carve ${shape}/${detail}` };
}
