// Compositional families. Instead of recreating one particular logo, each
// picks from a small vocabulary (containers, cuts, slabs, pieces) and combines
// a few at random, using exact shapes and boolean ops, with filleted corners.
// Their symmetry is measured afterwards ('auto').
import { ORIGIN, circle, ellipse, rect, quad, place, roundedPolygon, ring, polar, gridOutline, unite, subtract } from './geom.js';
import { polyStroke, polygon, roundCorners } from './shapes.js';

const U = 10;
const R = U * 2;
const AUTO = 'auto';
const rad = (deg) => (deg * Math.PI) / 180;

const turned = (item) => item.clone({ insert: false }).rotate(180, ORIGIN);
const flipped = (item) => item.clone({ insert: false }).scale(-1, 1, ORIGIN);
const solidOnly = (item) => item && !item.reorient(false, true).children?.some((c) => c.area < 0);

// ------------------------------------------------------------- containers

function container(rng) {
  const kind = rng.weighted([['circle', 3], ['squircle', 3], ['polygon', 3], ['pill', 1.2], ['blob', 1.2]]);
  if (kind === 'circle') return { kind, item: circle(0, 0, R) };
  if (kind === 'squircle') {
    const aspect = rng.chance(0.7) ? 1 : rng.float(0.8, 0.95);
    return { kind, item: quad(R, R * aspect, rng.float(0.62, 0.92)) };
  }
  if (kind === 'polygon') {
    const n = rng.weighted([[6, 3], [4, 2], [8, 1.2], [3, 1], [5, 1]]);
    return { kind, n, item: roundedPolygon(ring(n, R, rng.pick([0, 180 / n])), R * rng.float(0.08, 0.3)) };
  }
  if (kind === 'pill') return { kind, item: place(rect(0, 0, 2 * R, R * 1.24, R * 0.62), 0, 0, rng.pick([0, 90])) };
  const n = rng.pick([3, 4, 5, 6]);
  return { kind, n, item: polar(R, n, [[1, rng.float(0.06, 0.14) * rng.pick([1, -1])]]) };
}

// four quarter-circle bites out of a square leave a concave four-point star
function concaveStar(s) {
  return subtract(rect(0, 0, 2 * s, 2 * s), ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([i, j]) => circle(i * s, j * s, s)));
}

// a band through the centre at some angle, optionally opening into a shape
function slit(rng, box) {
  const angle = rng.pick(box.kind === 'circle' ? [0, 90, 45, 30, 60] : [0, 90, 45]);
  const g = R * rng.float(0.07, 0.14);
  const twin = rng.chance(0.25) ? R * rng.float(0.25, 0.45) : 0;
  const parts = twin ? [rect(0, -twin, R * 4, g), rect(0, twin, R * 4, g)] : [rect(0, 0, R * 4, g)];
  if (rng.chance(0.65)) {
    const s = R * rng.float(0.16, 0.32);
    const kind = rng.weighted([['diamond', 2], ['circle', 1.5], ['star', 2], ['lens', 1.5]]);
    parts.push(
      kind === 'diamond' ? polygon([[s * 1.6, 0], [0, s], [-s * 1.6, 0], [0, -s]])
      : kind === 'circle' ? circle(0, 0, s)
      : kind === 'lens' ? ellipse(0, 0, s * 1.7, s * 0.7)
      : concaveStar(s),
    );
  }
  return parts.map((p) => place(p, 0, 0, angle));
}

// a thick bent stroke carved in; paired so the mark stays symmetric unless
// asymmetric marks are allowed
function channel(rng, opts) {
  const t = R * rng.float(0.09, 0.15);
  const steps = rng.weighted([[1, 1], [2, 3]]);
  let [x, y] = [R * rng.float(-0.4, 0), R * rng.float(-0.4, 0)];
  let heading = rng.pick([0, 45, 90, 135, 180, 225, 270, 315]);
  const pts = [[x, y]];
  for (let i = 0; i < steps; i++) {
    const len = R * rng.float(0.5, 0.95);
    x += Math.cos(rad(heading)) * len;
    y += Math.sin(rad(heading)) * len;
    pts.push([x, y]);
    heading += rng.pick([45, -45, 90, -90]);
  }
  const stroke = polyStroke(pts, t);
  const pairing = opts.loose ? rng.weighted([['none', 2], ['turn', 2], ['mirror', 0.5]]) : rng.weighted([['turn', 3], ['mirror', 0.6]]);
  if (pairing === 'turn') return [stroke, turned(stroke)];
  if (pairing === 'mirror') return [stroke, flipped(stroke)];
  return [stroke];
}

// bites out of the rim, evenly spaced
function bites(rng) {
  const k = rng.pick([2, 3, 4, 6]);
  const r = R * rng.float(0.14, 0.28);
  return ring(k, R * rng.float(0.85, 1.05), rng.pick([0, 180 / k])).map(([x, y]) => circle(x, y, r));
}

// an inner opening of a different shape than the container (never a target)
function hole(rng, box) {
  const s = R * rng.float(0.32, 0.55);
  const kinds = [['polygon', 2], ['lens', 1.5], ['slot', 1.5]];
  // a circle with a round or star-shaped hole is already everywhere
  if (box.kind !== 'circle') kinds.push(['circle', 2], ['star', 1.5]);
  const kind = rng.weighted(kinds);
  if (kind === 'circle') return [circle(0, 0, s)];
  if (kind === 'lens') return [place(ellipse(0, 0, s, s * 0.5), 0, 0, rng.pick([0, 90, 45]))];
  if (kind === 'slot') return [place(rect(0, 0, 2 * s, s * 0.64, s * 0.32), 0, 0, rng.pick([0, 90]))];
  if (kind === 'star') return [concaveStar(s * 0.9)];
  const n = rng.pick([3, 4, 6].filter((m) => m !== box.n));
  return [roundedPolygon(ring(n, s, rng.pick([0, 180 / n])), s * 0.2)];
}

// an S or Z cut straight through the centre, splitting the container in two
function zig(rng) {
  const g = R * rng.float(0.08, 0.14);
  const y1 = R * rng.float(0.12, 0.38);
  const a = R * rng.float(0.05, 0.4);
  const cut = polyStroke([[-R * 1.4, y1], [-a, y1], [a, -y1], [R * 1.4, -y1]], g / 2);
  return [rng.chance(0.5) ? cut : place(cut, 0, 0, 90)];
}

// A solid container with negative space carved out of it.
export function carve(rng, opts = {}) {
  const box = container(rng);
  const ops = rng.weighted([[1, 4], [2, 1]]);
  // bent channels and rim bites read as accidents; slits, openings and S cuts don't
  const pool = [['slit', 3], ['hole', 2], ['zig', 1.6]];
  const cutters = [];
  const used = new Set();
  for (let k = 0; k < ops; k++) {
    const op = rng.weighted(pool.filter(([name]) => !used.has(name)));
    used.add(op);
    cutters.push(
      ...(op === 'slit' ? slit(rng, box)
        : op === 'channel' ? channel(rng, opts)
        : op === 'bites' ? bites(rng)
        : op === 'hole' ? hole(rng, box)
        : zig(rng)),
    );
  }
  const item = roundCorners(subtract(box.item, ...cutters), U * rng.float(0.06, 0.18));
  return { item, symmetry: AUTO, limits: { tips: 0.7, minAspect: 0.5, smooth: true } };
}

// ------------------------------------------------------------------- pair

// One slab (maybe with a hook or a block on it) and its 180° turn, so the two
// halves interlock into an S or Z.
export function pair(rng) {
  const g = U * rng.float(0.25, 0.55);
  const h = R * rng.float(0.55, 0.85);
  const w = R * rng.float(1.05, 1.6);
  const lean = rng.weighted([[0, 1], [1, 2], [-1, 2]]) * h * rng.float(0.35, 0.95);
  const big = h * rng.float(0.3, 0.55);
  const small = h * rng.float(0.04, 0.14);
  const top = -g / 2 - h;
  const bottom = -g / 2;
  const x0 = -w / 2 + R * rng.float(-0.35, 0.35);
  const pts = [[x0, bottom], [x0 + w, bottom], [x0 + w + lean, top], [x0 + lean, top]];
  const radii = pts.map(() => rng.pick([big, small, small]));
  const parts = [roundedPolygon(pts, (i) => radii[i])];

  const extra = rng.weighted([['none', 1.5], ['hook', 2.5], ['block', 1.5]]);
  if (extra === 'hook') {
    // drops below the centre line at one end so the two halves lock together
    const hw = h * rng.float(0.45, 0.9);
    const drop = g + h * rng.float(0.3, 0.8);
    const hx = rng.chance(0.7) ? x0 + w - hw : x0;
    parts.push(roundedPolygon([[hx, bottom - h * 0.5], [hx + hw, bottom - h * 0.5], [hx + hw, bottom + drop], [hx, bottom + drop]], (i) => (i > 1 ? big * 0.8 : 0)));
  } else if (extra === 'block') {
    // a square perched on one end
    const s = h * rng.float(0.7, 1.05);
    const bx = rng.chance(0.5) ? x0 + lean + s / 2 : x0 + w + lean - s / 2;
    parts.push(rect(bx, top - s / 2 + h * 0.2, s, s, rng.pick([big, small]) * 0.6));
  }
  const fillet = small + U * 0.15;
  const piece = roundCorners(unite(parts), fillet);
  const item = roundCorners(unite(piece, turned(piece)), fillet);
  // when the halves merge they can trap a stray hole; a pair should be solid
  if (!solidOnly(item)) return null;
  return { item, symmetry: AUTO, limits: { minAspect: 0.55, smooth: true } };
}

// ------------------------------------------------------------------ block

// Two to four slabs (some leaning) stacked on a coarse grid, joined with
// fillets, sometimes with an arch cut under them. Mirrored unless asymmetric
// marks are allowed.
export function block(rng, opts = {}) {
  const mirrored = !opts.loose || rng.chance(0.35);
  const g = U * 0.8;
  const slabs = [];
  const count = rng.int(2, 4);
  for (let i = 0; i < count; i++) {
    const w = g * rng.int(1, 3);
    const h = g * rng.int(1, 2) * (rng.chance(0.3) ? 1.5 : 1);
    let cx;
    let cy;
    if (!slabs.length) [cx, cy] = [mirrored ? 0 : g * rng.int(-1, 1) * 0.5, 0];
    else {
      // overlap an existing slab so everything stays connected
      const base = rng.pick(slabs);
      cx = base.cx + g * 0.5 * rng.int(-2, 2) * ((base.w + w) / (2 * g));
      cy = base.cy + rng.pick([-1, 1]) * (base.h + h) * rng.float(0.35, 0.5);
      if (mirrored) cx = Math.abs(cx);
    }
    const lean = rng.chance(0.4) ? rng.pick([-1, 1]) * h * rng.float(0.4, 1) : 0;
    slabs.push({ cx, cy, w, h, lean });
  }
  let item = unite(
    slabs.map(({ cx, cy, w, h, lean }) =>
      polygon([[cx - w / 2 - lean / 2, cy + h / 2], [cx + w / 2 - lean / 2, cy + h / 2], [cx + w / 2 + lean / 2, cy - h / 2], [cx - w / 2 + lean / 2, cy - h / 2]]),
    ),
  );
  if (mirrored) item = unite(item, flipped(item));
  if (rng.chance(0.45)) {
    // an arch cut up from the lowest edge
    const lowest = Math.max(...slabs.map((s) => s.cy + s.h / 2));
    const aw = g * rng.float(0.35, 0.7);
    const ah = g * rng.float(0.6, 1.4);
    const ax = mirrored ? 0 : rng.pick(slabs).cx;
    item = subtract(item, rect(ax, lowest, aw, ah * 2, aw / 2));
  }
  item = roundCorners(item, U * rng.float(0.08, 0.4));
  return { item, symmetry: AUTO, limits: { balance: 0.08, minAspect: 0.5 } };
}

// ------------------------------------------------------------------ tetro

// A rounded pixel piece in one quadrant, mirrored into all four with a gap
// between them (mirrored, never spun, so it can't form a hooked cross).
export function tetro(rng) {
  const k = rng.weighted([[2, 2], [3, 3]]);
  // three cells at least: two make a plain pill
  const size = rng.int(3, Math.min(5, k * k - 1));
  const diagonal = rng.chance(0.5);
  const on = new Set();
  const key = (i, j) => `${i},${j}`;
  const seed = [rng.int(0, k - 1), rng.int(0, k - 1)];
  on.add(key(...seed));
  if (diagonal) on.add(key(seed[1], seed[0]));
  for (let guard = 0; on.size < size && guard < 80; guard++) {
    const [i, j] = rng.pick([...on]).split(',').map(Number);
    const [di, dj] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    const [ni, nj] = [i + di, j + dj];
    if (ni < 0 || nj < 0 || ni >= k || nj >= k) continue;
    on.add(key(ni, nj));
    if (diagonal) on.add(key(nj, ni));
  }
  if (on.size < 3) return null;
  const cell = U;
  const gap = cell * rng.float(0.12, 0.28);
  const piece = gridOutline((i, j) => on.has(key(i, j)), k, cell, rng.float(0.22, 0.45));
  if (!piece) return null;
  piece.translate([(k * cell) / 2 + gap / 2, (k * cell) / 2 + gap / 2]);
  const copies = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => piece.clone({ insert: false }).scale(sx, sy, ORIGIN));
  const item = copies[0];
  for (const c of copies.slice(1)) item.addChildren(c.removeChildren());
  return { item, symmetry: AUTO, limits: { freePieces: 8, minAspect: 0.6 } };
}

// ------------------------------------------------------------------ cloud

// Circles bunched onto a body and filleted together, filled or as an outline,
// now and then with two eyes.
export function cloud(rng) {
  const body = R * rng.float(0.55, 0.75);
  const balls = [[0, 0, body]];
  for (let i = rng.int(2, 4); i > 0; i--) {
    const a = rad(rng.float(-170, -10));
    const d = body * rng.float(0.55, 0.85);
    balls.push([Math.cos(a) * d, Math.sin(a) * d, body * rng.float(0.42, 0.7)]);
  }
  if (rng.chance(0.5)) balls.push([body * rng.float(0.3, 0.55), body * rng.float(0.3, 0.55), body * rng.float(0.45, 0.6)]);
  const mirror = balls.filter(([x]) => x !== 0).map(([x, y, r]) => [-x, y, r]);
  const all = [...balls, ...mirror];
  const fillet = U * rng.float(0.35, 0.8);
  const shape = (inset) => roundCorners(unite(all.map(([x, y, r]) => circle(x, y, r - inset))), fillet);
  let item = shape(0);
  if (rng.chance(0.55)) {
    const w = U * rng.float(0.2, 0.32);
    item = subtract(item, shape(w));
  }
  if (rng.chance(0.25)) {
    const ex = body * rng.float(0.22, 0.34);
    const eyes = [-1, 1].map((side) => ellipse(side * ex, 0, body * 0.1, body * 0.18));
    item = item.children?.length > 1 ? unite(item, ...eyes) : subtract(item, ...eyes);
  }
  return { item, symmetry: AUTO, limits: { freePieces: 6, minAspect: 0.6 } };
}
