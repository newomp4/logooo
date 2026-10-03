// The styles. Most grow from the reference recipes in blend.js; bloom and
// cloud are built directly from circles. Each turns a seeded rng into a
// paper.js shape, or null when a roll doesn't produce something worth keeping.
import { ORIGIN, circle, ellipse, rect, quad, place, grid, ring, unite, subtract, reach, fitInside } from './geom.js';
import { roundCorners } from './shapes.js';
import { blendFrom } from './blend.js';

const U = 10; // base spacing; everything is rescaled at the end
const R = U * 2;
const rad = (deg) => (deg * Math.PI) / 180;

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

// ------------------------------------------------------------------ cloud

// Circles bunched onto a body and filleted together, filled or as an outline,
// now and then with two eyes.
function cloud(rng) {
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
  return { item, symmetry: 'auto', limits: { freePieces: 6, minAspect: 0.6 } };
}

const blend = (anchor, weight) => ({ build: blendFrom(anchor), weight, pick: 2 });

// The first ones are featured in the style picker; the rest fold behind "More".
export const FAMILIES = {
  split: blend('split', 5),
  channel: blend('channel', 4),
  zed: blend('zed', 2.5),
  halves: blend('halves', 2),
  quarters: blend('quarters', 3),
  quads: blend('quads', 4),
  arches: blend('arches', 4),
  ovals: blend('ovals', 3),
  beads: blend('beads', 2.5),
  kites: blend('kites', 3.5),
  asterisk: blend('asterisk', 2),
  window: blend('window', 3),
  strokes: blend('strokes', 1),
  bloom: { build: bloom, weight: 3 },
  cloud: { build: cloud, weight: 1.5 },
};
