// Renders a contact sheet of generated marks to an HTML file for eyeballing.
// usage: [PREFIX=s] [LOOSE=1] node scripts/sheet.js [family|all] [count] [out.html]
import { writeFileSync } from 'node:fs';
import { generate } from '../src/gen/index.js';

const [family = 'all', count = '48', out = 'sheet.html'] = process.argv.slice(2);
const marks = [];
const t0 = performance.now();
let failed = 0;
for (let i = 0; i < +count; i++) {
  const seed = `${process.env.PREFIX ?? 's'}${i}`;
  const m = generate(seed, family, { loose: !!process.env.LOOSE });
  if (m) marks.push(m); else failed++;
}
const ms = (performance.now() - t0) / +count;
const cells = marks.map((m) => `<figure><svg viewBox="0 0 ${m.width} ${m.height}"><path d="${m.d}" fill-rule="evenodd"/></svg><figcaption>${m.family} · ${m.symmetry} · ${m.seed} · ${m.fill}</figcaption></figure>`).join('');
writeFileSync(out, `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#fafafa;font:10px system-ui;display:grid;grid-template-columns:repeat(8,1fr);gap:0}figure{margin:0;padding:14px 10px 6px;display:flex;flex-direction:column;align-items:center;border:1px solid #eee}svg{width:90px;height:90px}figcaption{margin-top:6px;color:#999;white-space:nowrap}</style>${cells}`);
console.log(`${marks.length} ok, ${failed} failed, ${ms.toFixed(1)}ms avg`);
