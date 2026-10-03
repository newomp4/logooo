// Flat colour pairs for the colour app-icon preview, picked per seed.
import { createRng } from './gen/rng.js';

// [background, mark]
const TINTS = [
  ['#2a44ff', '#f3efe6'], // cobalt / cream
  ['#c5f03a', '#121212'], // lime / ink
  ['#ff5a1f', '#fff3e8'], // tangerine / paper
  ['#14204a', '#9ad8ff'], // navy / ice
  ['#ffcf33', '#1a1a1a'], // sunflower / ink
  ['#0f7a5c', '#e6fbe8'], // emerald / mint
  ['#c7b5ff', '#24124d'], // lilac / plum
  ['#ff86c2', '#2a0a1c'], // bubblegum / maroon
  ['#ebe3d2', '#c2410c'], // sand / rust
  ['#0fb5ae', '#062a2a'], // teal / deep
];

export function tintFor(seed) {
  const [bg, fg] = TINTS[Math.floor(createRng(`${seed}:tint`).next() * TINTS.length)];
  return { bg, fg };
}
