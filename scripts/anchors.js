// Renders each reference recipe as written, then loosened and crossed variants.
// Red outlines failed the quality checks.
// usage: node scripts/anchors.js [out.html] [variants]
import { writeFileSync } from 'node:fs';
import { createRng } from '../src/gen/rng.js';
import { finalize, lastReject } from '../src/gen/geom.js';
import { ANCHORS, ANCHOR_NAMES, BLEND_LIMITS, buildDna, blendFrom } from '../src/gen/blend.js';

const [out = 'anchors.html', count = '7'] = process.argv.slice(2);
const cell = (item, mark, caption) => {
  if (!item) return `<figure><div class=x>×</div><figcaption>${caption}</figcaption></figure>`;
  const b = item.bounds;
  const pad = Math.max(b.width, b.height) * 0.06;
  return `<figure class="${mark ? '' : 'fail'}"><svg viewBox="${b.x - pad} ${b.y - pad} ${b.width + 2 * pad} ${b.height + 2 * pad}"><path d="${item.getPathData(null, 2)}" fill-rule="evenodd"/></svg><figcaption>${caption}${mark ? ' · ' + mark.symmetry : ' · ' + lastReject}</figcaption></figure>`;
};
const rows = ANCHOR_NAMES.map((name) => {
  const cells = [];
  let item = null;
  try { item = buildDna(ANCHORS[name]); } catch (e) { console.log(name, e.message); }
  const mark = item && finalize(item.clone({ insert: false }), BLEND_LIMITS, { label: 'auto' });
  cells.push(cell(item, mark, `<b>${name}</b>`));
  for (let i = 0; i < +count; i++) {
    const rng = createRng(`${name}${i}`);
    let built = null;
    try { built = blendFrom(name)(rng); } catch (e) { console.log(name, i, e.message); }
    const m = built?.item && finalize(built.item.clone({ insert: false }), built.limits, { label: 'auto' });
    cells.push(cell(built?.item, m, `${i}`));
  }
  return cells.join('');
}).join('');
writeFileSync(out, `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#fafafa;font:10px system-ui;display:grid;grid-template-columns:repeat(${+count + 1},1fr)}figure{margin:0;padding:12px 8px 6px;display:flex;flex-direction:column;align-items:center;border:1px solid #eee}figure.fail svg path{fill:#c33}svg{width:84px;height:84px}figcaption{margin-top:6px;color:#999}.x{width:84px;height:84px;display:grid;place-items:center;color:#c33;font-size:30px}</style>${rows}`);
