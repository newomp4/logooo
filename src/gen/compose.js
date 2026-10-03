// Compositional families. Instead of recreating one particular logo, each
// picks from a small vocabulary (containers, cuts, slabs, pieces) and combines
// a few at random. Their symmetry is measured afterwards ('auto'), so the same
// rules can land on mirrored, rotational or merely balanced marks.
import { quad, place, roundedPolygon, ring, polar, gridOutline } from './geom.js';
import * as sd from './sdf.js';

const U = 10;
const R = U * 2;
const AUTO = 'auto';
const rad = (deg) => (deg * Math.PI) / 180;
const turn180 = (f) => (x, y) => f(-x, -y);
const flipX = (f) => (x, y) => f(-x, y);

// ------------------------------------------------------------- containers

function container(rng) {
  const kind = rng.weighted([['circle', 3], ['squircle', 3], ['polygon', 3], ['pill', 1.2], ['blob', 1.5]]);
  if (kind === 'circle') return { kind, f: sd.circle(R) };
  if (kind === 'squircle') {
    const aspect = rng.chance(0.7) ? 1 : rng.float(0.8, 0.95);
    return { kind, f: sd.shape(quad(R, R * aspect, rng.float(0.62, 0.92))) };
  }
  if (kind === 'polygon') {
    const n = rng.weighted([[6, 3], [4, 2], [8, 1.2], [3, 1], [5, 1]]);
    const pts = ring(n, R, rng.pick([0, 180 / n]));
    return { kind, n, f: sd.shape(roundedPolygon(pts, R * rng.float(0.08, 0.3))) };
  }
  if (kind === 'pill') {
    const f = sd.roundBox(R, R * 0.62, R * 0.62);
    return { kind, f: rng.chance(0.5) ? f : sd.move(f, 0, 0, 90) };
  }
  const n = rng.pick([3, 4, 5, 6]);
  return { kind, n, f: sd.shape(polar(R, n, [[1, rng.float(0.06, 0.14) * rng.pick([1, -1])]])) };
}

// a band through the centre at `angle`, optionally opening into a shape
function slit(rng, box) {
  const angle = rng.pick(box.kind === 'circle' ? [0, 90, 45, 30, 60] : [0, 90, 45]);
  const a = rad(angle);
  const g = R * rng.float(0.07, 0.14);
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const twin = rng.chance(0.25) ? R * rng.float(0.25, 0.45) : 0;
  const band = (x, y) => {
    const d = x * nx + y * ny;
    return twin ? Math.abs(Math.abs(d) - twin) - g / 2 : Math.abs(d) - g / 2;
  };
  if (!rng.chance(0.65)) return band;
  const s = R * rng.float(0.16, 0.32);
  const kind = rng.weighted([['diamond', 2], ['circle', 1.5], ['star', 2], ['lens', 1.5]]);
  let mid;
  if (kind === 'diamond') mid = sd.polygon([[s * 1.6, 0], [0, s], [-s * 1.6, 0], [0, -s]]);
  else if (kind === 'circle') mid = sd.circle(s);
  else if (kind === 'lens') mid = sd.ellipse(s * 1.7, s * 0.7);
  else mid = sd.cut(sd.roundBox(s, s), sd.union(...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([i, j]) => sd.circle(s, i * s, j * s))));
  return sd.union(band, sd.move(mid, 0, 0, angle));
}

// a thick bent stroke carved into the container; paired so it stays symmetric
// unless asymmetric marks are allowed
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
  const stroke = sd.path(pts, t * rng.float(0.5, 2), t);
  const pairing = opts.loose ? rng.weighted([['none', 2], ['turn', 2], ['mirror', 1]]) : rng.weighted([['turn', 2], ['mirror', 1]]);
  if (pairing === 'turn') return sd.union(stroke, turn180(stroke));
  if (pairing === 'mirror') return sd.union(stroke, flipX(stroke));
  return stroke;
}

// bites out of the rim, evenly spaced
function bites(rng) {
  const k = rng.pick([2, 3, 4, 6]);
  const r = R * rng.float(0.14, 0.28);
  const at = R * rng.float(0.85, 1.05);
  const offset = rng.pick([0, 180 / k]);
  return sd.union(...ring(k, at, offset).map(([x, y]) => sd.circle(r, x, y)));
}

// an inner opening of a different shape than the container (never a target)
function hole(rng, box) {
  const s = R * rng.float(0.32, 0.55);
  const kinds = [['polygon', 2], ['lens', 1.5], ['slot', 1.5]];
  // a circle with a round or star-shaped hole is already everywhere
  if (box.kind !== 'circle') kinds.push(['circle', 2], ['star', 1.5]);
  const kind = rng.weighted(kinds);
  if (kind === 'circle') return sd.circle(s);
  if (kind === 'lens') return sd.move(sd.ellipse(s, s * 0.5), 0, 0, rng.pick([0, 90, 45]));
  if (kind === 'slot') return sd.move(sd.roundBox(s, s * 0.32, s * 0.32), 0, 0, rng.pick([0, 90]));
  if (kind === 'star') {
    const q = s * 0.9;
    return sd.cut(sd.roundBox(q, q), sd.union(...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([i, j]) => sd.circle(q, i * q, j * q))));
  }
  const n = rng.pick([3, 4, 6].filter((m) => m !== box.n));
  return sd.shape(roundedPolygon(ring(n, s, rng.pick([0, 180 / n])), s * 0.2));
}

// an S or Z cut straight through the centre, splitting the container in two
function zig(rng) {
  const g = R * rng.float(0.08, 0.14);
  const y1 = R * rng.float(0.12, 0.38);
  const a = R * rng.float(0.05, 0.4);
  const pts = [[-R * 1.4, y1], [-a, y1], [a, -y1], [R * 1.4, -y1]];
  const cutter = sd.path(pts, g * rng.float(0.5, 2.5), g / 2);
  return rng.chance(0.5) ? cutter : sd.move(cutter, 0, 0, 90);
}

// A solid container with negative space carved out of it.
export function carve(rng, opts = {}) {
  const box = container(rng);
  const soft = U * rng.float(0.06, 0.16);
  const ops = rng.weighted([[1, 4], [2, 1]]);
  const pool = [['slit', 3], ['channel', 2.5], ['bites', 0.6], ['hole', 2], ['zig', 1.8]];
  let f = box.f;
  const used = new Set();
  for (let k = 0; k < ops; k++) {
    const op = rng.weighted(pool.filter(([name]) => !used.has(name)));
    used.add(op);
    const cutter =
      op === 'slit' ? slit(rng, box)
      : op === 'channel' ? channel(rng, opts)
      : op === 'bites' ? bites(rng)
      : op === 'hole' ? hole(rng, box)
      : zig(rng);
    f = sd.cut(f, cutter, soft);
  }
  const item = sd.trace(f);
  return item && { item, symmetry: AUTO, limits: { ...sd.TRACED, tips: 0.7, minAspect: 0.5 } };
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
  let piece = sd.shape(roundedPolygon(pts, (i) => radii[i]));

  const extra = rng.weighted([['none', 1.5], ['hook', 2.5], ['block', 1.5]]);
  if (extra === 'hook') {
    // drops below the centre line at one end so the two halves lock together
    const hw = h * rng.float(0.45, 0.9);
    const drop = g + h * rng.float(0.3, 0.8);
    const right = rng.chance(0.7);
    const hx = right ? x0 + w - hw : x0;
    const hook = sd.shape(roundedPolygon([[hx, bottom - 2], [hx + hw, bottom - 2], [hx + hw, bottom + drop], [hx, bottom + drop]], (i) => (i > 1 ? big * 0.8 : 0.01)));
    piece = sd.blend(small * 2 + 0.5, piece, hook);
  } else if (extra === 'block') {
    // a square perched on one end
    const s = h * rng.float(0.7, 1.05);
    const bx = rng.chance(0.5) ? x0 + lean + s / 2 : x0 + w + lean - s / 2;
    piece = sd.blend(small * 2 + 0.5, piece, sd.roundBox(s / 2, s / 2, rng.pick([big, small]) * 0.6, bx, top - s / 2 + 1));
  }
  const item = sd.trace(sd.union(piece, turn180(piece)));
  // when the halves merge they can trap a stray hole; a pair should be solid
  if (!item || item.reorient(false, true).children.some((c) => c.area < 0)) return null;
  return { item, symmetry: AUTO, limits: { ...sd.TRACED, minAspect: 0.55 } };
}

// ------------------------------------------------------------------ block

// Two to four slabs (some leaning) stacked on a coarse grid, joined with small
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
  const corner = U * rng.float(0.06, 0.2);
  const shapes = slabs.map(({ cx, cy, w, h, lean }) => {
    const pts = [[cx - w / 2 - lean / 2, cy + h / 2], [cx + w / 2 - lean / 2, cy + h / 2], [cx + w / 2 + lean / 2, cy - h / 2], [cx - w / 2 + lean / 2, cy - h / 2]];
    return sd.shape(roundedPolygon(pts, corner));
  });
  let f = sd.blend(U * rng.float(0.1, 0.35), ...shapes);
  if (mirrored) {
    const half = f;
    f = sd.union(half, flipX(half));
  }
  if (rng.chance(0.45)) {
    // an arch cut up from the lowest edge
    const lowest = Math.max(...slabs.map((s) => s.cy + s.h / 2));
    const aw = g * rng.float(0.35, 0.7);
    const ah = g * rng.float(0.6, 1.4);
    const ax = mirrored ? 0 : rng.pick(slabs).cx;
    f = sd.cut(f, sd.roundBox(aw / 2, ah, aw / 2, ax, lowest), corner);
  }
  const item = sd.trace(f);
  return item && { item, symmetry: AUTO, limits: { ...sd.TRACED, balance: 0.08, minAspect: 0.5 } };
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
  const copies = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => {
    const c = piece.clone({ insert: false });
    c.scale(sx, sy, [0, 0]);
    return c;
  });
  const item = copies[0];
  for (const c of copies.slice(1)) item.addChildren(c.removeChildren());
  return { item, symmetry: AUTO, limits: { freePieces: 8, minAspect: 0.6 } };
}

// ------------------------------------------------------------------ cloud

// Lumps melted onto a body, drawn as a filled shape or an outline, sometimes
// with two eyes.
export function cloud(rng) {
  const body = R * rng.float(0.55, 0.75);
  const lumps = [];
  const count = rng.int(2, 4);
  for (let i = 0; i < count; i++) {
    const a = rad(rng.float(-170, -10));
    const d = body * rng.float(0.55, 0.9);
    const r = body * rng.float(0.4, 0.7);
    lumps.push(sd.circle(r, Math.cos(a) * d, Math.sin(a) * d));
  }
  if (rng.chance(0.5)) lumps.push(sd.circle(body * rng.float(0.4, 0.6), body * rng.float(0.3, 0.6), body * rng.float(0.3, 0.6)));
  const half = sd.blend(U * rng.float(0.2, 0.5), sd.circle(body), ...lumps);
  let f = sd.union(half, flipX(half));
  const outline = rng.chance(0.6);
  const w = U * rng.float(0.18, 0.3);
  if (outline) {
    const filled = f;
    f = (x, y) => Math.abs(filled(x, y) + w) - w;
  }
  if (rng.chance(0.5)) {
    const ex = body * rng.float(0.22, 0.34);
    const eyes = sd.union(sd.ellipse(body * 0.1, body * 0.18, ex, 0), sd.ellipse(body * 0.1, body * 0.18, -ex, 0));
    f = outline ? sd.union(f, eyes) : sd.cut(f, eyes);
  }
  const item = sd.trace(f);
  return item && { item, symmetry: AUTO, limits: { ...sd.TRACED, freePieces: 6, minAspect: 0.6 } };
}
