// Generates chain-line.orn.json (step C): SEVEN families in a line f1 > f2 > ... > f7, one generic reaction per arrow, one chapter. A 5-step chain (f1 to f6),
// a 6-level precursor walk (back from f7); plus a bush g1 > m1..m6 > g2 (six 2-step chains, for "5 of 7 chains" at 5 steps with the line f1..f6 untouched). Layout/behaviour fixture, not chemistry. Run: node tests/fixtures/chain-line/generate.mjs
// (adapted from: a LAYOUT fixture (step 8.2a Part C), not chemistry. About the size of the user's real data:
// 20 families in 4 groups, 88 family-to-family arrows (ordered pairs), 8 two-way pairs, 5 families with reactions inside the family,
// 6 reactions into compounds that are in no family, reactions spread over 3 chapters with arrows that cross chapters, and a 4th small chapter
// (not busy: one two-way pair and two one-way arrows).
// Deterministic (a small LCG, no clock). Run: node tests/fixtures/map-layout/generate.mjs
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STAMP = '2026-11-04T00:00:00.000Z';
const prov = { origin: 'seed', createdAt: STAMP, updatedAt: STAMP };
const review = { lifecycle: 'published', status: 'unreviewed', reasons: [] };
let seed = 20261104;
const next = (n) => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return (seed >>> 8) % n;
};


const KINDS = ["reference","concept","species","class","reagent","transformation","named_reaction","mechanism","reaction","caveat","route","relationship","exam","exam_version","topic","topic_mapping","exam_relevance","asset","navigator_anchor","reaction_scheme","view_preset","entity_display"];
const pad = (n) => String(n).padStart(2, '0');
const N = 7;
const BUSH = ['g1', 'g2', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6'];
const clsId = (n) => (typeof n === 'number' ? `cls_line-${pad(n)}` : `cls_bush-${n}`);
const classes = [];
const anchors = [];
for (let n = 1; n <= N; n += 1) {
  classes.push({ id: clsId(n), kind: 'class', names: { canonical: `Line ${pad(n)}`, common: [], aliases: [] }, classKind: 'compound_class', parentIds: [], generic: { formulaText: `R${pad(n)}` }, exampleSpeciesIds: [], tags: [], citations: [], provenance: prov, review });
  anchors.push({ id: `anc_line-${pad(n)}`, kind: 'navigator_anchor', target: { kind: 'class', id: clsId(n) }, order: n, cell: { column: n - 1, row: 0 }, group: 'Line', tone: 'blue', provenance: prov });
}
for (const [i, b] of BUSH.entries()) {
  classes.push({ id: clsId(b), kind: 'class', names: { canonical: `Bush ${b}`, common: [], aliases: [] }, classKind: 'compound_class', parentIds: [], generic: { formulaText: `B${b}` }, exampleSpeciesIds: [], tags: [], citations: [], provenance: prov, review });
  anchors.push({ id: `anc_bush-${b}`, kind: 'navigator_anchor', target: { kind: 'class', id: clsId(b) }, order: N + 1 + i, cell: { column: i, row: 1 }, group: 'Bush', tone: 'amber', provenance: prov });
}
const topics = [
  { id: 'top_line', kind: 'topic', name: 'Line fixture', aliases: [], topicKind: 'subject', order: 1, tags: [], citations: [], provenance: prov, review },
  { id: 'top_chapter-1', kind: 'topic', name: 'Chapter 1', aliases: [], parentId: 'top_line', topicKind: 'chapter', order: 1, tags: [], citations: [], provenance: prov, review },
  { id: 'top_section-1', kind: 'topic', name: 'Section 1', aliases: [], parentId: 'top_chapter-1', topicKind: 'section', order: 1, tags: [], citations: [], provenance: prov, review },
];
const reactions = [];
const mappings = [];
const arrows = [];
for (let n = 1; n < N; n += 1) arrows.push([`line-${pad(n)}`, clsId(n), clsId(n + 1)]);
for (const m of BUSH.slice(2)) arrows.push([`bush-g1-${m}`, clsId('g1'), clsId(m)], [`bush-${m}-g2`, clsId(m), clsId('g2')]);
for (const [name, from, to] of arrows) {
  const id = `rxn_${name}`;
  const part = `prt_${name}-1`;
  reactions.push({
    id, kind: 'reaction', name: `Reaction ${name}`, aliases: [], scope: 'generic', purposes: ['synthesis'], namedReactionIds: [], transformationIds: [], reactionTypes: [], mechanismClasses: [],
    participants: [{ id: part, ref: { kind: 'class', id: from }, role: 'reactant', isPrimarySubstrate: true }],
    stages: [{ id: `stg_${name}-1`, kind: 'reaction', label: 'step', participantIds: [part], parameters: { solventCharacter: [], activation: [], other: [], parsedFields: [] } }],
    conditionVariants: [],
    outcomes: [{ id: `out_${name}-1`, conditionVariantIds: [], selectivity: 'exclusive', products: [{ id: `pdt_${name}-1-1`, ref: { kind: 'class', id: to }, role: 'main' }], conceptIds: [] }],
    intermediates: [], mechanismIds: [], reversibility: { kind: 'irreversible' }, conceptIds: [], prerequisiteConceptIds: [], tags: [], citations: [], provenance: prov, review,
  });
  mappings.push({ id: `tmp_${name}`, kind: 'topic_mapping', topicId: 'top_section-1', target: { kind: 'reaction', id }, role: 'core', tags: [], citations: [], provenance: prov, review });
}
const document = {
  format: 'orn.dataset', schemaVersion: 2, exportedAt: STAMP, exportScope: 'full', generator: { app: 'orn-chain-line-fixture', version: '1' },
  meta: { datasetId: 'orn-chain-line', title: 'Chain line fixture', description: 'Generated fixture (step C). Not chemistry.', createdAt: STAMP, updatedAt: STAMP },
  records: { ...Object.fromEntries(KINDS.map((kind) => [kind, []])), class: classes, navigator_anchor: anchors, topic: topics, topic_mapping: mappings, reaction: reactions },
};
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'chain-line.orn.json'), `${JSON.stringify(document, null, 1)}
`);
process.stdout.write(`families ${N + BUSH.length}, reactions ${reactions.length}
`);
