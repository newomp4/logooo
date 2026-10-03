// Each family turns a seeded rng into a symmetric paper.js shape.
// They return null when a roll doesn't produce something worth keeping.
import {
  K, ORIGIN, Path, Point, circle, ellipse, rect, quad, place, shear, leaf, drop, starPoints, roundedPolygon, polar,
  grid, ring, group, orbit,
  unite, xor, subtract, intersect, clearance, reach, fitInside, gridOutline, compound,
} from './geom.js';
import { capsule, arcStroke, annulus, polygon, wedge, roundCorners } from './shapes.js';
import { carve, pair, block, tetro, cloud } from './compose.js';
import { form, formPlan } from './procedural.js';

const U = 10; // base spacing; everything is rescaled at the end

const circles = (pts, r) => pts.map(([x, y]) => circle(x, y, r));

// ------------------------------------------------------------------ bloom
// A frame of overlapping circles with an opening, like a scalloped seal.

function bloom(rng) {
  const layout = rng.weighted([['square3', 5], ['square4', 3], ['round', 2.5]]);
  let pts;
  let fill;
  let r;
  let symmetry = 'D4';

  if (layout === 'round') {
    const n = rng.weighted([[8, 4], [12, 2], [6, 1.2], [10, 1], [16, 0.6]]);
    const R = U * 1.5;
    r = 2 * R * Math.sin(Math.PI / n) * rng.float(0.56, 0.74);
    pts = ring(n, R, rng.chance(0.5) ? 180 / n : 0);
    fill = circle(0, 0, R);
    symmetry = `D${n}`;
  } else {
    const n = layout === 'square3' ? 3 : 4;
    const edge = ((n - 1) / 2) * U;
    pts = grid(n, n, U).filter(([x, y]) => Math.abs(x) === edge || Math.abs(y) === edge);
    r = U * rng.float(0.57, 0.72);
    fill = rect(0, 0, 2 * edge, 2 * edge);
    const cornerScale = rng.chance(0.3) ? rng.pick([0.86, 1.14]) : 1;
    pts = pts.map(([x, y]) => [x, y, Math.abs(x) === edge && Math.abs(y) === edge ? cornerScale : 1]);
  }

  const scallops = unite(pts.map(([x, y, s = 1]) => circle(x, y, r * s)));
  let kind = rng.weighted([['circle', 5], ['natural', 3], ['quad', 2], ['spark', 1.2]]);
  if (kind === 'natural' && (scallops.contains(ORIGIN) || reach(scallops) < U * 0.3)) kind = 'circle';

  let body;
  let opening;
  if (kind === 'natural') {
    // the gap the circles leave in the middle becomes the opening
    body = scallops;
    opening = reach(scallops);
  } else {
    const solid = unite(scallops, fill);
    const wall = U * rng.float(0.26, 0.42);
    const room = reach(solid) - wall;
    const scale = rng.float(0.55, 1.6);
    let hole;
    if (kind === 'circle') hole = circle(0, 0, room * Math.min(scale, 1));
    else {
      const template = kind === 'quad'
        ? place(quad(room, room, rng.float(0.15, 0.95)), 0, 0, rng.pick([0, 45]))
        : place(quad(room * 1.3, room * 1.3, -rng.float(0.55, 0.85)), 0, 0, rng.pick([0, 45]));
      hole = fitInside(solid, template, wall, scale);
    }
    if (!hole) return null;
    body = subtract(solid, hole);
    opening = reach(hole);
  }

  if (rng.chance(kind === 'natural' ? 0.6 : 0.35)) {
    const gap = U * rng.float(0.22, 0.34);
    const dotR = (opening - gap) * rng.float(0.75, 1);
    if (dotR > U * 0.2) {
      const dot = rng.chance(0.7) ? circle(0, 0, dotR) : place(quad(dotR * 1.15, dotR * 1.15, rng.pick([0.2, 0.8, -0.7])), 0, 0, rng.pick([0, 45]));
      body = unite(body, dot);
    }
  }
  return { item: body, symmetry };
}

// ---------------------------------------------------------------- lattice
// Grids of circles where overlaps cancel out or get punched through.

function lattice(rng) {
  const mode = rng.weighted([['dual', 4], ['parity', 3], ['scales', 2], ['columns', 1.5]]);
  const n = rng.weighted([[3, 6], [4, 2.5], [2, 1.2]]);
  let symmetry = 'D4';
  let item;

  if (mode === 'dual') {
    let a = grid(n, n, U);
    if (n === 3 && rng.chance(0.25)) a = a.filter(([x, y]) => x || y);
    const rA = U * rng.float(0.56, 0.72);
    const rB = U * rng.float(0.42, 0.74);
    const A = unite(circles(a, rA));
    const B = unite(circles(grid(n - 1, n - 1, U), rB));
    item = rng.chance(0.6) ? A.exclude(B, { insert: false }) : subtract(A, B);
  } else if (mode === 'parity') {
    const r = U * rng.float(0.58, 0.82);
    const parts = circles(grid(n, n, U), r);
    if (n > 2 && rng.chance(0.35)) parts.push(...circles(grid(n - 1, n - 1, U), r * rng.float(0.55, 1)));
    item = xor(parts);
  } else if (mode === 'scales') {
    const rows = rng.pick([[3, 2, 3], [2, 3, 2], [3, 2, 3, 2, 3], [4, 3, 4]]);
    const vy = U * rng.float(0.62, 0.9);
    const r = U * rng.float(0.55, 0.72);
    const parts = rows.flatMap((count, k) =>
      circles(grid(count, 1, U).map(([x]) => [x, (k - (rows.length - 1) / 2) * vy]), r),
    );
    item = xor(parts);
    symmetry = 'D2';
  } else {
    const rA = U * rng.float(0.55, 0.7);
    const rB = U * rng.float(0.5, 0.72);
    const A = unite(circles(grid(3, 3, U), rA));
    const B = unite(circles(grid(2, 3, U), rB));
    item = A.exclude(B, { insert: false });
    if (rng.chance(0.5)) item.rotate(90, ORIGIN);
    symmetry = 'D2';
  }
  return { item, symmetry };
}

// ------------------------------------------------------------------ orbit
// Circles arranged around a center: crescents, bitten moons, rosettes.

function orbitFamily(rng) {
  const preset = rng.weighted([['crescents', 2], ['chain', 2], ['rosette', 3]]);
  const n = rng.weighted([[4, 6], [6, 1.6], [8, 1], [3, 0.8], [5, 0.6]]);
  const offset = rng.chance(0.5) ? 180 / n : 0;
  const chord = U * 1.414;
  const R1 = chord / (2 * Math.sin(Math.PI / n));
  let symmetry = `D${n}`;
  let item;

  if (preset === 'crescents') {
    const r = R1 * rng.float(0.6, 0.86);
    const R2 = R1 + r * rng.float(0.9, 1.5);
    const parts = [...circles(ring(n, R1, offset), r), ...circles(ring(n, R2, offset), r * rng.float(0.85, 1.1))];
    if (rng.chance(0.4)) parts.push(circle(0, 0, R1 * rng.float(0.25, 0.5)));
    item = xor(parts);
  } else if (preset === 'bites') {
    const R = R1 * rng.float(1.4, 1.8);
    const r = R1 * rng.float(0.6, 0.85);
    const moons = subtract(
      unite(circles(ring(n, R, offset), r)),
      ...circles(ring(n, R - r * rng.float(0.55, 1), offset), r * rng.float(0.75, 1.05)),
    );
    const core = circle(0, 0, R1 * rng.float(0.4, 0.7));
    if (!moons || moons.isEmpty() || clearance(core, moons) < U * 0.25) return null;
    item = unite(moons, core);
  } else if (preset === 'chain') {
    const R = R1 * 1.4;
    const r = 2 * R * Math.sin(Math.PI / n) * rng.float(0.56, 0.8);
    const parts = circles(ring(n, R, offset), r);
    if (rng.chance(0.55)) parts.push(circle(0, 0, (R - r) * rng.float(0.6, 1.25)));
    item = xor(parts);
  } else if (preset === 'rosette') {
    const r = U * 1.2;
    const parts = circles(ring(n, r * rng.float(0.45, 0.88), offset), r);
    if (rng.chance(0.3)) parts.push(circle(0, 0, r * rng.float(0.3, 0.6)));
    item = xor(parts);
  } else {
    // swirl: every moon is bitten on the same side, so the mark spins
    const R = R1 * rng.float(1.2, 1.6);
    const r = R1 * rng.float(0.55, 0.8);
    const turn = (360 / n) * rng.float(0.12, 0.3) * rng.pick([1, -1]);
    const shift = rng.float(0.85, 1.1);
    const moons = ring(n, R, offset).map(([x, y]) => {
      const bite = circle(x, y, r * shift);
      bite.rotate(turn, ORIGIN);
      return subtract(circle(x, y, r), bite);
    });
    const parts = [unite(moons)];
    if (rng.chance(0.6)) parts.push(circle(0, 0, R1 * rng.float(0.3, 0.55)));
    item = unite(parts);
    symmetry = `C${n}`;
  }
  return { item, symmetry };
}

// ------------------------------------------------------------------ spark
// Concave four-point stars on their own, in clusters, or cut out of a solid.

function spark(rng) {
  // the bold cut-out reads best; spiky clusters are kept rare
  const preset = rng.weighted([['aperture', 3], ['single', 1.2], ['cluster', 1], ['halo', 0.5]]);
  const pinch = -rng.float(0.78, 0.93);
  let symmetry = 'D4';
  let limits;
  let item;

  if (preset === 'single') {
    const rx = U * 2;
    const ry = rx * rng.weighted([[1, 1], [rng.float(0.45, 0.8), 2]]);
    item = quad(rx, ry, pinch);
    if (rng.chance(0.65)) {
      shear(item, rng.float(0.18, 0.5) * rng.pick([1, -1]));
      symmetry = 'C2';
    } else if (ry !== rx) {
      symmetry = 'D2';
    }
    limits = { minFill: 0.05, minFeature: 0.6, minNodes: 4, tips: 0.25 };
  } else if (preset === 'cluster') {
    const d = U;
    const s = d * rng.float(1.0, 1.35);
    const stars = grid(2, 2, 2 * d).map(([x, y]) => place(quad(s, s, pinch), x, y));
    if (rng.chance(0.7)) stars.push(circle(0, 0, d * rng.float(0.3, 0.55)));
    item = unite(stars);
    limits = { minFill: 0.1, minFeature: 0.8, tips: 0.3 };
  } else if (preset === 'halo') {
    const n = rng.pick([4, 6, 8]);
    const R = U * 1.6;
    const len = U * rng.float(0.7, 1.1);
    const star = quad(len, len * rng.float(0.45, 0.8), pinch);
    const stars = ring(n, R).map(([x, y]) => {
      const s = star.clone({ insert: false });
      s.rotate((Math.atan2(y, x) * 180) / Math.PI, ORIGIN);
      return place(s, x, y);
    });
    stars.push(circle(0, 0, (R - len) * rng.float(0.55, 0.85)));
    item = unite(stars);
    symmetry = `D${n}`;
    limits = { minFill: 0.08, minFeature: 0.8, tips: 0.3 };
  } else {
    const base = place(quad(U * 2, U * 2, rng.weighted([[K, 3], [rng.float(0.65, 0.92), 3]])), 0, 0, rng.chance(0.25) ? 45 : 0);
    const wall = U * rng.float(0.3, 0.55);
    const cut = fitInside(base, place(quad(U * 3, U * 3, -rng.float(0.55, 0.85)), 0, 0, rng.pick([0, 45])), wall);
    if (!cut) return null;
    item = subtract(base, cut);
    if (rng.chance(0.35)) {
      const dot = circle(0, 0, reach(cut) * rng.float(0.35, 0.6));
      if (clearance(dot, cut) > U * 0.2) item = unite(item, dot);
    }
  }
  return { item, symmetry, limits: limits ?? { tips: 0.5 } };
}

// ------------------------------------------------------------------- ring
// Squircle or circle bands with shaped openings, dots and slots.

function band(rng) {
  const R = U * 2;
  const outerBulge = rng.weighted([[K, 3], [rng.float(0.64, 0.92), 4]]);
  const outerRot = outerBulge > 0.6 && rng.chance(0.35) ? 45 : 0;
  const outer = place(quad(R, R, outerBulge), 0, 0, outerRot);
  const wall = R * rng.float(0.15, 0.3);

  const kind = rng.weighted([['same', 2], ['circle', 3], ['quad', 2.5]]);
  const template =
    kind === 'same' ? place(quad(R, R, outerBulge), 0, 0, outerRot)
    : kind === 'circle' ? circle(0, 0, R)
    : place(quad(R * 1.2, R * 1.2, rng.float(0.2, 0.95)), 0, 0, rng.pick([0, 45]));
  const hole = fitInside(outer, template, wall);
  if (!hole) return null;
  let item = subtract(outer, hole);

  const extra = rng.weighted([['none', 3], ['dot', 3], ['inner', 1.2], ['slots', 1.2]]);
  // a round band with a round hole and nothing else is just the letter O
  if (!outerRot && kind !== 'quad' && extra === 'none') return null;
  if (extra === 'dot' || extra === 'inner') {
    const gap = wall * rng.float(0.9, 1.6);
    const core = fitInside(hole, rng.chance(0.6) ? circle(0, 0, R) : place(quad(R, R, rng.float(0.2, 0.9)), 0, 0, rng.pick([0, 45])), gap, rng.float(0.5, 1));
    if (core) {
      const coreHole = extra === 'inner' ? fitInside(core, core.clone({ insert: false }), wall) : null;
      item = unite(item, coreHole ? subtract(core, coreHole) : core);
    }
  } else if (extra === 'slots') {
    const g = R * rng.float(0.12, 0.2);
    const angle = outerRot ? 45 : rng.pick([0, 45]);
    const bars = [rect(0, 0, g, R * 3), rect(0, 0, R * 3, g)].map((b) => place(b, 0, 0, angle));
    item = subtract(item, ...bars);
  }
  return { item, symmetry: 'D4' };
}

// ------------------------------------------------------------------ pixel
// Symmetric bitmaps on a small grid, as squares, soft blocks or dots.

function pixel(rng) {
  const n = rng.weighted([[5, 2], [7, 3], [9, 1.5], [6, 1.5], [8, 1]]);
  // mirror symmetry only: rotation-only bitmaps can land on hooked-cross shapes
  const sym = rng.weighted([['D4', 6], ['D2', 1.5]]);
  const p = rng.float(0.38, 0.6);
  const c = (n - 1) / 2;
  const images = (i, j) => {
    const [a, b] = [i - c, j - c];
    const pts =
      sym === 'D4'
        ? [[a, b], [-a, b], [a, -b], [-a, -b], [b, a], [-b, a], [b, -a], [-b, -a]]
        : [[a, b], [-a, b], [a, -b], [-a, -b]];
    return pts.map(([x, y]) => `${x + c},${y + c}`);
  };

  const decided = new Map();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const orb = images(i, j);
      const key = orb.slice().sort()[0];
      if (!decided.has(key)) decided.set(key, rng.chance(p));
      decided.set(`${i},${j}`, decided.get(key));
    }
  }
  const on = (i, j) => decided.get(`${i},${j}`);

  let count = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) count += on(i, j) ? 1 : 0;
  const ratio = count / (n * n);
  const edgeRow = Array.from({ length: n }, (_, i) => on(i, 0)).some(Boolean);
  const edgeCol = Array.from({ length: n }, (_, j) => on(0, j)).some(Boolean);
  if (ratio < 0.3 || ratio > 0.7 || !edgeRow || !edgeCol) return null;

  const style = rng.weighted([['sharp', 5], ['soft', 2.5], ['dots', 1.2]]);
  let item;
  if (style === 'dots') {
    const r = 0.5 * U * rng.float(0.78, 0.92);
    const dots = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) if (on(i, j)) dots.push(circle((i - c) * U, (j - c) * U, r));
    }
    item = compound(dots);
  } else {
    item = gridOutline(on, n, U, style === 'soft' ? rng.float(0.22, 0.5) : 0);
  }
  return { item, symmetry: sym, limits: { minFill: 0.22, maxFill: 0.8, minFeature: 1 } };
}

// ------------------------------------------------------------------ field
// Halftone-style dot fields whose size follows a symmetric falloff.

function field(rng) {
  const n = rng.weighted([[3, 2], [4, 3], [5, 1.5]]);
  const law = rng.weighted([['radial', 3], ['diagonal', 3], ['ring', 1.2]]);
  const shape = rng.weighted([['ellipse', 4], ['circle', 3], ['spark', 1], ['squircle', 0.6]]);
  const invert = rng.chance(law === 'radial' ? 0.35 : 0.5);
  const gamma = rng.float(0.7, 1.6);
  const half = ((n - 1) / 2) * U;
  const maxS = U * rng.float(0.42, 0.5);
  const minS = U * rng.float(0.12, 0.2);
  const aspect = rng.float(1.3, 1.9);

  const dots = [];
  for (const [x, y] of grid(n, n, U)) {
    let t;
    if (law === 'radial') t = Math.hypot(x, y) / (half * Math.SQRT2);
    else if (law === 'diagonal') t = Math.abs(x + y) / (2 * half);
    else if (law === 'axis') t = Math.abs(x) / half;
    else t = Math.min(1, Math.abs(Math.hypot(x, y) / (half * Math.SQRT2) - 0.62) / 0.62);
    if (invert) t = 1 - t;
    const s = maxS - (maxS - minS) * t ** gamma;
    if (s < U * 0.12) continue;

    const along = law === 'diagonal' ? -45 : law === 'axis' ? 90 : (Math.atan2(y, x) * 180) / Math.PI;
    if (shape === 'circle') dots.push(circle(x, y, s));
    else if (shape === 'ellipse') dots.push(ellipse(x, y, Math.min(s * aspect, U * 0.68), s / Math.sqrt(aspect), along));
    else if (shape === 'spark') dots.push(place(quad(s * 1.5, s * 1.5, -0.75), x, y, law === 'radial' ? 0 : 45));
    else dots.push(place(quad(s, s, 0.85), x, y, law === 'diagonal' ? 45 : 0));
  }
  if (dots.length < 5) return null;

  // shrink everything until no two dots touch
  for (let pass = 0; pass < 6; pass++) {
    const touching = dots.some((a, i) => dots.some((b, j) => j > i && a.bounds.intersects(b.bounds) && a.intersects(b)));
    if (!touching) break;
    for (const dot of dots) dot.scale(0.88, dot.bounds.center);
  }
  const diagonal = law === 'diagonal';
  return { item: compound(dots), symmetry: diagonal ? 'D2' : 'D4', axis: diagonal ? 45 : 0, limits: { minFill: 0.12, minFeature: 0.9, minPart: 10, freePieces: 16 } };
}

// ------------------------------------------------------------------ tiles
// Bauhaus-style grids of squares, quarter discs, halves and leaves.

function motif(kind) {
  const h = U / 2;
  const cell = rect(0, 0, U, U);
  switch (kind) {
    case 'full': return cell;
    case 'quarter': return intersect(circle(-h, -h, U), cell);
    case 'arch': return subtract(cell, circle(-h, -h, U));
    case 'half': return intersect(circle(0, h, h), cell);
    case 'leaf': return intersect(circle(-h, -h, U), circle(h, h, U));
    case 'tri': return new Path({ segments: [[-h, -h], [h, -h], [-h, h]], closed: true });
    default: return null;
  }
}

function tiles(rng) {
  const n = rng.weighted([[2, 3], [3, 3], [4, 2]]);
  // pinwheels only on 2×2: with cells on the axes, spun pieces can form a hooked cross
  const sym = n === 2 && rng.chance(0.6) ? 'C4' : 'D4';
  const mats = group(4, sym === 'D4');
  // a small palette of motifs keeps each mark coherent
  const all = [['quarter', 4], ['arch', 1.5], ['half', 2], ['leaf', 1.5]];
  if (sym === 'D4') all.push(['full', 2], ['tri', 1]);
  const palette = [];
  while (palette.length < rng.weighted([[2, 3], [3, 2]])) {
    const k = rng.weighted(all);
    if (!palette.some(([p]) => p === k)) palette.push([k, 1]);
  }
  const kinds = [...palette, ['empty', 0.35 * palette.length]];
  const cellOf = (p) => `${Math.floor(p.x / U + n / 2)},${Math.floor(p.y / U + n / 2)}`;
  const decided = new Set();
  const byCell = new Map();
  const used = new Set();

  for (const [x, y] of grid(n, n, U)) {
    if (decided.has(cellOf({ x, y }))) continue;
    for (const m of mats) decided.add(cellOf(m.transform(new Point(x, y))));
    const kind = rng.weighted(kinds);
    const shape = motif(kind);
    if (!shape) continue;
    used.add(kind);
    for (const img of orbit(place(shape, x, y, 90 * rng.int(0, 3)), mats)) {
      const key = cellOf(img.bounds.center);
      byCell.set(key, [...(byCell.get(key) ?? []), img]);
    }
  }
  if (!byCell.size || [...used].every((k) => k === 'full')) return null;

  // pieces never overlap across cells, so the union must keep every bit of area
  const pieces = [...byCell.values()].map((list) => unite(list));
  const expected = pieces.reduce((sum, p) => sum + Math.abs(p.area), 0);
  const item = unite(pieces);
  if (!item || Math.abs(Math.abs(item.reorient(false, true).area) - expected) > expected * 0.004) return null;
  return { item, symmetry: sym, limits: { minFill: 0.28, maxFill: 0.85 } };
}

// ------------------------------------------------------------------ petal
// Almond leaves or teardrops fanned around a center.

function petal(rng) {
  const n = rng.weighted([[4, 4], [6, 3], [8, 1.6], [5, 1.4], [3, 1.2]]);
  const kind = rng.weighted([['leaf', 4], ['drop', 3]]);
  const L = U * 2;
  const overlap = rng.chance(0.55);
  const start = overlap ? -L * rng.float(0.02, 0.14) : L * rng.float(0.16, 0.3);
  const twist = rng.chance(0.3) ? rng.float(14, 32) * rng.pick([1, -1]) : 0;
  const outward = kind === 'leaf' || rng.chance(0.65);

  let shape;
  if (kind === 'leaf') shape = leaf(L, L * rng.float(0.36, 0.62));
  else {
    shape = drop(L, L * rng.float(0.22, 0.34));
    if (!outward) shape.scale(-1, 1, new Point(L / 2, 0));
  }
  shape.translate(new Point(start, 0));
  if (twist) shape.rotate(twist, new Point(Math.max(start, 0), 0));

  const petals = orbit(shape, group(n, false));
  let item = unite(petals);
  const centre = rng.weighted([['none', 3], ['dot', 2], ['hole', overlap ? 2 : 0]]);
  if (centre === 'dot' && !overlap) {
    const dot = circle(0, 0, start * rng.float(0.45, 0.75));
    if (clearance(dot, item) > U * 0.25) item = unite(item, dot);
  } else if (centre === 'dot' || centre === 'hole') {
    const hole = circle(0, 0, L * rng.float(0.1, 0.2));
    item = subtract(item, hole);
  }
  return { item, symmetry: twist ? `C${n}` : `D${n}`, limits: { tips: 0.4, minFill: 0.12 } };
}

// ------------------------------------------------------------------ spoke
// Asterisks and suns built from rounded bars.

function spoke(rng) {
  const n = rng.weighted([[6, 3], [8, 2.5], [4, 1.5], [3, 1.5], [5, 1.2], [12, 0.6]]);
  const R = U * 2;
  const w = R * (n >= 8 ? rng.float(0.16, 0.26) : rng.float(0.22, 0.36));
  const end = rng.weighted([['round', 4], ['soft', 1.5], ['taper', 2]]);
  const hub = rng.chance(0.35);
  const inner = hub ? R * rng.float(0.36, 0.5) : 0;

  let arm;
  if (end === 'taper') {
    arm = drop(R - inner, w * 0.62);
    arm.translate(new Point(inner, 0));
  } else {
    arm = rect((inner + R) / 2, 0, R - inner, w, end === 'round' ? w / 2 : w * 0.18);
  }
  const offset = n === 4 && rng.chance(0.5) ? 45 : 0;
  const arms = orbit(place(arm, 0, 0, offset), group(n, false));
  let item = unite(arms);

  if (hub) {
    const gap = U * rng.float(0.25, 0.4);
    const core = circle(0, 0, inner - gap);
    item = rng.chance(0.5) ? unite(item, core) : unite(item, subtract(core, circle(0, 0, (inner - gap) * rng.float(0.4, 0.6))));
  } else if (n === 4 || rng.chance(0.4)) {
    // a bare four-arm plus reads as a medical cross, so it always gets an opening
    item = subtract(item, circle(0, 0, w * rng.float(0.32, 0.45)));
  }
  return { item, symmetry: `D${n}`, limits: { tips: end === 'taper' ? 0.4 : 1, minFill: 0.12 } };
}

// ------------------------------------------------------------------ badge
// Rounded stars and seals, plain or with an opening.

function badge(rng) {
  const n = rng.weighted([[8, 3], [6, 2], [12, 2], [5, 1.5], [10, 1], [4, 1], [16, 0.7]]);
  const R = U * 2;
  const depth = n <= 5 ? rng.float(0.48, 0.72) : n <= 8 ? rng.float(0.7, 0.86) : rng.float(0.8, 0.9);
  const tip = R * rng.float(0.06, 0.2);
  const valley = R * rng.float(0.04, 0.16);
  const base = roundedPolygon(starPoints(n, R, R * depth), (i) => (i % 2 ? valley : tip));

  // a seal with a round hole reads as a gear, so openings stay occasional
  const inner = rng.weighted([['none', 3], ['spark', 1.2], ['hole', 0.8], ['dot', 0.6]]);
  let item = base;
  if (inner !== 'none') {
    const wall = R * rng.float(0.16, 0.28);
    const template = inner === 'spark' ? place(quad(R, R, -rng.float(0.6, 0.8)), 0, 0, rng.pick([0, 45])) : circle(0, 0, R);
    const hole = fitInside(base, template, wall, rng.float(0.6, 1));
    if (!hole) return null;
    item = subtract(base, hole);
    if (inner === 'dot') {
      const dot = circle(0, 0, reach(hole) * rng.float(0.4, 0.62));
      item = unite(item, dot);
    }
  }
  return { item, symmetry: `D${n}`, limits: { tips: 0.6 } };
}

// ----------------------------------------------------------------- stripe
// A solid shape sliced into bands, or striped on one side only (a sunset).

function stripe(rng) {
  const R = U * 2;
  const base = rng.weighted([['circle', 3], ['squircle', 2.5], ['soft', 2], ['pill', 1.2], ['diamond', 1], ['badge', 1]]);
  let shape;
  let angles = [0, 90, 45];
  if (base === 'circle') {
    shape = circle(0, 0, R);
    angles = [0, 90, 45, 30, 60, 0];
  } else if (base === 'squircle') shape = quad(R, R, rng.float(0.72, 0.95));
  else if (base === 'soft') {
    shape = polar(R, 4, [[1, rng.float(0.06, 0.16) * rng.pick([1, -1])], [2, rng.float(-0.05, 0.05)]]);
  } else if (base === 'pill') {
    const h = R * rng.float(1.1, 1.5);
    shape = rect(0, 0, 2 * R, h, h / 2);
    if (rng.chance(0.5)) shape.rotate(90, ORIGIN);
    angles = [0, 90];
  } else if (base === 'diamond') shape = place(quad(R, R, rng.float(0.7, 0.88)), 0, 0, 45);
  else shape = roundedPolygon(starPoints(8, R, R * rng.float(0.82, 0.9)), R * 0.08);

  const sunset = rng.chance(0.25);
  const bands = sunset ? rng.int(2, 4) : rng.weighted([[2, 1], [3, 2], [4, 2.5], [5, 2], [6, 1.2]]);
  const angle = rng.pick(angles);
  const gap = R * rng.float(0.07, 0.17);
  // < 0 squeezes the middle bands, > 0 widens them
  const swell = rng.float(-0.5, 0.7);
  const place01 = (t) => R * (swell * Math.sin((t * Math.PI) / 2) + (1 - swell) * t);

  const cuts = [];
  if (sunset) for (let i = 0; i < bands; i++) cuts.push(place01(i / bands));
  else for (let i = 1; i < bands; i++) cuts.push(place01(-1 + (2 * i) / bands));
  const bars = cuts.map((y) => place(rect(0, y, R * 4, gap), 0, 0, angle));
  const item = subtract(shape, ...bars);
  return { item, symmetry: sunset ? 'D1' : 'D2', axis: angle };
}

// ------------------------------------------------------------------- soft
// Rounded, slightly irregular shapes that stay symmetric: lobed curves from
// a few harmonics, or balls that melt into each other.

function softWave(rng) {
  const n = rng.weighted([[3, 1.2], [4, 2], [5, 2], [6, 1.8], [7, 0.6], [8, 1]]);
  const R = U * 2;
  const a1 = rng.float(0.08, 0.3) * rng.pick([1, -1]);
  // higher harmonics only while the ripple count stays low, so rims don't wobble
  const a2 = 2 * n <= 12 && rng.chance(0.65) ? rng.float(0.02, 0.1) * rng.pick([1, -1]) : 0;
  const a3 = 3 * n <= 12 && rng.chance(0.3) ? rng.float(0.01, 0.04) : 0;
  // a phase offset on the upper harmonics leans every lobe the same way
  const lean = rng.chance(0.3) ? rng.float(0.35, 1.1) * rng.pick([1, -1]) : 0;
  const harmonics = [[1, a1], [2, a2, lean], [3, a3, 2 * lean]];
  const outer = polar(R, n, harmonics);

  // many lobes around a hole is a gear
  const inner = n >= 6 ? 'none' : rng.weighted([['none', 2.5], ['echo', 2], ['hole', 1.2], ['dot', 1]]);
  let item = outer;
  if (inner !== 'none') {
    const wall = R * rng.float(0.17, 0.3);
    const template =
      inner === 'echo'
        ? place(polar(R, n, [[1, -a1 * rng.float(0.4, 1)], [2, a2, lean]]), 0, 0, rng.chance(0.5) ? 180 / n : 0)
        : circle(0, 0, R);
    const hole = fitInside(outer, template, wall, rng.float(0.6, 1));
    if (!hole) return null;
    item = subtract(outer, hole);
    if (inner === 'dot') item = unite(item, circle(0, 0, reach(hole) * rng.float(0.38, 0.6)));
  }
  return { item, symmetry: `${lean ? 'C' : 'D'}${n}` };
}

// Circles bunched together with filleted joins: an exact take on metaballs.
// Returns null unless they make one piece (holes are fine).
function blob(balls, fillet, extra = []) {
  const item = roundCorners(unite([...balls.map(([x, y, r]) => circle(x, y, r)), ...extra]), fillet);
  if (!item || item.reorient(false, true).children.filter((c) => c.area > 0).length !== 1) return null;
  return item;
}

function softMelt(rng) {
  const n = rng.weighted([[3, 1.4], [4, 2], [5, 1.4], [6, 1.4], [8, 0.7]]);
  const R = U * 1.5;
  const chord = 2 * R * Math.sin(Math.PI / n);
  // neighbours overlap a little so there's a join to fillet
  const ball = Math.max(chord * rng.float(0.56, 0.75), n <= 3 ? R * rng.float(0.55, 0.8) : 0);
  const balls = ring(n, R, n % 2 ? 0 : rng.pick([0, 180 / n])).map(([x, y]) => [x, y, ball]);
  const core = rng.weighted([['none', 2], ['ball', 2], ['small', 1]]);
  if (core === 'ball') balls.push([0, 0, ball * rng.float(0.8, 1.15)]);
  if (core === 'small') balls.push([0, 0, Math.max(ball * rng.float(0.35, 0.55), R - ball + U * 0.2)]);
  const item = blob(balls, U * rng.float(0.3, 0.9));
  return item && { item, symmetry: `D${n}`, limits: { minFeature: 1.6 } };
}

// Mirrored left/right only, like a soft character: a body with ears and
// feet on, now and then with two eyes.
function softMirror(rng) {
  const B = U * rng.float(1.1, 1.4);
  const balls = [[0, 0, B]];
  const ears = [B * rng.float(0.45, 0.75), -B * rng.float(0.65, 0.85), B * rng.float(0.35, 0.5)];
  balls.push(ears, [-ears[0], ears[1], ears[2]]);
  if (rng.chance(0.75)) {
    const feet = rng.int(2, 3);
    const span = B * rng.float(0.45, 0.7);
    const size = B * rng.float(0.32, 0.45);
    const drop = B * rng.float(0.62, 0.8);
    for (let i = 0; i < feet; i++) balls.push([-span + (2 * span * i) / (feet - 1), drop, size]);
  }
  let item = blob(balls, U * rng.float(0.35, 0.8));
  if (!item) return null;
  if (rng.chance(0.2)) {
    const { center, width, height } = item.bounds;
    const ex = width * rng.float(0.12, 0.18);
    const eyes = [-1, 1].map((side) => ellipse(center.x + side * ex, center.y, width * 0.045, height * 0.095));
    item = subtract(item, ...eyes);
  }
  return { item, symmetry: 'D1', limits: { minFeature: 1.6 } };
}

// Two unequal circles joined by a filleted neck: mirrored only along that line.
function softDuo(rng) {
  const r1 = U * rng.float(0.65, 0.9);
  const r2 = r1 * rng.float(1.2, 1.7);
  const dist = (r1 + r2) * rng.float(1, 1.3);
  const x1 = -dist * (r2 / (r1 + r2));
  const x2 = dist * (r1 / (r1 + r2));
  const neck = capsule(x1, 0, x2, 0, r1 * rng.float(0.35, 0.6));
  const item = blob([[x1, 0, r1], [x2, 0, r2]], U * rng.float(0.6, 1.4), [neck]);
  if (!item) return null;
  const turn = rng.pick([0, 90, 45]);
  item.rotate(turn, ORIGIN);
  return { item, symmetry: 'D1', axis: turn + 90, limits: { minFeature: 1.6 } };
}

function soft(rng) {
  return rng.weighted([[softWave, 4], [softMelt, 2.5], [softMirror, 3], [softDuo, 2]])(rng);
}

// ------------------------------------------------------------------ split
// A shape cut through the middle with its halves slid apart.

function split(rng) {
  const R = U * 2;
  const base = rng.weighted([['circle', 3], ['squircle', 2.5], ['hexagon', 1.5], ['badge', 1]]);
  const shape =
    base === 'circle' ? circle(0, 0, R)
    : base === 'squircle' ? quad(R, R, rng.float(0.72, 0.92))
    : base === 'hexagon' ? roundedPolygon(starPoints(3, R, R, 0), R * rng.float(0.12, 0.3))
    : roundedPolygon(starPoints(8, R, R * 0.8), R * 0.08);
  const angle = rng.weighted([[0, 2], [90, 2], [45, 1.5]]);
  const gap = R * rng.float(0.1, 0.18);
  const mode = rng.weighted([['slide', 3], ['quarters', 1.2]]);
  const big = R * 4;

  let pieces;
  if (mode === 'slide') {
    const shift = R * rng.float(0.14, 0.34);
    pieces = [-1, 1].map((side) => {
      const half = intersect(shape, rect(0, side * (big / 2 + gap / 2), big, big).rotate(angle, ORIGIN));
      const dir = new Point(Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180));
      half.translate(dir.multiply(side * shift));
      return half;
    });
    return { item: unite(pieces), symmetry: 'C2' };
  }
  // quarters pushed straight out from the center
  const push = R * rng.float(0, 0.12);
  pieces = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy]) => {
    const quarter = intersect(shape, rect(sx * (big / 2 + gap / 2), sy * (big / 2 + gap / 2), big, big));
    quarter.translate(new Point(sx * push, sy * push));
    return quarter;
  });
  return { item: unite(pieces), symmetry: base === 'hexagon' ? 'D2' : 'D4' };
}

// ----------------------------------------------------------------- stroke
// Monoline strokes with round caps: straight runs, circular bends, filleted
// joins.

function stroke(rng, opts = {}) {
  // loops can cross each other awkwardly and splats turn into stick figures, so both stay rare
  const presets = [['gooey', 3], ['turbine', 1.5], ['pair', 1], ['loops', 0.6]];
  if (opts.loose) presets.push(['splat', 0.8]);
  const preset = rng.weighted(presets);
  const L = U * 2;
  let item;
  let symmetry;
  let limits = { minFeature: 1.2, minAspect: 0.5 };
  const copies = (piece, n) => Array.from({ length: n }, (_, i) => place(piece.clone({ insert: false }), 0, 0, (360 * i) / n));

  if (preset === 'gooey') {
    const r = U * rng.float(0.18, 0.28);
    const n = rng.weighted([[3, 1], [4, 1.2], [5, 1.5], [6, 2], [8, 1.5]]);
    const short = n % 2 === 0 && rng.chance(0.35) ? rng.float(0.5, 0.75) : 1;
    const arms = Array.from({ length: n }, (_, i) => {
      const s = i % 2 ? short : 1;
      // four arms always sit as an X: an upright plus reads as a medical cross
      return place(capsule(0, 0, L * s, 0, r * (s < 1 ? 0.85 : 1)), 0, 0, (360 * i) / n - (n === 4 ? 45 : 90));
    });
    item = roundCorners(unite(circle(0, 0, r * rng.float(1.4, 2.6)), ...arms), r * rng.float(0.5, 1.4));
    symmetry = short < 1 ? `D${n / 2}` : `D${n}`;
  } else if (preset === 'pair') {
    // a flat tail that bends round into a slant, paired with its 180° turn
    const r = U * rng.float(0.2, 0.28);
    const aDeg = rng.float(50, 68);
    const a = (aDeg * Math.PI) / 180;
    const slant = L * rng.float(0.8, 1.05);
    const tail = L * rng.float(0.35, 0.6);
    const bend = r * rng.float(1.5, 3.5);
    const lift = slant * Math.sin(a) * rng.float(0.2, 0.4);
    const apart = r * rng.float(3.5, 5);
    const corner = [-(apart / 2 + lift * Math.cos(a)) / Math.sin(a), lift];
    const t = bend * Math.tan(a / 2);
    const t1 = [corner[0] - t, corner[1]];
    const t2 = [corner[0] + Math.cos(a) * t, corner[1] - Math.sin(a) * t];
    const end = [corner[0] + Math.cos(a) * slant, corner[1] - Math.sin(a) * slant];
    const piece = unite(
      capsule(t1[0] - tail, t1[1], t1[0], t1[1], r),
      arcStroke(t1[0], t1[1] - bend, bend, 90 - aDeg, 90, r),
      capsule(t2[0], t2[1], end[0], end[1], r),
    );
    const mirrored = rng.chance(0.2);
    const other = piece.clone({ insert: false });
    if (mirrored) other.scale(-1, 1, ORIGIN);
    else other.rotate(180, ORIGIN);
    item = unite(piece, other);
    symmetry = mirrored ? 'D1' : 'C2';
  } else if (preset === 'loops') {
    const r = U * rng.float(0.16, 0.24);
    const n = rng.weighted([[2, 2], [3, 2], [4, 1], [5, 0.8]]);
    const span = rng.float(140, 220);
    const a0 = rng.float(0, 360);
    item = unite(copies(arcStroke(L * rng.float(0.25, 0.5), 0, L * rng.float(0.42, 0.62), a0, a0 + span, r), n));
    symmetry = `C${n}`;
  } else if (preset === 'turbine') {
    // arcs that leave the centre and curl away; never four of them
    const r = U * rng.float(0.15, 0.22);
    const n = rng.pick([3, 5, 6]);
    const sweep = rng.float(60, 120);
    const rho = L * rng.float(0.45, 0.6);
    const arm = rng.chance(0.5) ? arcStroke(rho, 0, rho, 180, 180 + sweep, r) : arcStroke(rho, 0, rho, 180 - sweep, 180, r);
    const parts = copies(arm, n);
    if (rng.chance(0.6)) parts.push(circle(0, 0, r * rng.float(1.6, 2.6)));
    item = roundCorners(unite(parts), r * rng.float(0.5, 1.2));
    symmetry = `C${n}`;
  } else {
    // splat: arms of different lengths around a core; balanced, not symmetric
    const r = U * rng.float(0.15, 0.22);
    const m = rng.int(5, 8);
    let angles;
    for (let tries = 0; tries < 30; tries++) {
      angles = Array.from({ length: m }, () => rng.float(0, 360)).sort((p, q) => p - q);
      const gaps = angles.map((v, i) => (i ? v - angles[i - 1] : v + 360 - angles[m - 1]));
      if (Math.min(...gaps) > 360 / m / 2.2) break;
      angles = null;
    }
    if (!angles) return null;
    const arms = angles.map((deg) => place(capsule(0, 0, L * rng.float(0.55, 1.05), 0, r * rng.float(0.85, 1.1)), 0, 0, deg));
    item = roundCorners(unite(circle(0, 0, r * rng.float(1.5, 2.3)), ...arms), r * rng.float(0.6, 1.5));
    symmetry = 'C1';
    limits = { ...limits, balance: 0.07 };
  }
  return { item, symmetry, limits };
}

// ----------------------------------------------------------------- sector
// A ring or polygon cut into radial pieces: twisted kites around a starburst,
// hooked pinwheels, plain wheels.

function sector(rng) {
  const style = rng.weighted([['kites', 3], ['hooks', 0.5], ['wheel', 0.8]]);
  // three hooked pieces read as jigsaw puzzle, so hooks start at four
  const n = style === 'kites' ? rng.weighted([[5, 3], [6, 2], [3, 1], [4, 0.4]]) : rng.weighted([[3, style === 'hooks' ? 0 : 1], [4, 1.4], [5, 2], [6, 2], [7, 0.8]]);
  const R = U * 2;
  const span = 360 / n;
  const gap = R * rng.float(0.06, 0.12);
  const cut = wedge(-span / 2, span / 2, R, gap);
  let piece;
  let chiral = false;

  if (style === 'kites') {
    // a polygon whose corners sit on the cuts, each piece turned a little
    const outline = polygon(Array.from({ length: n }, (_, k) => [Math.cos(((k + 0.5) * span * Math.PI) / 180) * R, Math.sin(((k + 0.5) * span * Math.PI) / 180) * R]));
    piece = intersect(subtract(outline, circle(0, 0, R * rng.float(0.08, 0.2))), cut);
    piece.rotate(rng.float(4, 10) * rng.pick([1, -1]), piece.bounds.center);
    chiral = true;
  } else {
    const inner = R * rng.float(0.25, 0.5);
    piece = intersect(annulus(inner, R), cut);
    if (style === 'hooks') {
      const mid = (inner + R) / 2;
      const at = ((span / 2) * Math.PI) / 180 - gap / mid;
      piece = subtract(piece, circle(Math.cos(at) * mid, Math.sin(at) * mid, ((R - inner) / 2) * rng.float(0.38, 0.55)));
      chiral = true;
    }
  }
  let item = unite(Array.from({ length: n }, (_, k) => place(piece.clone({ insert: false }), 0, 0, k * span)));
  if (style === 'kites' && rng.chance(0.7)) {
    // a starburst opening: points reaching out along the cuts
    const tips = [];
    for (let k = 0; k < n; k++) {
      const out = (((k + 0.5) * span) * Math.PI) / 180;
      const back = (((k + 1) * span) * Math.PI) / 180;
      tips.push([Math.cos(out) * R * 0.8, Math.sin(out) * R * 0.8], [Math.cos(back) * R * 0.2, Math.sin(back) * R * 0.2]);
    }
    item = subtract(item, polygon(tips));
  }
  item = roundCorners(item, U * rng.float(0.05, 0.16));
  item.rotate(-90, ORIGIN);
  return { item, symmetry: `${chiral ? 'C' : 'D'}${n}`, limits: { tips: 0.6 } };
}

// ------------------------------------------------------------------- arch
// Overlapping ovals whose overlaps cancel out, split into two halves.

function arch(rng) {
  const k = rng.weighted([[3, 3], [2, 1.2], [4, 0.4]]);
  const a = U * rng.float(0.5, 0.7);
  const b = U * rng.float(1.1, 1.6);
  const step = 2 * a * rng.float(0.6, 0.85);
  const lift = rng.float(1, 1.25);
  const ovals = Array.from({ length: k }, (_, i) => ellipse((i - (k - 1) / 2) * step, 0, a, i > 0 && i < k - 1 ? b * lift : b));
  let item = xor(ovals);
  let symmetry = 'D2';
  if (rng.chance(0.7)) {
    const gap = U * rng.float(0.16, 0.32);
    const big = U * 8;
    const top = intersect(item, rect(0, -gap / 2 - big / 2, big, big));
    const bottom = intersect(item, rect(0, gap / 2 + big / 2, big, big));
    if (rng.chance(0.25)) {
      bottom.translate([step / 2, 0]);
      symmetry = 'C2';
    }
    item = unite(top, bottom);
  }
  item = roundCorners(item, U * rng.float(0.1, 0.28));
  if (rng.chance(0.3)) item.rotate(90, ORIGIN);
  return { item, symmetry, limits: { tips: 0.5 } };
}

// ------------------------------------------------------------------- dash
// A ring of ellipses, laid along the ring, across it, or tilted.

function dash(rng) {
  const n = rng.weighted([[4, 3], [5, 1], [6, 3], [8, 1.5], [10, 0.6], [12, 0.4]]);
  const R = U * 2;
  const chord = (2 * Math.PI * R) / n;
  const tilt = rng.float(30, 60) * rng.pick([1, -1]);
  const turn = rng.weighted([[90, 3], [0, 1.2], [tilt, 1.5]]);
  // four big ovals nearly touching read as one circle
  const len = turn === 0 ? R * rng.float(0.28, 0.42) : chord * (n === 4 ? rng.float(0.38, 0.46) : rng.float(0.3, 0.44));
  const thick = len * (n === 4 ? rng.float(0.42, 0.58) : rng.float(0.32, 0.55));
  const offset = n % 2 === 0 && rng.chance(0.5) ? 180 / n : 0;
  const dots = ring(n, R, offset).map(([x, y]) => ellipse(x, y, len, thick, (Math.atan2(y, x) * 180) / Math.PI + turn));
  if (rng.chance(0.25)) dots.push(circle(0, 0, R * rng.float(0.2, 0.32)));
  const symmetry = turn === 0 || turn === 90 ? `D${n}` : `C${n}`;
  return { item: compound(dots), symmetry, limits: { freePieces: 13 } };
}

// `loose` families only appear when asymmetric marks are allowed.
export const FAMILIES = {
  form: { build: form, plan: formPlan, weight: 120, pick: 4 },
  carve: { build: carve, weight: 14 },
  pair: { build: pair, weight: 7 },
  block: { build: block, weight: 1 },
  tetro: { build: tetro, weight: 5 },
  cloud: { build: cloud, weight: 2 },
  soft: { build: soft, weight: 7 },
  stroke: { build: stroke, weight: 6 },
  dash: { build: dash, weight: 5 },
  arch: { build: arch, weight: 4 },
  petal: { build: petal, weight: 4 },
  spoke: { build: spoke, weight: 1.5 },
  sector: { build: sector, weight: 1.5 },
  split: { build: split, weight: 3 },
  badge: { build: badge, weight: 2 },
  ring: { build: band, weight: 2 },
  bloom: { build: bloom, weight: 2 },
  orbit: { build: orbitFamily, weight: 1.5 },
  stripe: { build: stripe, weight: 1.5 },
  lattice: { build: lattice, weight: 1 },
  tiles: { build: tiles, weight: 1 },
  spark: { build: spark, weight: 1 },
  pixel: { build: pixel, weight: 1 },
  field: { build: field, weight: 0.5 },
};
