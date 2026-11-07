import fs from 'fs';
const norm = (k) => {
  const i = k.lastIndexOf('node_modules/');
  if (i >= 0) return k.slice(i);
  const j = k.indexOf('src/');
  return j >= 0 ? k.slice(j) : k;
};
const load = (p) => {
  const r = JSON.parse(fs.readFileSync(p, 'utf8')).chunks.find((x) => /assets\/index-/.test(x.file)).rendered;
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [norm(k), v]));
};
const [, , basep, newp, n] = process.argv;
const a = load(basep);
const b = load(newp);
const rows = [];
for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
  const d = (b[k] || 0) - (a[k] || 0);
  if (d) rows.push([d, k, a[k] || 0, b[k] || 0]);
}
rows.sort((x, y) => y[0] - x[0]);
console.log('total raw delta', rows.reduce((s, r) => s + r[0], 0));
for (const r of rows.slice(0, +n || 12)) console.log(String(r[0]).padStart(7), r[1], `(${r[2]} -> ${r[3]})`);
