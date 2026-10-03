// Reference blending. Each reference logo is written down as a recipe of
// primitive shapes, in slots:
//   piece      the shape being repeated (oval, slab, chamfered box, kite,
//              chevron, arch, disc, ...)
//   layout     how copies of it sit (ring, bars, 180° pair, mirror, row,
//              grid, quadrants) and whether they merge or cancel where they overlap
//   container  an outer shape the pieces are carved out of, or that is the ink
//   cut        a slit (maybe opening into a star or diamond), an S channel, a
//              centre opening, or a round trim
//   core       a dot, diamond or star sitting in an empty middle
//   round      one corner radius for the whole mark
// Each recipe also says how far each of its numbers may move. A new mark is
// one recipe with some numbers re-rolled inside those ranges, or two recipes
// crossed: a slot (with its ranges) moves across from the other recipe, and
// when both use the same kind of part their numbers are blended. So new
// marks land on and between the references, never far from them.
import { ORIGIN, circle, ellipse, rect, quad, roundedPolygon, ring, unite, subtract, intersect, xor } from './geom.js';
import { capsule, band, arcBand, polygon, wedge, roundCorners } from './shapes.js';

const S = 20;
const rad = (deg) => (deg * Math.PI) / 180;
// a number may take any value between lo and hi; a plain array is a choice
const span = (lo, hi) => ({ lo, hi });
const isSpan = (v) => v && typeof v === 'object' && 'lo' in v;

// ---------------------------------------------------------------- recipes

export const ANCHORS = {
  // tall ovals whose overlaps cancel out, split into an M over a W
  arches: {
    piece: { kind: 'ellipse', rx: 0.3, ry: 0.62 },
    layout: { mode: 'row', n: 3, spacing: 0.62, join: 'xor' },
    cut: { kind: 'slit', angle: 0, g: 0.08 },
    round: 0.03,
    vary: { piece: { rx: span(0.26, 0.36), ry: span(0.5, 0.7) }, layout: { n: [2, 3, 3], spacing: span(0.5, 0.72) }, cut: { g: span(0.06, 0.1) }, round: span(0.025, 0.04) },
  },
  // a flat tail bending into a slant, paired with its own 180° turn
  strokes: {
    piece: { kind: 'bend', tail: 0.55, len: 1.05, angle: 60, t: 0.15, bend: 0.3, apart: 0.55 },
    layout: { mode: 'pair' },
    round: 0.03,
    vary: { piece: { tail: span(0.4, 0.7), len: span(0.9, 1.2), angle: span(50, 68), t: span(0.13, 0.17), bend: span(0.2, 0.4), apart: span(0.45, 0.7) } },
  },
  // a polygon cut into turned kites
  kites: {
    piece: { kind: 'kite', inner: 0.24, gap: 0.08, twist: 7 },
    layout: { mode: 'ring', n: 5 },
    round: 0.05,
    vary: { piece: { inner: span(0.2, 0.32), gap: span(0.06, 0.1), twist: [span(-10, -4), span(4, 10)] }, layout: { n: [4, 5, 6] }, round: span(0.045, 0.06) },
  },
  // a ring of ovals laid along the ring
  beads: {
    piece: { kind: 'ellipse', rx: 0.24, ry: 0.11, len: 0.3, t: 0.1 },
    layout: { mode: 'ring', n: 6, turn: 90, fit: 0.35 },
    round: 0.02,
    vary: {
      piece: { kind: ['ellipse', 'ellipse', 'capsule'], rx: span(0.2, 0.3), ry: span(0.1, 0.15), len: span(0.22, 0.4), t: span(0.09, 0.13) },
      layout: { n: [5, 6, 7, 8], fit: span(0.25, 0.5), offset: [0, 0, 'half'] },
    },
  },
  // big ovals with thin gaps between them, reading as one round body
  ovals: {
    piece: { kind: 'ellipse', rx: 0.42, ry: 0.21 },
    layout: { mode: 'ring', n: 4, turn: 90, offset: 'half', fit: 0.08 },
    round: 0.02,
    vary: { piece: { ry: span(0.17, 0.26) }, layout: { n: [4, 4, 5, 6], fit: span(0.05, 0.14), offset: [0, 'half'] } },
  },
  // thick bars through the middle, round-ended or trimmed by a circle
  asterisk: {
    piece: { kind: 'capsule', len: 2.2, t: 0.15 },
    layout: { mode: 'bars', n: 3 },
    cut: { kind: 'trim', size: 0.86 },
    round: 0.03,
    vary: {
      piece: { t: span(0.12, 0.21) },
      cut: { kind: ['trim', 'none'], size: span(0.78, 0.9) },
      round: span(0.025, 0.04),
    },
  },
  // a solid shape split down the middle, the split opening into a star or diamond
  split: {
    container: { kind: 'circle' },
    cut: { kind: 'slit', angle: 0, g: 0.09, middle: 'star', size: 0.48 },
    round: 0.03,
    vary: {
      container: { kind: ['circle', 'squircle', 'hex', 'pill'] },
      cut: { angle: [0, 90, 90, 45], g: span(0.07, 0.11), middle: ['star', 'star', 'diamond', 'lens'], size: span(0.4, 0.55) },
      round: span(0.025, 0.05),
    },
  },
  // two leaning or chamfered slabs overlapping into a Z
  zed: {
    piece: { kind: 'slab', w: 1, h: 0.6, lean: 0.55, r: 0.35, cut: 0.4 },
    layout: { mode: 'pair', stack: 0.8, shift: 0.32 },
    round: 0.04,
    vary: {
      piece: { kind: ['slab', 'chamfer'], w: span(0.9, 1.1), h: span(0.52, 0.68), lean: span(0.3, 0.8), r: span(0.25, 0.45), cut: span(0.3, 0.5) },
      layout: { stack: span(0.75, 0.88), shift: span(0.3, 0.38) },
    },
  },
  // half discs (or a little more, or less) joined along their flat sides into an S
  halves: {
    piece: { kind: 'half', keep: 0.5 },
    layout: { mode: 'pair', stack: 0.9, shift: 0.25 },
    round: 0.04,
    vary: { piece: { keep: span(0.38, 0.62) }, layout: { stack: span(0.84, 0.94), shift: span(0.16, 0.34) }, round: span(0.03, 0.06) },
  },
  // quarter discs (or thick quarter rings) in four corners, every other one turned outward
  quarters: {
    piece: { kind: 'quarter', hole: 0 },
    layout: { mode: 'quad', gap: 0.07, alt: true },
    round: 0.04,
    vary: { piece: { hole: [0, 0, span(0.38, 0.55)] }, layout: { gap: span(0.05, 0.1), alt: [true, true, true, false] }, round: span(0.03, 0.06) },
  },
  // rounded blocks mirrored into four corners
  quads: {
    piece: { kind: 'cells', pattern: 'L', r: 0.3 },
    layout: { mode: 'quad', gap: 0.06 },
    round: 0.03,
    vary: { piece: { pattern: ['L', 'J', 'step', 'tee', 'long', 'zig'], r: span(0.22, 0.5) }, layout: { gap: span(0.05, 0.09) } },
  },
  // a rounded square with a stepped or S-curved channel running through it
  channel: {
    container: { kind: 'squircle' },
    cut: { kind: 'zig', g: 0.1, lift: 0.28, run: 0.25 },
    round: 0.04,
    vary: { container: { kind: ['squircle', 'square', 'circle', 'pill'] }, cut: { kind: ['zig', 'zig', 'wave'], g: span(0.08, 0.12), lift: span(0.18, 0.34), run: span(0.05, 0.35) }, round: span(0.03, 0.05) },
  },
  // chevrons facing each other, in a row, or pointing out round a ring
  chevrons: {
    piece: { kind: 'chevron', len: 0.5, open: 90, t: 0.16, bend: 0.08 },
    layout: { mode: 'mirror', turn: 0, gap: 0.15 },
    round: 0.03,
    vary: {
      piece: { len: span(0.42, 0.6), open: span(75, 105), t: span(0.14, 0.2), bend: span(0.05, 0.12) },
      layout: [
        { mode: 'ring', n: [4, 4, 5, 6], fit: span(0.2, 0.4), inset: span(1.05, 1.3) },
        { mode: 'row', n: [2, 3], spacing: span(0.5, 0.7) },
        { mode: 'mirror', turn: [0, 180], gap: span(0.08, 0.25) },
      ],
    },
  },
  // a ring broken into round-ended arcs
  arcs: {
    piece: { kind: 'arc', t: 0.22, gap: 0.2 },
    layout: { mode: 'ring', n: 3 },
    round: 0.02,
    vary: { piece: { t: span(0.17, 0.26), gap: span(0.14, 0.3) }, layout: { n: [2, 3, 3, 4], offset: [0, 'half'] } },
  },
  // discs or soft squares on a small grid, merged or cancelled where they overlap
  grid: {
    piece: { kind: 'disc', r: 0.5 },
    layout: { mode: 'grid', m: 2, mask: 'full', spacing: 0.75, join: 'xor' },
    round: 0.02,
    vary: {
      piece: { kind: ['disc', 'disc', 'block'], r: span(0.25, 0.45) },
      layout: { m: [2, 2, 3], mask: ['full', 'ring', 'five'], spacing: span(0.62, 0.85), join: ['union', 'xor', 'xor'] },
    },
  },
  // two thick arches hooked into each other, one turned over
  chain: {
    piece: { kind: 'arch', w: 0.8, h: 1, t: 0.16 },
    layout: { mode: 'pair', stack: 0.55, shift: 0.3 },
    round: 0.04,
    vary: { piece: { w: span(0.7, 0.95), h: span(0.8, 1.2), t: span(0.14, 0.19) }, layout: { stack: span(0.4, 0.7), shift: span(0.22, 0.35) } },
  },
  // a solid shape with a window in the middle and a dot inside it
  window: {
    container: { kind: 'squircle' },
    cut: { kind: 'open', middle: 'star', size: 0.6 },
    core: { kind: 'circle', size: 0.65 },
    round: 0.04,
    vary: { container: { kind: ['squircle', 'circle', 'hex'] }, cut: { middle: ['star', 'lens'], size: span(0.5, 0.65) }, core: { kind: ['circle', 'diamond'], size: span(0.55, 0.75) } },
  },
};

export const ANCHOR_NAMES = Object.keys(ANCHORS);

// ------------------------------------------------------------- the parts

// Pieces built in place, for a given count, rather than centred and moved.
const FIXED = new Set(['kite', 'bend', 'arc']);
const fixedPiece = (dna) => FIXED.has(dna.piece?.kind);

// Layouts each kind of free piece reads well in. Lopsided pieces never go in
// a ring: turned copies of them make pinwheels (and, in fours, worse).
const FITS = {
  ellipse: ['ring', 'row'],
  capsule: ['ring', 'bars'],
  slab: ['pair', 'row'],
  chamfer: ['pair'],
  cells: ['quad', 'pair'],
  half: ['pair', 'row'],
  quarter: ['quad'],
  chevron: ['ring', 'row', 'mirror'],
  arch: ['pair'],
  disc: ['grid', 'ring', 'row'],
  block: ['grid'],
};
const fits = (piece, layout) => FITS[piece.kind]?.includes(layout.mode);
// Pieces with a single mirror axis: in a ring that axis has to point along the
// radius, or the copies chase each other round as a pinwheel.
const ONE_AXIS = new Set(['chevron']);

// cells in one quadrant, x outward and y downward from the middle
const PATTERNS = {
  L: [[0, 0], [1, 0], [0, 1]],
  J: [[1, 0], [0, 1], [1, 1]],
  step: [[0, 0], [1, 0], [1, 1]],
  tee: [[0, 0], [1, 0], [2, 0], [1, 1]],
  long: [[0, 0], [1, 0], [2, 0], [0, 1]],
  zig: [[0, 0], [1, 0], [1, 1], [2, 1]],
};

function makePiece(p, n) {
  const span = n ? 360 / n : 0;
  switch (p.kind) {
    case 'ellipse':
      return ellipse(0, 0, p.rx * S, p.ry * S);
    case 'capsule':
      return capsule((-p.len * S) / 2, 0, (p.len * S) / 2, 0, p.t * S);
    case 'half': {
      // a disc cut by a chord, keeping `keep` of its height
      const h = 2 * S * p.keep;
      return intersect(circle(0, S - h, S), rect(0, -h / 2, 2 * S, h));
    }
    case 'quarter': {
      const disc = p.hole ? subtract(circle(0, 0, S), circle(0, 0, S * p.hole)) : circle(0, 0, S);
      return intersect(disc, rect(S / 2, S / 2, S, S));
    }
    case 'slab': {
      const w = p.w * S;
      const h = p.h * S;
      const lean = p.lean * h;
      return roundedPolygon([[-w / 2 - lean / 2, h / 2], [w / 2 - lean / 2, h / 2], [w / 2 + lean / 2, -h / 2], [-w / 2 + lean / 2, -h / 2]], h * p.r);
    }
    case 'chamfer': {
      const w = p.w * S;
      const h = p.h * S;
      const c = Math.min(w, h) * p.cut;
      return roundedPolygon([[-w / 2, h / 2], [w / 2 - c, h / 2], [w / 2, h / 2 - c], [w / 2, -h / 2], [-w / 2 + c, -h / 2], [-w / 2, -h / 2 + c]], h * p.r * 0.4);
    }
    case 'cells': {
      const c = S * 0.36;
      const blocks = PATTERNS[p.pattern].map(([i, j]) => rect((i + 0.5) * c, (j + 0.5) * c, c * 1.002, c * 1.002));
      return roundCorners(unite(blocks), c * p.r);
    }
    case 'disc':
      return circle(0, 0, S * 0.5);
    case 'block':
      return rect(0, 0, S, S, S * p.r);
    case 'chevron': {
      // two arms meeting in a rounded point, pointing right; `bend` is the
      // radius left on the inside of the point
      const h = rad(p.open / 2);
      const arm = [-p.len * S * Math.cos(h), p.len * S * Math.sin(h)];
      return band([[arm[0], -arm[1]], [0, 0], arm], p.t * S, { radius: (p.t + p.bend) * S });
    }
    case 'arch': {
      // an upside-down U: two legs and a half-circle top
      const r = (p.w * S) / 2;
      return band([[-r, p.h * S], [-r, 0], [r, 0], [r, p.h * S]], p.t * S, { radius: r });
    }
    case 'arc': {
      // one of n round-ended arcs on a ring, `gap` apart end to end
      const R = S * (1 - p.t);
      const half = span / 2 - ((p.t * S + (p.gap * S) / 2) / R) * (180 / Math.PI);
      return arcBand(R, -half, half, p.t * S);
    }
    case 'kite': {
      // one wedge of an n-gon whose corners sit on the cuts, turned a little
      const outline = polygon(ring(n, S, 90 + 180 / n));
      const hole = polygon(ring(n, S * p.inner, 90 + 180 / n));
      const piece = intersect(subtract(outline, hole), wedge(-span / 2, span / 2, S * 2, S * p.gap));
      return piece.rotate(p.twist, piece.bounds.center);
    }
    case 'bend': {
      // tail → round bend → slant, set off so its 180° turn runs alongside
      const a = rad(p.angle);
      const slant = p.len * S;
      const lift = slant * Math.sin(a) * 0.3;
      const corner = [-((p.apart * S) / 2 + lift * Math.cos(a)) / Math.sin(a), lift];
      const tl = p.bend * S * Math.tan(a / 2);
      const start = [corner[0] - tl - p.tail * S, corner[1]];
      const end = [corner[0] + Math.cos(a) * slant, corner[1] - Math.sin(a) * slant];
      return band([start, corner, end], p.t * S, { radius: p.bend * S });
    }
    default:
      return null;
  }
}

const copy = (it) => it.clone({ insert: false });

function centred(item) {
  return item.translate(item.bounds.center.multiply(-1));
}

// Copies of the piece, placed. Spacing follows the piece's size, so any
// piece works with any layout.
function arrange(piece, dna) {
  const L = dna.layout;
  const fixed = fixedPiece(dna);
  if (!fixed) centred(piece);
  if (L.mode === 'ring') {
    const n = L.n;
    let base = piece;
    if (!fixed) {
      const turn = ONE_AXIS.has(dna.piece.kind) ? (L.turn === 180 ? 180 : 0) : (L.turn ?? 0);
      const turned = copy(piece).rotate(turn, ORIGIN);
      // far enough out that neighbours keep `fit` of a piece apart
      const along = turned.bounds.height;
      const out = turned.bounds.width;
      const fit = L.fit ?? 0.2;
      let d = Math.max((along * (1 + fit)) / (2 * Math.sin(Math.PI / n)), (out / 2) * (L.inset ?? 1.1));
      base = copy(turned).translate([d, 0]);
      // the estimate above is for pieces facing their neighbours squarely;
      // push out until pieces meant to stand apart really do
      for (let k = 0; fit >= 0 && k < 16 && base.intersects(copy(base).rotate(360 / n, ORIGIN)); k++) {
        d *= 1.06;
        base = copy(turned).translate([d, 0]);
      }
    }
    const offset = L.offset === 'half' ? 180 / n : 0;
    return Array.from({ length: n }, (_, k) => copy(base).rotate((360 * k) / n + offset - 90, ORIGIN));
  }
  if (L.mode === 'bars') {
    return Array.from({ length: L.n }, (_, k) => copy(piece).rotate((180 * k) / L.n + 90, ORIGIN));
  }
  if (L.mode === 'pair') {
    if (fixed) return [piece, copy(piece).rotate(180, ORIGIN)];
    const { width, height } = piece.bounds;
    const a = copy(piece).translate([width * (L.shift ?? 0), (-height / 2) * (L.stack ?? 1.2)]);
    return [a, copy(a).rotate(180, ORIGIN)];
  }
  if (L.mode === 'mirror') {
    // the piece and its reflection, side by side
    const a = copy(piece).rotate(L.turn ?? 0, ORIGIN);
    a.translate([a.bounds.width / 2 + ((L.gap ?? 0.1) * S) / 2 - a.bounds.center.x, -a.bounds.center.y]);
    return [a, copy(a).scale(-1, 1, ORIGIN)];
  }
  if (L.mode === 'grid') {
    // an m × m grid; 'ring' leaves the middle out, 'five' keeps corners and middle
    const step = piece.bounds.width * L.spacing;
    const at = [];
    for (let i = 0; i < L.m; i++) {
      for (let j = 0; j < L.m; j++) {
        const x = i - (L.m - 1) / 2;
        const y = j - (L.m - 1) / 2;
        if (L.m === 3 && L.mask === 'ring' && !x && !y) continue;
        if (L.m === 3 && L.mask === 'five' && (Math.abs(x) + Math.abs(y)) % 2) continue;
        at.push(copy(piece).translate([x * step, y * step]));
      }
    }
    return at;
  }
  if (L.mode === 'row') {
    const step = piece.bounds.width * L.spacing;
    return Array.from({ length: L.n }, (_, k) => copy(piece).translate([(k - (L.n - 1) / 2) * step, 0]));
  }
  if (L.mode === 'quad') {
    const g = ((L.gap ?? 0.06) * S) / 2;
    const a = copy(piece);
    a.translate([g - a.bounds.x, g - a.bounds.y]);
    return [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => {
      const c = copy(a).scale(sx, sy, ORIGIN);
      // alternating quadrants turn their piece around inside its corner; only
      // for quarter discs, which stay mirror-symmetric (turned L blocks make a pinwheel)
      return L.alt && dna.piece.kind === 'quarter' && sx * sy < 0 ? c.rotate(180, c.bounds.center) : c;
    });
  }
  return [piece];
}

function makeContainer(c) {
  if (c.kind === 'squircle') return quad(S, S, 0.86);
  if (c.kind === 'square') return rect(0, 0, 2 * S, 2 * S, S * 0.4);
  if (c.kind === 'hex') return roundedPolygon(ring(6, S, 30), S * 0.14);
  if (c.kind === 'pill') return rect(0, 0, 2 * S, 1.3 * S, 0.65 * S);
  return circle(0, 0, S);
}

// a square with its corners bitten off by circles, tips trimmed round
function concaveStar(s) {
  const bitten = subtract(rect(0, 0, 2 * s, 2 * s), ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([i, j]) => circle(i * s, j * s, s * 0.85)));
  return intersect(bitten, circle(0, 0, s * 0.92));
}

function middleShape(kind, s) {
  if (kind === 'diamond') return roundedPolygon([[s, 0], [0, s], [-s, 0], [0, -s]], s * 0.12);
  if (kind === 'lens') return ellipse(0, 0, s * 1.4, s * 0.6);
  if (kind === 'circle') return circle(0, 0, s * 0.8);
  if (kind === 'star') return concaveStar(s);
  return null;
}

const reachOf = (item) => Math.max(item.bounds.width, item.bounds.height) / 2;

function applyCut(item, cut) {
  const reach = reachOf(item);
  if (cut.kind === 'trim') return intersect(item, circle(0, 0, reach * cut.size));
  if (cut.kind === 'open') return item.contains(ORIGIN) ? subtract(item, middleShape(cut.middle, reach * cut.size)) : item;
  // an off-centre cut leaves the halves unequal (only when asymmetry is allowed)
  const off = reach * (cut.offset ?? 0);
  if (cut.kind === 'slit') {
    const cuts = [rect(0, 0, reach * 4, reach * cut.g * 2), middleShape(cut.middle, reach * cut.size)].filter(Boolean);
    return subtract(item, ...cuts.map((c) => c.translate([0, off]).rotate(cut.angle ?? 0, ORIGIN)));
  }
  if (cut.kind === 'zig' || cut.kind === 'wave') {
    // a step across the middle: tight bends, or bent as far as it goes into an S
    const y = reach * cut.lift;
    const x = reach * cut.run;
    const radius = reach * (cut.kind === 'wave' ? 2 : cut.g * 1.6);
    return subtract(item, band([[-reach * 2, y + off], [-x, y + off], [x, off - y], [reach * 2, off - y]], reach * cut.g, { radius, round: false }));
  }
  return item;
}

// Distance from the middle to the nearest ink, when the middle is empty.
function freeRadius(item) {
  if (item.contains(ORIGIN)) return 0;
  let min = Infinity;
  for (const loop of item.children ?? [item]) {
    const n = Math.max(64, Math.round(loop.length / 0.5));
    for (let i = 0; i < n; i++) min = Math.min(min, loop.getPointAt((loop.length * i) / n).length);
  }
  return min;
}

function addCore(item, core) {
  const free = freeRadius(item);
  if (free < reachOf(item) * 0.2) return item;
  return unite(item, middleShape(core.kind, free * core.size));
}

export function buildDna(dna) {
  let item = null;
  if (dna.piece) {
    const piece = makePiece(dna.piece, dna.layout?.n);
    if (!piece || piece.isEmpty()) return null;
    const pieces = arrange(piece, dna);
    // one piece a little smaller (only when asymmetry is allowed)
    if (dna.layout.odd) pieces[pieces.length - 1].scale(dna.layout.odd);
    item = dna.layout.join === 'xor' ? xor(pieces) : unite(pieces);
  }
  if (dna.container) {
    const box = makeContainer(dna.container);
    if (item) {
      // pieces cut out of the container, sized to sit inside it
      item.scale((S * 1.3) / Math.max(item.bounds.width, item.bounds.height), ORIGIN);
      item = subtract(box, item);
    } else item = box;
  }
  if (!item || item.isEmpty()) return null;
  if (dna.cut) item = applyCut(item, dna.cut);
  if (dna.core) item = addCore(item, dna.core);
  if (!item || item.isEmpty()) return null;
  const size = Math.max(item.bounds.width, item.bounds.height);
  return roundCorners(item, size * dna.round);
}

// ---------------------------------------------------------------- variety

const clone = (o) => JSON.parse(JSON.stringify(o));

function roll(rng, spec) {
  if (Array.isArray(spec)) return roll(rng, rng.pick(spec));
  if (isSpan(spec)) return rng.float(spec.lo, spec.hi);
  return spec;
}

// Re-rolls some of a recipe's numbers inside the ranges it allows.
function vary(dna, rng, share) {
  const out = clone(dna);
  for (const [slot, genes] of Object.entries(dna.vary ?? {})) {
    if (slot === 'round') {
      if (rng.chance(share)) out.round = roll(rng, genes);
      continue;
    }
    if (!out[slot]) continue;
    // a list offers whole alternatives for the slot (another kind of layout)
    if (Array.isArray(genes)) {
      const pick = rng.pick(genes);
      out[slot] = { ...(pick.mode === out[slot].mode ? out[slot] : {}), ...Object.fromEntries(Object.entries(pick).map(([key, spec]) => [key, roll(rng, spec)])) };
      continue;
    }
    for (const [key, spec] of Object.entries(genes)) if (rng.chance(share)) out[slot][key] = roll(rng, spec);
  }
  if (out.cut?.middle === 'none') delete out.cut.middle;
  // a circle opening in a circle with a dot is a target, not a mark
  if (out.container?.kind === 'circle' && out.cut?.middle === 'circle') out.cut.middle = 'diamond';
  return out;
}

function take(child, from, slot, rng) {
  const t = rng.float(0.3, 0.7);
  const same = child[slot] && from[slot] && (child[slot].kind ?? child[slot].mode) === (from[slot].kind ?? from[slot].mode);
  if (same) {
    for (const [key, v] of Object.entries(from[slot])) {
      if (typeof v === 'number' && typeof child[slot][key] === 'number' && key !== 'n') child[slot][key] = child[slot][key] * (1 - t) + v * t;
    }
    return;
  }
  child[slot] = clone(from[slot]);
  child.vary ??= {};
  if (from.vary?.[slot]) child.vary[slot] = clone(from.vary[slot]);
  else delete child.vary[slot];
}

// Slits and channels need a solid body to run through: across loose pieces
// they shave slivers off whatever they graze. A round trim suits bars.
function suits(cut, dna) {
  if (cut.kind === 'trim') return dna.layout?.mode === 'bars';
  if (cut.kind === 'open') return true;
  return Boolean(dna.container);
}

// Moves one or two slots across from recipe b into a copy of recipe a.
function cross(a, b, rng) {
  const child = clone(a);
  const free = (d) => d.piece && !fixedPiece(d);
  const moves = [];
  if (free(a) && free(b)) {
    if (fits(b.piece, a.layout)) moves.push('piece');
    if (fits(a.piece, b.layout)) moves.push('layout');
  }
  if (b.cut && suits(b.cut, a)) moves.push('cut');
  if (b.core) moves.push('core');
  if (b.container && free(a)) moves.push('container');
  if (a.container && !a.piece && free(b)) moves.push('carve');
  if (!moves.length) return child;
  const count = moves.length > 2 && rng.chance(0.35) ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const move = rng.pick(moves);
    if (move === 'carve') {
      take(child, b, 'piece', rng);
      take(child, b, 'layout', rng);
      delete child.cut;
    } else {
      take(child, b, move, rng);
      if (move === 'container' && child.cut?.kind === 'slit') delete child.cut;
    }
  }
  child.round = (a.round + b.round) / 2;
  return child;
}

// Off balance, but only just: the cut moves off the middle, or one piece
// comes out a little smaller, so the visual weight stays centred.
function unbalance(dna, rng) {
  if (['slit', 'zig', 'wave'].includes(dna.cut?.kind)) dna.cut.offset = rng.float(0.1, 0.22) * rng.pick([1, -1]);
  else if (['pair', 'row', 'quad'].includes(dna.layout?.mode)) dna.layout.odd = rng.float(0.74, 0.86);
  return dna;
}

// A recipe for one mark grown from an anchor: re-rolled, sometimes crossed,
// and with `loose`, sometimes nudged off balance.
export function recipeFor(anchor, rng, loose = false) {
  let dna = ANCHORS[anchor];
  if (rng.chance(0.5)) {
    const other = rng.pick(ANCHOR_NAMES.filter((n) => n !== anchor));
    dna = cross(dna, ANCHORS[other], rng);
  }
  dna = vary(dna, rng, 0.6);
  return loose && rng.chance(0.5) ? unbalance(dna, rng) : dna;
}

export const BLEND_LIMITS = { minAspect: 0.5, freePieces: 9, maxNodes: 120, maxFine: 0.015, maxSpikes: 4, smooth: true, maxGap: 0.2 };

// What a mark is built from, ignoring the numbers. Marks with the same
// structure read as the same kind of mark, however their sizes differ.
export function structureOf(dna) {
  const L = dna.layout;
  const parts = [
    dna.piece && `${dna.piece.kind}/${L.mode}${L.mode === 'grid' ? L.m : ''}${L.join === 'xor' ? '^' : ''}`,
    dna.container && 'box',
    dna.cut && dna.cut.kind !== 'none' && dna.cut.kind,
    dna.core && 'core',
  ];
  return parts.filter(Boolean).join(' ');
}

export function blendFrom(anchor) {
  return (rng, { loose } = {}) => {
    const dna = recipeFor(anchor, rng, loose);
    const item = buildDna(dna);
    return item && { item, symmetry: 'auto', limits: BLEND_LIMITS, kind: structureOf(dna) };
  };
}
