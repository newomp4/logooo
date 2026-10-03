import paper from 'paper/dist/paper-core.js';

// Rasterizes a mark at icon size and scores the detail that wouldn't survive
// there: ink thinner than ~5% of the mark, gaps narrower than that, specks,
// lots of loose pieces and small satellites floating away from the main body.

const N = 64;
const CELL = 100 / N;

function rasterize(shape, center = false) {
  const flat = shape.clone({ insert: false });
  if (center) {
    const { width, height } = flat.bounds;
    flat.translate([(100 - width) / 2 - flat.bounds.x, (100 - height) / 2 - flat.bounds.y]);
  }
  flat.flatten(0.25);
  const edges = [];
  for (const path of flat.children ?? [flat]) {
    const pts = path.segments.map((s) => s.point);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a.y !== b.y) edges.push([a.x, a.y, b.x, b.y]);
    }
  }
  // even-odd scanline fill, sampling pixel centers
  const mask = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) * CELL;
    const xs = [];
    for (const [x1, y1, x2, y2] of edges) {
      if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let t = 0; t + 1 < xs.length; t += 2) {
      for (let i = Math.max(0, Math.ceil(xs[t] / CELL - 0.5)); i < N && (i + 0.5) * CELL < xs[t + 1]; i++) {
        mask[j * N + i] = 1;
      }
    }
  }
  return mask;
}

// 3×3 erosion / dilation; outside the grid counts as empty
function morph(mask, erode) {
  const out = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      let all = true;
      let any = false;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const x = i + di;
          const y = j + dj;
          const v = x >= 0 && y >= 0 && x < N && y < N && mask[y * N + x] === 1;
          all &&= v;
          any ||= v;
        }
      }
      out[j * N + i] = erode ? +all : +any;
    }
  }
  return out;
}

function components(mask, value, diagonal, labels) {
  const seen = new Uint8Array(N * N);
  const sizes = [];
  const border = [];
  for (let start = 0; start < N * N; start++) {
    if (mask[start] !== value || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let size = 0;
    let touches = false;
    while (stack.length) {
      const p = stack.pop();
      labels[p] = sizes.length + 1;
      size++;
      const x = p % N;
      const y = (p / N) | 0;
      if (x === 0 || y === 0 || x === N - 1 || y === N - 1) touches = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const q = ny * N + nx;
          if (mask[q] === value && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    sizes.push(size);
    border.push(touches);
  }
  return { sizes, border };
}

// 0 is a clean mark; anything much above 0.2 reads as fussy at icon size.
// `tips` scales the penalty for thin ink, since pointed sparks taper by design.
export function detailScore(shape, { tips = 1, freePieces = 5 } = {}) {
  const mask = rasterize(shape);
  let ink = 0;
  for (const v of mask) ink += v;
  if (!ink) return Infinity;

  const opened = morph(morph(mask, true), false);
  const closed = morph(morph(mask, false), true);
  let thin = 0;
  let narrow = 0;
  for (let i = 0; i < N * N; i++) {
    if (mask[i] && !opened[i]) thin++;
    if (!mask[i] && closed[i]) narrow++;
  }

  const inkLabels = new Int32Array(N * N);
  const bgLabels = new Int32Array(N * N);
  const pieces = components(mask, 1, true, inkLabels);
  const bg = components(mask, 0, false, bgLabels);
  const speck = 0.012 * N * N;
  const specks = [...pieces.sizes, ...bg.sizes.filter((_, i) => !bg.border[i])].filter((s) => s < speck).length;

  // count what the eye separates: pieces joined only by hairline necks, and holes
  // that only touch at their tips, read as separate shapes at icon size
  const scratch = new Int32Array(N * N);
  const seenPieces = components(opened, 1, true, scratch).sizes.length;
  const closedBg = components(closed, 0, false, scratch);
  const seenHoles = closedBg.sizes.filter((_, i) => !closedBg.border[i]).length;

  // pieces that sit in the open (not inside a hole) and are much smaller than the main body
  const biggest = Math.max(...pieces.sizes);
  const exposed = new Set();
  for (let p = 0; p < N * N; p++) {
    if (!inkLabels[p]) continue;
    const x = p % N;
    const y = (p / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const out = nx < 0 || ny < 0 || nx >= N || ny >= N;
      if (out || (bgLabels[ny * N + nx] && bg.border[bgLabels[ny * N + nx] - 1])) exposed.add(inkLabels[p]);
    }
  }
  const satellites = pieces.sizes.filter((s, i) => exposed.has(i + 1) && s < 0.2 * biggest).length;

  return (
    (tips * thin) / ink +
    narrow / ink +
    0.05 * Math.max(0, Math.max(pieces.sizes.length, seenPieces) - freePieces) +
    0.05 * Math.max(0, seenHoles - 3) +
    0.06 * specks +
    0.08 * satellites
  );
}

// ------------------------------------------------------------ likeness

// How far the ink's centre of mass sits from the middle of the mark (0–1).
export function offCenter(shape) {
  const mask = rasterize(shape, true);
  let sx = 0;
  let sy = 0;
  let ink = 0;
  for (let p = 0; p < N * N; p++) {
    if (!mask[p]) continue;
    sx += p % N;
    sy += (p / N) | 0;
    ink++;
  }
  if (!ink) return 1;
  return Math.hypot(sx / ink - (N - 1) / 2, sy / ink - (N - 1) / 2) / N;
}

// A 32×32 silhouette of the (centered) mark, packed into base64.
export function signature(shape) {
  const mask = rasterize(shape, true);
  const bits = new Uint8Array(128);
  for (let j = 0; j < 32; j++) {
    for (let i = 0; i < 32; i++) {
      const p = 2 * j * N + 2 * i;
      if (mask[p] + mask[p + 1] + mask[p + N] + mask[p + N + 1] >= 2) {
        const k = j * 32 + i;
        bits[k >> 3] |= 1 << (k & 7);
      }
    }
  }
  return btoa(String.fromCharCode(...bits));
}

const POP = Uint8Array.from({ length: 256 }, (_, i) => {
  let c = 0;
  for (let b = i; b; b >>= 1) c += b & 1;
  return c;
});

// Overlap of two silhouettes (intersection over union, 0–1).
export function likeness(a, b) {
  if (!a || !b) return 0;
  const x = atob(a);
  const y = atob(b);
  let both = 0;
  let either = 0;
  for (let i = 0; i < x.length; i++) {
    const p = x.charCodeAt(i);
    const q = y.charCodeAt(i);
    both += POP[p & q];
    either += POP[p | q];
  }
  return either ? both / either : 0;
}

// --------------------------------------------------------------- symmetry

const ROT = [8, 6, 5, 4, 3, 2];

// Finds the symmetry a mark actually has, on a 96px silhouette spun about
// its centre of mass. Returns labels like 'D4', 'C2', 'D1' or 'C1' (none).
export function detectSymmetry(shape) {
  const M = 96;
  const flat = shape.clone({ insert: false });
  const { width, height } = flat.bounds;
  flat.translate([(100 - width) / 2 - flat.bounds.x, (100 - height) / 2 - flat.bounds.y]);
  flat.flatten(0.25);
  const k = 100 / M;
  const mask = new Uint8Array(M * M);
  const edges = [];
  for (const path of flat.children ?? [flat]) {
    const pts = path.segments.map((seg) => seg.point);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a.y !== b.y) edges.push([a.x, a.y, b.x, b.y]);
    }
  }
  let sx = 0;
  let sy = 0;
  let ink = 0;
  for (let j = 0; j < M; j++) {
    const y = (j + 0.5) * k;
    const xs = [];
    for (const [x1, y1, x2, y2] of edges) if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    xs.sort((a, b) => a - b);
    for (let t = 0; t + 1 < xs.length; t += 2) {
      for (let i = Math.max(0, Math.ceil(xs[t] / k - 0.5)); i < M && (i + 0.5) * k < xs[t + 1]; i++) {
        mask[j * M + i] = 1;
        sx += i;
        sy += j;
        ink++;
      }
    }
  }
  if (!ink) return 'C1';
  const cx = sx / ink;
  const cy = sy / ink;

  // share of ink that lands off the ink after the transform
  const miss = (fn) => {
    let bad = 0;
    for (let p = 0; p < M * M; p++) {
      if (!mask[p]) continue;
      const [x, y] = fn(p % M - cx, ((p / M) | 0) - cy);
      const i = Math.round(x + cx);
      const j = Math.round(y + cy);
      if (i < 0 || j < 0 || i >= M || j >= M || !mask[j * M + i]) bad++;
    }
    return bad / ink;
  };
  const rotate = (deg) => {
    const c = Math.cos((deg * Math.PI) / 180);
    const s2 = Math.sin((deg * Math.PI) / 180);
    return (x, y) => [x * c - y * s2, x * s2 + y * c];
  };
  const mirror = (deg) => {
    const c = Math.cos((2 * deg * Math.PI) / 180);
    const s2 = Math.sin((2 * deg * Math.PI) / 180);
    return (x, y) => [x * c + y * s2, x * s2 - y * c];
  };
  const OK = 0.04;
  const order = ROT.find((n) => miss(rotate(360 / n)) < OK) ?? 1;
  const axes = new Set([0, 90]);
  for (const n of ROT) for (let i = 0; i < 2 * n; i++) axes.add(+((90 * i) / n).toFixed(3) % 180);
  const mirrored = [...axes].some((a) => miss(mirror(a)) < OK);
  return `${mirrored ? 'D' : 'C'}${order}`;
}

// A nest of plain convex shapes around one centre (a disc, a ring, a target)
// is too simple to be a mark.
export function tooPlain(shape) {
  const loops = shape.children ?? [shape];
  const center = shape.bounds.center;
  const size = Math.max(shape.bounds.width, shape.bounds.height);
  return loops.every((loop) => {
    const flat = loop.clone({ insert: false });
    flat.flatten(0.5);
    const pts = flat.segments.map((seg) => [seg.point.x, seg.point.y]);
    const hull = convexHull(pts);
    let hullArea = 0;
    for (let i = 0; i < hull.length; i++) {
      const [x1, y1] = hull[i];
      const [x2, y2] = hull[(i + 1) % hull.length];
      hullArea += x1 * y2 - x2 * y1;
    }
    const solidity = Math.abs(loop.area) / (Math.abs(hullArea) / 2 || 1);
    const off = loop.bounds.center.getDistance(center) / size;
    return solidity > 0.97 && off < 0.02;
  });
}

function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// --------------------------------------------------------- weirdness checks

function hullArea(points) {
  const hull = convexHull(points);
  let a = 0;
  for (let i = 0; i < hull.length; i++) {
    const [x1, y1] = hull[i];
    const [x2, y2] = hull[(i + 1) % hull.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

const flatPoints = (item) => {
  const flat = item.clone({ insert: false });
  flat.flatten(0.5);
  return (flat.children ?? [flat]).flatMap((p) => p.segments.map((s) => [s.point.x, s.point.y]));
};

// Ink area over the area of its convex hull: 1 is a plain convex blob.
export function solidity(shape) {
  return Math.abs(shape.area) / (hullArea(flatPoints(shape)) || 1);
}

// Shapes that read as accidents rather than designs.
export function looksOff(shape) {
  const loops = shape.children ?? [shape];
  const outer = loops.filter((l) => l.area > 0);
  const whole = solidity(shape);
  // a single plain blob with at most a nick taken out of it
  if (loops.length === 1 && whole > 0.92) return 'plain';
  // two or three plain convex pieces and nothing else
  if (loops.length <= 3 && loops.length === outer.length && outer.every((l) => Math.abs(l.area) / (hullArea(flatPoints(l)) || 1) > 0.97)) return 'sparse';
  // nothing but separate round dots
  if (loops.length <= 4 && loops.every((l) => l.area > 0 && (4 * Math.PI * l.area) / l.length ** 2 > 0.97)) return 'dots';
  // a grid of identical plain boxes
  const boxy = outer.length >= 2 && loops.length === outer.length && outer.every((l) => {
    const sol = Math.abs(l.area) / (hullArea(flatPoints(l)) || 1);
    return sol > 0.97 && Math.abs(l.area) / (l.bounds.width * l.bounds.height) > 0.85;
  });
  if (boxy) return 'boxy';
  // leftover boolean slivers: a tiny edge with sharp turns at both ends
  for (const loop of loops) {
    for (const curve of loop.curves) {
      if (curve.length > 0.8) continue;
      const turnAt = (seg) => {
        const a = seg.curve?.previous?.getTangentAtTime(1);
        const b = seg.curve?.getTangentAtTime(0);
        return a && b && !a.isZero() && !b.isZero() ? Math.abs(a.getDirectedAngle(b)) : 0;
      };
      if (turnAt(curve.segment1) > 25 && turnAt(curve.segment2) > 25) return 'slivers';
    }
  }
  return null;
}

// How much a mark looks like the references: balanced ink, real negative
// space, a few strong pieces, some symmetry. Higher is better.
export function appeal(mark) {
  let score = -mark.detail * 2 - Math.abs(mark.fill - 0.5) * 1.2;
  score -= Math.max(0, 0.8 - Math.min(mark.width, mark.height) / 100) * 1.5;
  if (mark.parts > 6) score -= 0.3;
  // anchor points track how much is going on; past ~70 a mark turns into a cog
  if (mark.nodes > 70) score -= (mark.nodes - 70) / 100;
  if (mark.solidity > 0.86) score -= (mark.solidity - 0.86) * 4;
  if (mark.solidity < 0.45) score -= (0.45 - mark.solidity) * 2;
  if (/^D[2-9]/.test(mark.symmetry)) score += 0.12;
  else if (/^C[2-9]/.test(mark.symmetry)) score += 0.1;
  else if (mark.symmetry === 'D1') score += 0.05;
  return score;
}

// ------------------------------------------------------- forbidden shapes

// Silhouettes the generator must never produce: a plain plus or X (reads as
// a medical cross) and the hooked cross in both directions. Built once, on
// first use, from bars on a unit grid.
let FORBIDDEN = null;

function bars(list) {
  let item = null;
  for (const [x, y, w, h] of list) {
    const bar = new paper.Path.Rectangle({ point: [x, y], size: [w, h], insert: false });
    item = item ? item.unite(bar, { insert: false }) : bar;
  }
  return item;
}

// silhouettes compare at the same scale marks are finalized at: 100 units across
function at100(item) {
  const b = item.bounds;
  const copy = item.clone({ insert: false });
  copy.scale(100 / Math.max(b.width, b.height), b.center);
  copy.translate([-copy.bounds.x, -copy.bounds.y]);
  return copy;
}

function forbiddenShapes() {
  if (FORBIDDEN) return FORBIDDEN;
  const shapes = [];
  for (const w of [0.22, 0.3, 0.4, 0.5]) {
    const plus = bars([[-w / 2, -1, w, 2], [-1, -w / 2, 2, w]]);
    shapes.push({ sig: signature(at100(plus)), limit: 0.8 });
    shapes.push({ sig: signature(at100(plus.clone({ insert: false }).rotate(45, [0, 0]))), limit: 0.8 });
  }
  for (const w of [0.2, 0.3, 0.4]) {
    // a cross whose four arm ends bend the same way
    const arms = [[-w / 2, -1, w, 2], [-1, -w / 2, 2, w], [-w / 2, -1, 1 + w / 2, w]];
    let hooked = bars(arms);
    for (const deg of [90, 180, 270]) hooked = hooked.unite(bars(arms.slice(2)).rotate(deg, [0, 0]), { insert: false });
    for (const flip of [1, -1]) {
      const h = hooked.clone({ insert: false }).scale(flip, 1, [0, 0]);
      for (const deg of [0, 45]) shapes.push({ sig: signature(at100(h.clone({ insert: false }).rotate(deg, [0, 0]))), limit: 0.6 });
    }
  }
  FORBIDDEN = shapes;
  return shapes;
}

export function forbidden(shape) {
  const sig = signature(at100(shape));
  return forbiddenShapes().some((f) => likeness(sig, f.sig) >= f.limit);
}
