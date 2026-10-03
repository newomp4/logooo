// Rasterizes a mark at icon size and scores the detail that wouldn't survive
// there: ink thinner than ~5% of the mark, gaps narrower than that, specks,
// lots of loose pieces and small satellites floating away from the main body.

const N = 64;
const CELL = 100 / N;

function rasterize(shape) {
  const flat = shape.clone({ insert: false });
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
