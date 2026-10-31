/**
 * Test-only data for step 7.3b: a changed COPY of the demo (imported as the visitor's own data; the demo's chemistry file is never edited).
 * It adds a generic Hinsberg-style reaction whose class product has `originalText` ("C₆H₅–SO₂–NHR"), one concept mapped nowhere, and topic
 * mappings that put a record of EVERY kind into two chapters: core records in "Alcohols, phenols and ethers", supporting ones in
 * "Aldehydes, ketones and carboxylic acids". Used by chapters.spec.ts, as-written.spec.ts and phone-chapters.spec.ts.
 */
import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import { changedDemo, recordsOf } from './own-data-kit';
import type { UploadFile } from './kit';

export const CHAPTER_A = 'Alcohols, phenols and ethers';
export const CHAPTER_B = 'Aldehydes, ketones and carboxylic acids';
export const HINSBERG = 'Zz Hinsberg reaction (generic)';
export const UNMAPPED = 'Zz unmapped idea';
export const WRITTEN = 'C₆H₅–SO₂–NHR';

type Loose = { id: string; kind?: string; name?: string; names?: { canonical: string }; generic?: { formulaText?: string }; participants?: { ref: { kind: string; id: string }; originalText?: string }[]; outcomes?: { products: { ref: { kind: string; id: string }; originalText?: string }[] }[] };

const META = { tags: [], citations: [], provenance: { origin: 'seed', createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z' }, review: { lifecycle: 'published', status: 'unreviewed', reasons: [] } };

/** Core records of chapter A, supporting records of chapter B: one of every kind the chapter page groups. */
const CORE: readonly (readonly [string, string])[] = [
  ['concept', 'cpt_oxidation'],
  ['named_reaction', 'nrx_aldol'],
  ['mechanism', 'mec_aldol-ethanal'],
  ['caveat', 'cav_alcl3-not-catalytic'],
  ['species', 'spc_dichloromethane'],
  ['class', 'cls_alcohols-primary'],
  ['reagent', 'rgt_pcc'],
  ['route', 'rte_aniline-to-phenol'],
  ['transformation', 'trf_alcohol1-to-aldehyde'],
  ['reaction', 'rxn_zz-hinsberg'],
];
const SUPPORTING: readonly (readonly [string, string])[] = [
  ['concept', 'cpt_addition'],
  ['species', 'spc_1-bromopropane'],
  ['reaction', 'rxn_alcohol1-to-aldehyde-pcc'],
];

const mapping = (n: number, topic: string, target: readonly [string, string], role: string): object => ({
  id: `tmp_zz-chapters-${n}`,
  kind: 'topic_mapping',
  topicId: topic,
  target: { kind: target[0], id: target[1] },
  role,
  ...META,
});

export function chaptersDemo(): UploadFile {
  return changedDemo((records) => {
    const classes = records['class'] as Loose[];
    const base = recordsOf<Loose>(records, 'class').find((one) => one.id === 'cls_acyl-halides');
    const pcc = recordsOf<Loose>(records, 'reaction').find((one) => one.id === 'rxn_alcohol1-to-aldehyde-pcc');
    const idea = recordsOf<Loose>(records, 'concept').find((one) => one.id === 'cpt_addition');
    if (base === undefined || pcc === undefined || idea === undefined) throw new Error('the demo lacks the records the chapters kit copies');
    const amines = { ...JSON.parse(JSON.stringify(base)), id: 'cls_zz-primary-amines', names: { canonical: 'Primary amines', common: [], aliases: [] }, generic: { formulaText: 'R–NH₂' }, exampleSpeciesIds: [] } as Loose;
    const sulfonamides = { ...JSON.parse(JSON.stringify(base)), id: 'cls_zz-sulfonamides', names: { canonical: 'Sulfonamides', common: [], aliases: [] }, generic: { formulaText: 'R–SO₂–NHR' }, exampleSpeciesIds: [] } as Loose;
    classes.push(amines, sulfonamides);
    const hinsberg = JSON.parse(JSON.stringify(pcc).split('alcohol1-to-aldehyde-pcc').join('zz-hinsberg')) as Loose;
    hinsberg.id = 'rxn_zz-hinsberg';
    hinsberg.name = HINSBERG;
    const substrate = hinsberg.participants?.find((p) => p.ref.kind === 'class');
    if (substrate !== undefined) {
      substrate.ref = { kind: 'class', id: amines.id };
      substrate.originalText = 'R–NH₂';
    }
    for (const outcome of hinsberg.outcomes ?? []) for (const product of outcome.products) if (product.ref.kind === 'class') {
        product.ref = { kind: 'class', id: sulfonamides.id };
        product.originalText = WRITTEN;
      }
    (records['reaction'] as Loose[]).push(hinsberg);
    const unmapped = { ...JSON.parse(JSON.stringify(idea)), id: 'cpt_zz-unmapped-idea', name: UNMAPPED } as Loose;
    (records['concept'] as Loose[]).push(unmapped);
    const maps = records['topic_mapping'] as object[];
    CORE.forEach((target, i) => maps.push(mapping(i, 'top_alcohols-phenols-ethers', target, 'core')));
    SUPPORTING.forEach((target, i) => maps.push(mapping(100 + i, 'top_alcohols-phenols-ethers', target, 'supporting')));
    CORE.slice(0, 4).forEach((target, i) => maps.push(mapping(200 + i, 'top_carbonyl-acids', target, 'supporting')));
  });
}

/** Study opens on Chapters when the dataset has chapter topics (7.3b D5): check that, then go to the Navigator by its mode. */
export async function chaptersFirstThenNavigator(page: Page): Promise<void> {
  await expect(page.getByRole('region', { name: 'Chapters', exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Navigator' }).click();
  await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible({ timeout: 60_000 });
}
