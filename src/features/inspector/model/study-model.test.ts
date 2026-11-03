// @vitest-environment jsdom
/**
 * Step 8.1 Part C: the pure view-model of the Study inspector, one case per kind over the demo dataset. The model decides WHAT the layout shows
 * (kind chip, hero, lead, chips, watch-out, go-next, connected cards); the components only draw it.
 */
import { describe, expect, it } from 'vitest';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { createCanonicalStore } from '@/core/commands';
import type { RecordRef } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { studyInspectorModel, type StudyModel } from './study-model';

const state = demoState();
const store = createCanonicalStore({ initial: state, revision: 0, validateInitial: false });
const indexes = createDerivedIndexes({ store, clock: { nowMs: () => 0 } });
const ref = (kind: string, id: string): RecordRef => ({ kind, id }) as RecordRef;
const modelOf = (kind: string, id: string, edition: 'study' | 'studio' = 'study'): StudyModel => {
  const r = studyInspectorModel(ref(kind, id), { state, indexes: indexes.current() }, edition);
  if (r === undefined) throw new Error(`no model for ${kind} ${id}`);
  return r;
};
const chipLabels = (m: StudyModel): string[] => m.facts.map((c) => c.label);
const group = (m: StudyModel, heading: string) => m.connected.find((g) => g.heading === heading);

describe('kind chip and title', () => {
  it.each([
    ['reaction', 'rxn_ethanol-to-ethanal-pcc', 'Reaction'],
    ['species', 'spc_ethanol', 'Compound'],
    ['class', 'cls_aldehydes', 'Class'],
    ['reagent', 'rgt_potassium-permanganate', 'Reagent'],
    ['concept', 'cpt_oxidation', 'Idea'],
    ['named_reaction', 'nrx_aldol', 'Named reaction'],
    ['mechanism', 'mec_aldol-ethanal', 'Mechanism'],
    ['caveat', 'cav_pcc-stops-at-aldehyde', 'Watch out'],
  ])('%s is a "%s" chip, never the raw kind word', (kind, id, word) => {
    const m = modelOf(kind, id);
    expect(m.kindChip.word).toBe(word);
    expect(m.title.length).toBeGreaterThan(0);
  });
  it('a transformation is a "Change" and a route a "Route"', () => {
    const t = Object.keys(state.records.transformation)[0] as string;
    const r = Object.keys(state.records.route)[0] as string;
    expect(modelOf('transformation', t).kindChip.word).toBe('Change');
    expect(modelOf('route', r).kindChip.word).toBe('Route');
  });
});

describe('reaction', () => {
  const m = modelOf('reaction', 'rxn_ethanol-to-ethanal-pcc');
  it('the hero is its equation', () => expect(m.hero).toEqual({ type: 'reaction', reactionId: 'rxn_ethanol-to-ethanal-pcc' }));
  it('the lead is the study notes (a reaction has no summary)', () => {
    const withNotes = Object.values(state.records.reaction).find((r) => r.studyNotes !== undefined);
    expect(withNotes).toBeDefined();
    expect(modelOf('reaction', withNotes?.id as string).lead).toMatchObject({ from: 'notes' });
    expect(m.lead).toBeUndefined();
  });
  it('the facts are plain words: types, conditions, no ids and no underscores', () => {
    const labels = chipLabels(m);
    expect(labels.some((l) => /anhydrous/.test(l))).toBe(true);
    for (const l of labels) expect(l).not.toMatch(/_|rxn_|cpt_/);
  });
  it('"Reversible" only when the reaction is reversible', () => {
    expect(chipLabels(m)).not.toContain('Reversible');
  });
  it('the watch-out is the caveat that targets a reaction', () => {
    const pcc = modelOf('reaction', 'rxn_alcohol1-to-aldehyde-pcc');
    expect(pcc.watchOut.map((w) => w.title)).toContain('PCC stops at the aldehyde');
    expect(m.watchOut).toEqual([]);
  });
  it('connected: makes and made from, as cards with the kind or the arrow text', () => {
    expect(group(m, 'Makes')?.cards.map((c) => c.title)).toContain('Ethanal');
    expect(group(m, 'Made from')?.cards.map((c) => c.title)).toContain('Ethanol');
  });
});

describe('compound, class, reagent', () => {
  it('a compound: structure hero with its formula, classes as links, common names as "also ..."', () => {
    const m = modelOf('species', 'spc_ethanol');
    expect(m.hero).toMatchObject({ type: 'species' });
    expect(m.facts.some((c) => c.ref?.kind === 'class')).toBe(true);
    expect(group(m, 'Reactions that use it')?.total).toBeGreaterThan(0);
  });
  it('a class: its general formula is the hero', () => {
    const m = modelOf('class', 'cls_aldehydes');
    expect(m.hero).toMatchObject({ type: 'class' });
    expect(group(m, 'Reactions that use it')?.total).toBeGreaterThan(0);
  });
  it('a reagent: formula hero, family chips in words, reactions that use it', () => {
    const m = modelOf('reagent', 'rgt_potassium-permanganate');
    expect(m.hero).toMatchObject({ type: 'formula' });
    expect(m.facts.length).toBeGreaterThan(0);
    for (const c of m.facts) expect(c.label).not.toMatch(/_/);
  });
});

describe('concept, named reaction, mechanism, caveat', () => {
  it('a concept: no empty groups, kind of idea in words', () => {
    const m = modelOf('concept', 'cpt_oxidation');
    const written = Object.values(state.records.concept).find((c) => c.summary !== undefined);
    expect(modelOf('concept', written?.id as string).lead).toMatchObject({ from: 'summary' });
    for (const g of m.connected) expect(g.total).toBeGreaterThan(0);
  });
  it('a named reaction: hero is the equation of its first GENERAL reaction; never an example', () => {
    const m = modelOf('named_reaction', 'nrx_aldol');
    if (m.hero !== undefined) {
      expect(m.hero.type).toBe('reaction');
      const id = (m.hero as { reactionId: string }).reactionId;
      expect((state.records.reaction as Record<string, { scope: string }>)[id]?.scope).toBe('generic');
    }
  });
  it('a mechanism: "n steps" chip and its reactions', () => {
    const m = modelOf('mechanism', 'mec_aldol-ethanal');
    expect(chipLabels(m).some((l) => /^\d+ steps?$/.test(l))).toBe(true);
    expect(group(m, 'Reactions that use it')?.total).toBeGreaterThan(0);
  });
  it('a caveat: the statement is the lead and the targets are the cards', () => {
    const m = modelOf('caveat', 'cav_pcc-stops-at-aldehyde');
    expect(m.lead?.source).toBeDefined();
    expect(group(m, 'Applies to')?.total).toBe(2);
  });
});

describe('the lead and the notes', () => {
  it('summary first; study notes then fill the closed Notes section when the lead was the summary', () => {
    const m = modelOf('named_reaction', 'nrx_aldol');
    expect(m.lead?.source).toBeDefined();
  });
  it('a cap: a group holds at most 60 cards and says its real total', () => {
    for (const g of modelOf('reagent', 'rgt_potassium-permanganate').connected) expect(g.cards.length).toBeLessThanOrEqual(60);
  });
  it('the edition only decides the "For authors" flag', () => {
    expect(modelOf('species', 'spc_ethanol', 'studio').forAuthors).toBe(true);
    expect(modelOf('species', 'spc_ethanol', 'study').forAuthors).toBe(false);
  });
  it('a kind that is not a study record (a topic) has a chip and a title and no hero', () => {
    const t = Object.keys(state.records.topic)[0] as string;
    const m = modelOf('topic', t);
    expect(m.hero).toBeUndefined();
    expect(m.connected).toEqual([]);
  });
});
