/**
 * A generated LAYOUT dataset the size of the owner's full content (step 8.4m): 17 families on the map in the owner's cells (5 columns,
 * 5 rows), 3 compounds in no family, 650 reactions, 159 ordered family pairs (143 between two different boxes of the 17, 16 inside a
 * family) plus the pairs with the bucket. NOT chemistry and not the owner's data: names are "Family 01" and so on.
 * Shapes the map is judged on:
 *  - more than 120 ordered pairs (the old drawing limit cut 39 of the owner's);
 *  - BUSY (Family 08): 18 lines to and from other families (more than 15, at most 30);
 *  - CROWDED (Family 12): both ways with every other family, 32 lines (more than 30);
 *  - QUIET (Family 17): 4 lines.
 * Deterministic (a small LCG, no clock, no random). Built in memory by each test; never written to disk.
 */
const STAMP = '2026-11-15T00:00:00.000Z';
const prov = { origin: 'seed', createdAt: STAMP, updatedAt: STAMP };
const review = { lifecycle: 'published', status: 'unreviewed', reasons: [] as string[] };
const KINDS = ['reference', 'concept', 'species', 'class', 'reagent', 'transformation', 'named_reaction', 'mechanism', 'reaction', 'caveat', 'route', 'relationship', 'exam', 'exam_version', 'topic', 'topic_mapping', 'exam_relevance', 'asset', 'navigator_anchor', 'reaction_scheme', 'view_preset', 'entity_display'];

/** [column, row, group, tone] of the 17 families: the owner's arrangement. */
const CELLS: readonly (readonly [number, number, string, string])[] = [
  [0, 0, 'Hydrocarbons', 'blue'], [1, 0, 'Hydrocarbons', 'blue'], [2, 0, 'Hydrocarbons', 'blue'], [4, 0, 'Hydrocarbons', 'blue'],
  [0, 1, 'Halogen compounds', 'amber'], [1, 1, 'Oxygen compounds', 'green'], [2, 1, 'Oxygen compounds', 'green'],
  [1, 2, 'Oxygen compounds', 'green'], [2, 2, 'Oxygen compounds', 'green'], [3, 2, 'Halogen compounds', 'amber'], [4, 2, 'Oxygen compounds', 'green'],
  [1, 3, 'Oxygen compounds', 'green'], [2, 3, 'Oxygen compounds', 'green'], [3, 3, 'Nitrogen compounds', 'violet'], [4, 3, 'Nitrogen compounds', 'violet'],
  [1, 4, 'Oxygen compounds', 'green'], [2, 4, 'Nitrogen compounds', 'violet'],
];
export const FULL_MAP_FAMILIES = CELLS.length;
export const FULL_MAP_REACTIONS = 650;
const pad = (n: number): string => String(n).padStart(2, '0');
export const familyId = (n: number): string => `cls_family-${pad(n)}`;
export const BUSY_FAMILY = familyId(8);
export const CROWDED_FAMILY = familyId(12);
export const QUIET_FAMILY = familyId(17);
const BUSY_OUT = [1, 2, 3, 5, 6, 9, 12, 13, 14, 16];
const BUSY_IN = [2, 4, 6, 7, 9, 10, 12, 15];
const QUIET = [[17, 12], [12, 17], [17, 13], [9, 17]] as const;
const BETWEEN_PAIRS = 143;
const ORPHANS = ['a', 'b', 'c'] as const;

export interface FullMapFacts {
  /** Ordered pairs between two different families of the 17. */
  readonly between: number;
  readonly loops: number;
  /** Ordered pairs with the bucket at one end. */
  readonly bucket: number;
  readonly reactions: number;
}

export function fullMap(): { readonly document: unknown; readonly facts: FullMapFacts } {
  let seed = 20261115;
  const next = (n: number): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return (seed >>> 8) % n;
  };
  const classes: unknown[] = [];
  const anchors: unknown[] = [];
  CELLS.forEach(([column, row, group, tone], at) => {
    const n = at + 1;
    classes.push({ id: familyId(n), kind: 'class', names: { canonical: `Family ${pad(n)}`, common: [], aliases: [] }, classKind: 'compound_class', parentIds: [], generic: { formulaText: `R${pad(n)}` }, exampleSpeciesIds: [], tags: [], citations: [], provenance: prov, review });
    anchors.push({ id: `anc_family-${pad(n)}`, kind: 'navigator_anchor', target: { kind: 'class', id: familyId(n) }, order: n, cell: { column, row }, group, tone, provenance: prov });
  });
  for (const o of ORPHANS) classes.push({ id: `cls_orphan-${o}`, kind: 'class', names: { canonical: `Orphan compound ${o.toUpperCase()}`, common: [], aliases: [] }, classKind: 'compound_class', parentIds: [], generic: { formulaText: `X${o}` }, exampleSpeciesIds: [], tags: [], citations: [], provenance: prov, review });

  const topics: unknown[] = [{ id: 'top_full', kind: 'topic', name: 'Full map fixture', aliases: [], topicKind: 'subject', order: 1, tags: [], citations: [], provenance: prov, review }];
  for (const c of [1, 2, 3, 4]) {
    topics.push({ id: `top_chapter-${c}`, kind: 'topic', name: `Chapter ${c}`, aliases: [], parentId: 'top_full', topicKind: 'chapter', order: c, tags: [], citations: [], provenance: prov, review });
    topics.push({ id: `top_section-${c}`, kind: 'topic', name: `Section ${c}`, aliases: [], parentId: `top_chapter-${c}`, topicKind: 'section', order: 1, tags: [], citations: [], provenance: prov, review });
  }

  // ordered pairs between two different families
  const pairs = new Map<string, readonly [number, number]>();
  const add = (a: number, b: number): void => {
    if (a !== b && !pairs.has(`${a}>${b}`)) pairs.set(`${a}>${b}`, [a, b]);
  };
  for (let n = 1; n <= FULL_MAP_FAMILIES; n += 1) {
    if (n === 12 || n === 17) continue;
    add(12, n);
    add(n, 12);
  }
  for (const b of BUSY_OUT) add(8, b);
  for (const a of BUSY_IN) add(a, 8);
  for (const [a, b] of QUIET) add(a, b);
  const fixed = (n: number): boolean => n === 8 || n === 12 || n === 17;
  for (let guard = 0; pairs.size < BETWEEN_PAIRS && guard < 100_000; guard += 1) {
    const a = 1 + next(FULL_MAP_FAMILIES);
    const b = 1 + next(FULL_MAP_FAMILIES);
    if (!fixed(a) && !fixed(b)) add(a, b);
  }
  const ends: (readonly [string, string])[] = [...pairs.values()].map(([a, b]) => [familyId(a), familyId(b)] as const);
  const between = ends.length;
  // inside a family: every family but the last
  for (let n = 1; n < FULL_MAP_FAMILIES; n += 1) ends.push([familyId(n), familyId(n)]);
  const loops = ends.length - between;
  // the bucket: into compounds of no family, and out of them
  [8, 12, 1, 5, 9, 14].forEach((n, k) => ends.push([familyId(n), `cls_orphan-${ORPHANS[k % 3]}`]));
  [8, 12, 2, 6, 13].forEach((n, k) => ends.push([`cls_orphan-${ORPHANS[k % 3]}`, familyId(n)]));

  // one reaction per pair, then the rest handed out by the LCG to every other pair (so half the pairs stay at ONE reaction)
  const counts = ends.map(() => 1);
  for (let left = FULL_MAP_REACTIONS - ends.length; left > 0; left -= 1) {
    const at = next(ends.length);
    const even = at - (at % 2);
    counts[even] = (counts[even] as number) + 1;
  }

  const reactions: unknown[] = [];
  const mappings: unknown[] = [];
  let counter = 0;
  ends.forEach(([from, to], at) => {
    for (let k = 0; k < (counts[at] as number); k += 1) {
      counter += 1;
      const tag = String(counter).padStart(3, '0');
      const id = `rxn_full-${tag}`;
      const part = `prt_full-${tag}-1`;
      reactions.push({
        id,
        kind: 'reaction',
        name: `Full map reaction ${tag}`,
        aliases: [],
        scope: 'generic',
        purposes: ['synthesis'],
        namedReactionIds: [],
        transformationIds: [],
        reactionTypes: [],
        mechanismClasses: [],
        participants: [{ id: part, ref: { kind: 'class', id: from }, role: 'reactant', isPrimarySubstrate: true }],
        stages: [{ id: `stg_full-${tag}-1`, kind: 'reaction', label: 'step', participantIds: [part], parameters: { solventCharacter: [], activation: [], other: [], parsedFields: [] } }],
        conditionVariants: [],
        outcomes: [{ id: `out_full-${tag}-1`, conditionVariantIds: [], selectivity: 'exclusive', products: [{ id: `pdt_full-${tag}-1-1`, ref: { kind: 'class', id: to }, role: 'main' }], conceptIds: [] }],
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
      mappings.push({ id: `tmp_full-${tag}`, kind: 'topic_mapping', topicId: `top_section-${1 + ((at + k) % 4)}`, target: { kind: 'reaction', id }, role: 'core', tags: [], citations: [], provenance: prov, review });
    }
  });

  const document = {
    format: 'orn.dataset',
    schemaVersion: 2,
    exportedAt: STAMP,
    exportScope: 'full',
    generator: { app: 'orn-full-map-fixture', version: '1' },
    meta: { datasetId: 'orn-full-map', title: 'Full map fixture', description: 'Generated layout fixture (step 8.4m). Not chemistry.', createdAt: STAMP, updatedAt: STAMP },
    records: { ...Object.fromEntries(KINDS.map((kind) => [kind, [] as unknown[]])), class: classes, navigator_anchor: anchors, topic: topics, topic_mapping: mappings, reaction: reactions },
  };
  return { document, facts: { between, loops, bucket: 11, reactions: reactions.length } };
}
