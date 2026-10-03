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
  // families with a plan settle it once per mark (a fresh plan only if one fails)
  for (let round = 0; round < 3 && !found.length; round++) {
    const plan = FAMILIES[name].plan?.(rng, { loose });
    for (let attempt = 0; attempt < 50 && found.length < want; attempt++) {
      try {
        const built = FAMILIES[name].build(rng, { loose, plan });
        if (!built?.item) continue;
        const mark = finalize(built.item, { ...built.limits, loose }, { label: built.symmetry, axis: built.axis });
        if (mark) found.push({ seed, family: name, ...mark, symmetry: mark.symmetry ?? built.symmetry });
      } catch {
        // a degenerate boolean op; roll again
      }
    }
  }
  if (!found.length) return null;
  // pick at random among the candidates close to the best, not always the
  // top one: the top one tends to be the same kind of mark every time
  const scored = found.map((m) => [m, appeal(m)]);
  const top = Math.max(...scored.map(([, s]) => s));
  const close = scored.filter(([, s]) => s >= top - 0.12).map(([m]) => m);
  return close[Math.floor(rng.next() * close.length)];
}
