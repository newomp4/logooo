// Each family turns a seeded rng into a symmetric paper.js shape.
// They return null when a roll doesn't produce something worth keeping.
import {
  K, ORIGIN, Path, Point, circle, ellipse, rect, quad, place, shear, grid, ring, group, orbit,
  unite, xor, subtract, intersect, clearance, reach, fitInside, gridOutline, compound,
} from './geom.js';

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
  const preset = rng.weighted([['crescents', 3], ['bites', 3], ['chain', 2], ['rosette', 3], ['swirl', 2]]);
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
  const preset = rng.weighted([['single', 1.3], ['cluster', 3], ['cross', 2], ['halo', 1.2], ['aperture', 2.5]]);
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
    limits = { minFill: 0.05, minFeature: 0.6, minNodes: 4 };
  } else if (preset === 'cluster' || preset === 'cross') {
    const d = U;
    const s = d * rng.float(1.0, 1.35);
    const pts = preset === 'cluster' ? grid(2, 2, 2 * d) : ring(4, d * 1.3);
    const rot = preset === 'cross' ? rng.pick([0, 45]) : 0;
    const stars = pts.map(([x, y]) => place(quad(s, s, pinch), x, y, rot));
    const center = rng.weighted([['circle', 3], ['spark', 1], ['none', 1]]);
    if (center === 'circle') stars.push(circle(0, 0, d * rng.float(0.3, 0.55)));
    if (center === 'spark') stars.push(place(quad(s * 0.7, s * 0.7, pinch), 0, 0, 45));
    item = unite(stars);
    limits = { minFill: 0.1, minFeature: 0.8 };
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
    limits = { minFill: 0.08, minFeature: 0.8 };
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
  return { item, symmetry, limits };
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
  const n = rng.weighted([[4, 3], [5, 3], [6, 1]]);
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
  return { item: compound(dots), symmetry: diagonal ? 'D2' : 'D4', axis: diagonal ? 45 : 0, limits: { minFill: 0.12, minFeature: 0.9, minPart: 10 } };
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

export const FAMILIES = {
  bloom: { build: bloom, weight: 17 },
  lattice: { build: lattice, weight: 15 },
  orbit: { build: orbitFamily, weight: 14 },
  spark: { build: spark, weight: 11 },
  ring: { build: band, weight: 10 },
  pixel: { build: pixel, weight: 10 },
  field: { build: field, weight: 5 },
  tiles: { build: tiles, weight: 11 },
};
