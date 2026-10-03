import { createRng, randomSeed } from './rng.js';
import { finalize } from './geom.js';
import { FAMILIES } from './families.js';

export { randomSeed };
export const FAMILY_NAMES = Object.keys(FAMILIES);

const WEIGHTS = Object.entries(FAMILIES).map(([name, f]) => [name, f.weight]);

// Same seed + family always yields the same mark.
export function generate(seed, family = 'all') {
  const rng = createRng(seed);
  const name = FAMILIES[family] ? family : rng.weighted(WEIGHTS);
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const built = FAMILIES[name].build(rng);
      if (!built?.item) continue;
      const mark = finalize(built.item, built.limits, { label: built.symmetry, axis: built.axis });
      if (mark) return { seed, family: name, symmetry: built.symmetry, ...mark };
    } catch {
      // a degenerate boolean op; roll again
    }
  }
  return null;
}
