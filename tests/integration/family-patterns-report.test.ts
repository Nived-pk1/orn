/**
 * Step 8.5e E4 (on demand, never in `npm test`): the CHEM-007 report for the owner's family patterns. Set ORN_E4=1. Reads the owner's newest export and the
 * patterns file from ..\fable-work\inputs, merges the patterns over the export's classes by ID (what Import > Merge does for a record with the same ID),
 * and runs the app's OWN membership code (`src/chem/checks/plan-species.ts`) on real RDKit: the same comparison the Studio's chem checks make, but for ALL
 * classes (the Studio tries the first 100 class SMARTS of a species and says the rest were not compared). Writes docs/reviews/family-patterns-chem007.md.
 * No chemistry judgement and no data edits: it lists.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, loadRdkit, type StructureToolkit } from '@/chem';
import { statedClasses, smartsClasses, MAX_CLASS_PROBES } from '@/chem/checks/plan-species';
import { documentToState } from '@/core/dataset/document';

const INPUTS = resolve(process.cwd(), '../fable-work/inputs');
const EXPORT = resolve(INPUTS, 'ORN-real-data-2026-11-24.orn.json');
const PATTERNS = resolve(INPUTS, 'FAMILY-PATTERNS.orn.json');
const on = process.env.ORN_E4 === '1' && existsSync(EXPORT) && existsSync(PATTERNS);

let toolkit: StructureToolkit;
beforeAll(async () => {
  if (!on) return;
  const shared = await loadRdkit();
  toolkit = createRdkitToolkit({ load: async () => shared });
  await toolkit.ready();
}, 60_000);

type Rec = { id: string; [k: string]: unknown };
const line = (s: { id: string; names: { canonical: string }; structure?: { value: string } }): string => `  - ${s.id} | ${s.names.canonical} | ${s.structure?.value ?? '(no structure)'}`;

describe.skipIf(!on)('CHEM-007 report for the family patterns (E4)', () => {
  it('writes docs/reviews/family-patterns-chem007.md', async () => {
    const doc = JSON.parse(readFileSync(EXPORT, 'utf8')) as { records: Record<string, Rec[]> };
    const patterns = JSON.parse(readFileSync(PATTERNS, 'utf8')) as { records: Record<string, Rec[]> };
    for (const kind of ['class', 'species']) {
      const table = new Map((doc.records[kind] ?? []).map((r) => [r.id, r] as const));
      for (const r of patterns.records[kind] ?? []) table.set(r.id, r);
      doc.records[kind] = [...table.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    }
    const parsed = documentToState(doc as never);
    if (!parsed.ok) throw new Error('duplicate IDs after the merge');
    const state = parsed.state;
    const classes = smartsClasses(state);
    const species = Object.values(state.records.species).filter((s) => s.structure !== undefined);
    const refused: string[] = [];
    const matchOf = new Map<string, Set<string>>(); // class id -> species ids that match
    for (const cls of classes) {
      const hits = new Set<string>();
      let refusedOnce = false;
      for (const s of species) {
        const out = await toolkit.matchesSmarts(s.structure as never, cls.generic?.smarts ?? '');
        if (!out.ok) {
          if (out.reason === 'invalid_smarts') {
            refusedOnce = true;
            break;
          }
          continue; // a structure that does not parse is CHEM-001's business
        }
        if (out.matches) hits.add(s.id);
      }
      if (refusedOnce) refused.push(`  - ${cls.id} | ${cls.names.canonical} | ${cls.generic?.smarts ?? ''}`);
      else matchOf.set(cls.id, hits);
    }
    const approximate = (id: string): boolean => (state.records.class[id]?.review?.reasons ?? []).some((r) => r.includes('~') || /pattern is approximate/i.test(r));
    const sections: string[] = [];
    let listedMiss = 0;
    let matchUnlisted = 0;
    let familiesWithMiss = 0;
    let familiesWithUnlisted = 0;
    for (const cls of classes) {
      const hits = matchOf.get(cls.id);
      if (hits === undefined) continue;
      const listed = species.filter((s) => s.classIds.includes(cls.id));
      const miss = listed.filter((s) => !hits.has(s.id));
      const extra = approximate(cls.id) ? undefined : species.filter((s) => hits.has(s.id) && !statedClasses(state, s.classIds).has(cls.id));
      listedMiss += miss.length;
      matchUnlisted += extra?.length ?? 0;
      if (miss.length > 0) familiesWithMiss += 1;
      if ((extra?.length ?? 0) > 0) familiesWithUnlisted += 1;
      sections.push(
        [`### ${cls.id} | ${cls.names.canonical}${approximate(cls.id) ? ' (approximate pattern: part b not made)' : ''}`, `SMARTS: ${cls.generic?.smarts ?? ''}`, `- listed in the family: ${listed.length}; match the pattern: ${hits.size}`, `- (a) listed but NOT matching (${miss.length}):`, ...miss.map(line), `- (b) matching but NOT listed (${extra === undefined ? 'not made' : extra.length}):`, ...(extra ?? []).map(line)].join('\n'),
      );
    }
    const beyond = classes.slice(MAX_CLASS_PROBES).map((c) => c.id);
    const head = [
      '# CHEM-007 report for the family patterns (step 8.5e, E4)',
      '',
      `Inputs: ${basename(EXPORT)} (${species.length} species with a structure) + ${basename(PATTERNS)} merged by ID. Made by tests/integration/family-patterns-report.test.ts (ORN_E4=1) with the app's own membership code on real RDKit. No chemistry judgement, no data edits.`,
      '',
      '## Counts',
      `- families with a pattern: ${classes.length}; patterns RDKit refused to parse: ${refused.length}`,
      `- (a) listed but not matching: ${listedMiss} compounds in ${familiesWithMiss} families`,
      `- (b) matching but not listed (families without an approximate pattern): ${matchUnlisted} compounds in ${familiesWithUnlisted} families`,
      `- families the Studio's own check would NOT try for a species (it tries the first ${MAX_CLASS_PROBES} class SMARTS by ID and says "not compared" for the rest): ${beyond.length}: ${beyond.join(', ')}`,
      '',
      '## (c) Patterns RDKit refused to parse',
      ...(refused.length === 0 ? ['  - none'] : refused),
      '',
      '## Per family',
      '',
    ];
    writeFileSync(resolve(process.cwd(), 'docs/reviews/family-patterns-chem007.md'), [...head, ...sections].join('\n') + '\n');
    expect(classes.length).toBeGreaterThan(0);
  }, 900_000);
});
