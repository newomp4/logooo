import { createRng, randomSeed } from './rng.js';
import { finalize, paper } from './geom.js';
import { FAMILIES } from './families.js';
import { signature, likeness, appeal } from './legibility.js';

export { randomSeed, likeness };
export const FAMILY_NAMES = Object.keys(FAMILIES);
export const FAMILY_INFO = Object.fromEntries(Object.entries(FAMILIES).map(([name, f]) => [name, { weight: f.weight, loose: !!f.loose }]));

// Silhouette for marks saved before signatures existed.
export function signatureOf(d) {
  return signature(new paper.CompoundPath(d));
}

const WEIGHTS = Object.entries(FAMILIES).map(([name, f]) => [name, f.weight]);

// Same seed + family always yields the same mark.
// `loose` also allows asymmetric (but balanced) marks. Families with `pick`
// grow that many candidates and keep the most appealing one.
export function generate(seed, family = 'all', { loose = false } = {}) {
  const rng = createRng(seed);
  const pool = WEIGHTS.filter(([name]) => loose || !FAMILIES[name].loose);
  const name = FAMILIES[family] ? family : rng.weighted(pool);
  const want = FAMILIES[name].pick ?? 1;
  const found = [];
  for (let attempt = 0; attempt < 60 && found.length < want; attempt++) {
    try {
      const built = FAMILIES[name].build(rng, { loose });
      if (!built?.item) continue;
      const mark = finalize(built.item, { ...built.limits, loose }, { label: built.symmetry, axis: built.axis });
      if (mark) found.push({ seed, family: name, ...mark, symmetry: mark.symmetry ?? built.symmetry });
    } catch {
      // a degenerate boolean op; roll again
    }
  }
  if (!found.length) return null;
  return found.reduce((best, m) => (appeal(m) > appeal(best) ? m : best));
}
