// Generates map-layout.orn.json: a LAYOUT fixture (step 8.2a Part C), not chemistry. About the size of the user's real data:
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

const GROUPS = [
  { name: 'Hydrocarbons', tone: 'blue', count: 5, row: 0 },
  { name: 'Halogen compounds', tone: 'amber', count: 4, row: 1 },
  { name: 'Oxygen compounds', tone: 'green', count: 6, row: 2 },
  { name: 'Nitrogen compounds', tone: 'violet', count: 5, row: 3 },
];
const KINDS = ["reference","concept","species","class","reagent","transformation","named_reaction","mechanism","reaction","caveat","route","relationship","exam","exam_version","topic","topic_mapping","exam_relevance","asset","navigator_anchor","reaction_scheme","view_preset","entity_display"];
const pad = (n) => String(n).padStart(2, '0');
const families = [];
GROUPS.forEach((group) => {
  for (let i = 0; i < group.count; i += 1) families.push({ n: families.length + 1, group: group.name, tone: group.tone, column: i, row: group.row });
});
const clsId = (n) => `cls_family-${pad(n)}`;

const classes = [];
const anchors = [];
for (const f of families) {
  classes.push({ id: clsId(f.n), kind: 'class', names: { canonical: `Family ${pad(f.n)}`, common: [], aliases: [] }, classKind: 'compound_class', parentIds: [], generic: { formulaText: `R${pad(f.n)}` }, exampleSpeciesIds: [], tags: [], citations: [], provenance: prov, review });
  anchors.push({ id: `anc_family-${pad(f.n)}`, kind: 'navigator_anchor', target: { kind: 'class', id: clsId(f.n) }, order: f.n, cell: { column: f.column, row: f.row }, group: f.group, tone: f.tone, provenance: prov });
}
const ORPHANS = ['a', 'b', 'c'];
for (const o of ORPHANS) classes.push({ id: `cls_orphan-${o}`, kind: 'class', names: { canonical: `Orphan compound ${o.toUpperCase()}`, common: [], aliases: [] }, classKind: 'compound_class', parentIds: [], generic: { formulaText: `X${o}` }, exampleSpeciesIds: [], tags: [], citations: [], provenance: prov, review });

// ---- topics: one subject, three chapters, one section each
const topics = [{ id: 'top_layout', kind: 'topic', name: 'Layout fixture', aliases: [], topicKind: 'subject', order: 1, tags: [], citations: [], provenance: prov, review }];
const CHAPTERS = [1, 2, 3, 4];
for (const c of CHAPTERS) {
  topics.push({ id: `top_chapter-${c}`, kind: 'topic', name: `Chapter ${c}`, aliases: [], parentId: 'top_layout', topicKind: 'chapter', order: c, tags: [], citations: [], provenance: prov, review });
  topics.push({ id: `top_section-${c}`, kind: 'topic', name: `Section ${c}`, aliases: [], parentId: `top_chapter-${c}`, topicKind: 'section', order: 1, tags: [], citations: [], provenance: prov, review });
}

// ---- ordered pairs: 8 two-way couples (16 pairs), 5 loops, and one-way pairs up to 88 pairs in all (loops excluded)
const pairs = new Map();
const addPair = (a, b) => pairs.has(`${a}>${b}`) || a === b ? false : (pairs.set(`${a}>${b}`, [a, b]), true);
const COUPLES = [[1, 6], [2, 11], [3, 12], [6, 11], [7, 16], [12, 17], [8, 13], [14, 19]];
for (const [a, b] of COUPLES) {
  addPair(a, b);
  addPair(b, a);
}
while (pairs.size < 88) addPair(1 + next(20), 1 + next(20));
const LOOPS = [2, 7, 12, 14, 19];

const reactions = [];
const mappings = [];
let counter = 0;
const addReaction = (fromClass, toClass, chapter) => {
  counter += 1;
  const id = `rxn_layout-${pad(counter)}`;
  const part = `prt_layout-${pad(counter)}-1`;
  reactions.push({
    id,
    kind: 'reaction',
    name: `Layout reaction ${pad(counter)}`,
    aliases: [],
    scope: 'generic',
    purposes: ['synthesis'],
    namedReactionIds: [],
    transformationIds: [],
    reactionTypes: [],
    mechanismClasses: [],
    participants: [{ id: part, ref: { kind: 'class', id: fromClass }, role: 'reactant', isPrimarySubstrate: true }],
    stages: [{ id: `stg_layout-${pad(counter)}-1`, kind: 'reaction', label: 'step', participantIds: [part], parameters: { solventCharacter: [], activation: [], other: [], parsedFields: [] } }],
    conditionVariants: [],
    outcomes: [{ id: `out_layout-${pad(counter)}-1`, conditionVariantIds: [], selectivity: 'exclusive', products: [{ id: `pdt_layout-${pad(counter)}-1-1`, ref: { kind: 'class', id: toClass }, role: 'main' }], conceptIds: [] }],
    intermediates: [],
    mechanismIds: [],
    reversibility: { kind: 'irreversible' },
    conceptIds: [],
    prerequisiteConceptIds: [],
    tags: [],
    citations: [],
    provenance: prov,
    review,
  });
  mappings.push({ id: `tmp_layout-${pad(counter)}`, kind: 'topic_mapping', topicId: `top_section-${chapter}`, target: { kind: 'reaction', id }, role: 'core', tags: [], citations: [], provenance: prov, review });
};
let pairNo = 0;
for (const [a, b] of pairs.values()) {
  pairNo += 1;
  const many = pairNo % 7 === 0 ? 4 : pairNo % 3 === 0 ? 2 : 1;
  // the first arrow of every two-way couple sits in chapter 1 (so a chapter shows merged pairs); the others of a pair can sit in other chapters
  const coupled = COUPLES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (let k = 0; k < many; k += 1) addReaction(clsId(a), clsId(b), coupled && k === 0 ? 1 : 1 + ((pairNo + k) % 3));
}
for (const f of LOOPS) for (let k = 0; k < f % 4 + 1; k += 1) addReaction(clsId(f), clsId(f), 1 + ((f + k) % 3));
for (let k = 0; k < 6; k += 1) addReaction(clsId(1 + next(20)), `cls_orphan-${ORPHANS[k % 3]}`, 1 + (k % 3));

// ---- Chapter 4 (step 8.2b-fix, E5): a SMALL chapter that is not busy (3 arrows after merging): one two-way pair (8 and 13, both ways) and two one-way arrows
// on pairs that already exist, so the whole map still has 88 arrows
addReaction(clsId(8), clsId(13), 4);
addReaction(clsId(13), clsId(8), 4);
for (const [a, b] of [...pairs.values()].filter(([x, y]) => x < y && ![x, y].some((n) => [8, 13].includes(n))).slice(0, 2)) addReaction(clsId(a), clsId(b), 4);

const document = {
  format: 'orn.dataset',
  schemaVersion: 2,
  exportedAt: STAMP,
  exportScope: 'full',
  generator: { app: 'orn-map-layout-fixture', version: '1' },
  meta: { datasetId: 'orn-map-layout', title: 'Map layout fixture', description: 'Generated layout fixture (step 8.2a). Not chemistry.', createdAt: STAMP, updatedAt: STAMP },
  records: { ...Object.fromEntries(KINDS.map((kind) => [kind, []])), class: classes, navigator_anchor: anchors, topic: topics, topic_mapping: mappings, reaction: reactions },
};
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'map-layout.orn.json'), `${JSON.stringify(document, null, 1)}\n`);
process.stdout.write(`families ${families.length}, pairs ${pairs.size}, reactions ${reactions.length}
`);
