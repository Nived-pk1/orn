/**
 * Test-only data for step 7.7 Part C: changed COPIES of the demo (imported as the visitor's own data; the demo's chemistry file is never
 * edited) with enough records to cut each list at its page size. Used by phase-7-dod.spec.ts and study-explorers.spec.ts.
 */
import { changedDemo, recordsOf } from './own-data-kit';
import type { UploadFile } from './kit';

type Loose = { id: string; name?: string; names?: { canonical: string }; summary?: string; variants?: { id: string; steps: { id: string }[] }[]; units?: unknown[] };

const META = { tags: [], citations: [], provenance: { origin: 'seed', createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z' }, review: { lifecycle: 'published', status: 'unreviewed', reasons: [] } };
const pad = (n: number): string => String(n).padStart(2, '0');
const copyOf = <T>(one: T): T => JSON.parse(JSON.stringify(one)) as T;

/** Named reactions, mechanisms and reagents: each list gets more than 30 entries; the clones have no reaction, so "Only <exam>" drops them. */
export function longListsDemo(): UploadFile {
  return changedDemo((records) => {
    const named = recordsOf<Loose>(records, 'named_reaction')[0] as Loose;
    const mechanism = recordsOf<Loose>(records, 'mechanism')[0] as Loose;
    const reagent = recordsOf<Loose>(records, 'reagent')[0] as Loose;
    for (let i = 1; i <= 35; i += 1) {
      const n = { ...copyOf(named), id: `nrx_zz-long-${pad(i)}`, name: `Zz named ${pad(i)}`, aliases: [] };
      (records['named_reaction'] as Loose[]).push(n);
    }
    for (let i = 1; i <= 33; i += 1) {
      const m = copyOf(mechanism);
      m.id = `mec_zz-long-${pad(i)}`;
      m.name = `Zz mechanism ${pad(i)}`;
      for (const variant of m.variants ?? []) {
        variant.id = `${variant.id}-zz${pad(i)}`;
        for (const step of variant.steps) step.id = `${step.id}-zz${pad(i)}`;
      }
      (records['mechanism'] as Loose[]).push(m);
    }
    for (let i = 1; i <= 20; i += 1) {
      const r = { ...copyOf(reagent), id: `rgt_zz-long-${pad(i)}`, names: { canonical: `Zz reagent ${pad(i)}`, common: [], aliases: [] } };
      (records['reagent'] as Loose[]).push(r);
    }
  });
}

/** One chapter (Hydrocarbons) gets 35 written concepts (a group of 35 is cut at 30); the Syllabus gets a unit of 65 topics under it. */
export function longChapterDemo(): UploadFile {
  return changedDemo((records) => {
    const idea = recordsOf<Loose>(records, 'concept')[0] as Loose;
    for (let i = 1; i <= 35; i += 1) {
      const c = { ...copyOf(idea), id: `cpt_zz-long-${pad(i)}`, name: `Zz idea ${pad(i)}`, summary: `Zz idea ${pad(i)} is explained here.`, parentIds: [] };
      (records['concept'] as Loose[]).push(c);
      (records['topic_mapping'] as object[]).push({ id: `tmp_zz-long-${pad(i)}`, kind: 'topic_mapping', topicId: 'top_hydrocarbons', target: { kind: 'concept', id: c.id }, role: 'core', ...META });
    }
    const topics = records['topic'] as object[];
    const coverage: object[] = [];
    for (let i = 1; i <= 65; i += 1) {
      topics.push({ id: `top_zz-long-${pad(i)}`, kind: 'topic', name: `Zz topic ${pad(i)}`, aliases: [], parentId: 'top_hydrocarbons', topicKind: 'topic', order: 100 + i, ...META });
      coverage.push({ topicId: `top_zz-long-${pad(i)}`, coverage: 'included' });
    }
    const versions = recordsOf<{ id: string; units: { id: string; title: string; topicCoverage: object[] }[] }>(records, 'exam_version');
    const main = versions.find((v) => v.id === 'exv_jee-main-2026');
    main?.units.push({ id: 'unt_zz-long', title: 'Zz long unit', topicCoverage: coverage });
  });
}
