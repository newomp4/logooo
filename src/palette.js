// Blurred mesh backgrounds for the colour icon, picked per seed.
import { createRng } from './gen/rng.js';

const PALETTES = [
  // ember, like the icons in the reference video
  ['#d9363e', '#f28c3a', '#f9d9b5', '#c2255c', '#a46bd6'],
  // tide, the blues from owenopacki.com
  ['#1543ac', '#0e75ff', '#2ad4ff', '#0d2156', '#b5ecff'],
  // marigold
  ['#ee4266', '#ff8c42', '#ffd23f', '#fff1d0', '#7b2cbf'],
  // grove
  ['#0f766e', '#22c55e', '#d9f99d', '#065f46', '#5eead4'],
  // dusk
  ['#6d28d9', '#c084fc', '#fbcfe8', '#db2777', '#1e1b4b'],
  // coral
  ['#ff5a5f', '#ffb199', '#ffe5d9', '#e5383b', '#ff8fab'],
];

export function meshFor(seed) {
  const rng = createRng(`${seed}:mesh`);
  const colors = PALETTES[Math.floor(rng.next() * PALETTES.length)];
  const [base, ...rest] = colors;
  const blobs = [...rest, rng.pick(rest)].map((color) => {
    const x = Math.round(rng.float(5, 95));
    const y = Math.round(rng.float(5, 95));
    const w = Math.round(rng.float(28, 60));
    const h = Math.round(w * rng.float(0.6, 1.4));
    return `radial-gradient(${w}% ${h}% at ${x}% ${y}%, ${color} 0%, transparent 70%)`;
  });
  const angle = Math.round(rng.float(100, 160));
  const streak = `linear-gradient(${angle}deg, transparent 38%, rgb(255 255 255 / 0.32) 48%, transparent 58%)`;
  return { base, mesh: [streak, ...blobs].join(', ') };
}
