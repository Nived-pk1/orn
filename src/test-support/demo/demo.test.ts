import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deserializeDocument, documentToState, stateToDocument } from '@/core/dataset';
import { coreIndexEngine } from '@/core/indexes/engine';
import { DatasetDocumentSchema, RECORD_KINDS, type CanonicalState, type DatasetDocument } from '@/core/schema';
import { validator, type Finding } from '@/core/validation';
import { must } from '../state-fixture';
import { HUB_CLASSES } from './classes';
import { DEMO_EXPORT, buildDemoDocument, demoText } from './index';
import { INVALID_EXPECTATIONS, buildDemoInvalidDocument } from './invalid';

const SEED = new URL('../../../data/seed/demo.orn.json', import.meta.url);
const INVALID = new URL('../../../data/fixtures/demo-invalid.orn.json', import.meta.url);

function stateOf(doc: DatasetDocument): CanonicalState {
  const result = documentToState(doc);
  if (!result.ok) throw new Error('duplicate IDs');
  return result.state;
}
const findingsOf = (state: CanonicalState): Finding[] => [...validator.validateAll(state, coreIndexEngine.build(state, 0))];
const textOf = (doc: DatasetDocument): string => demoText(doc);

const demo = buildDemoDocument();
const demoState = stateOf(demo);
const demoFindings = findingsOf(demoState);

describe('demo dataset files', () => {
  it('data/seed/demo.orn.json and data/fixtures/demo-invalid.orn.json equal the builders (ORN_WRITE_DEMO=1 rewrites them)', () => {
    if (process.env.ORN_WRITE_DEMO === '1') {
      writeFileSync(SEED, textOf(demo));
      writeFileSync(INVALID, textOf(buildDemoInvalidDocument()));
    }
    expect(readFileSync(SEED, 'utf8')).toBe(textOf(demo));
    expect(readFileSync(INVALID, 'utf8')).toBe(textOf(buildDemoInvalidDocument()));
  });

  it('is deterministic', () => {
    expect(textOf(buildDemoDocument())).toBe(textOf(demo));
  });

  it('parses strictly and survives export → import → export byte-for-byte (P-02)', () => {
    expect(DatasetDocumentSchema.safeParse(demo).success).toBe(true);
    const first = textOf(demo);
    const parsed = deserializeDocument(first);
    if (!parsed.ok) throw new Error('re-import failed');
    expect(textOf(stateToDocument(stateOf(parsed.document), DEMO_EXPORT))).toBe(first);
  });
});

describe('demo dataset validates', () => {
  it('has no L1–L3 ERROR', () => {
    expect(demoFindings.filter((f) => f.severity === 'error').map((f) => `${f.ruleId} ${f.subject.id} ${f.message}`)).toEqual([]);
  });

  it('has only the planted warnings', () => {
    const warnings = demoFindings.filter((f) => f.severity === 'warning').map((f) => `${f.ruleId} ${f.subject.id}`);
    expect(warnings).toEqual(['RXN-002 rxn_benzene-nitration-draft']);
  });

  it('never marks a record verified (a human must check the chemistry)', () => {
    for (const kind of RECORD_KINDS) {
      for (const record of Object.values(demoState.records[kind])) {
        const review = (record as { review?: { status: string } }).review;
        if (review !== undefined) expect(review.status).not.toBe('verified');
      }
    }
  });
});

describe('demo dataset covers the specification (TEST_STRATEGY.md §3)', () => {
  const { records } = demo;
  const reactions = records.reaction;

  it('arranges every hub: a cell of its own, a group and the one tone of that group (step 5.5c)', () => {
    const anchors = records.navigator_anchor;
    expect(anchors.every((a) => a.cell !== undefined && a.group !== undefined && a.tone !== undefined)).toBe(true);
    expect(new Set(anchors.map((a) => `${a.cell?.column},${a.cell?.row}`)).size).toBe(anchors.length);
    const tones: Record<string, string[]> = {};
    for (const a of anchors) {
      const list = (tones[a.group as string] ??= []);
      if (!list.includes(a.tone as string)) list.push(a.tone as string);
    }
    expect(tones).toEqual({ Hydrocarbons: ['blue'], 'Halogen compounds': ['amber'], 'Oxygen compounds': ['green'], 'Nitrogen compounds': ['violet'] });
  });

  it('anchors every hub class and gives hubs a formula but never a structure', () => {
    expect(records.navigator_anchor.map((a) => a.target.id).sort()).toEqual(HUB_CLASSES.map((b) => `cls_${b}`).sort());
    for (const c of records.class) {
      expect(c.generic?.structure).toBeUndefined();
      if ((HUB_CLASSES as readonly string[]).includes(c.id.slice(4))) expect(c.generic?.formulaText).toBeDefined();
    }
    const alcohols = records.class.filter((c) => c.parentIds.some((p) => p === 'cls_alcohols')).map((c) => c.id);
    expect(alcohols).toHaveLength(3);
  });

  it('exercises the modelling features', () => {
    const named = (slug: string) => must(reactions.find((r) => r.id === `rxn_${slug}`), slug);
    expect(named('ethanol-to-ethanal-pcc').instanceOfId).toBe('rxn_alcohol1-to-aldehyde-pcc');
    expect(named('ethanol-conc-h2so4').conditionVariants).toHaveLength(2);
    expect(named('ethanol-conc-h2so4').outcomes.every((o) => o.conditionVariantIds.length === 1)).toBe(true);
    expect(named('propene-hbr').outcomes.map((o) => o.selectivity)).toEqual(['major', 'minor']);
    expect(named('r-2-bromobutane-aq-koh').outcomes[0]?.stereochemistry?.outcome).toBe('inversion');
    expect(named('benzaldehyde-cannizzaro').participants[0]?.coefficient).toBe(2);
    expect(named('methylmgbr-propanone').stages.map((s) => s.kind)).toEqual(['reaction', 'workup']);
    expect(named('haloform-ethanol').purposes).toContain('qualitative_test');
    expect(named('benzene-nitration-draft').review.lifecycle).toBe('draft');
    expect(records.reagent.find((r) => r.id === 'rgt_lindlar')?.components.map((c) => c.role)).toEqual(['active', 'support', 'poison']);
    expect(records.reagent.find((r) => r.id === 'rgt_potassium-permanganate')?.profiles.map((p) => p.label)).toContain("Baeyer's reagent");
    expect(records.entity_display.find((d) => d.target.id === 'spc_water')?.showAsNode).toBe('never');
    expect(records.mechanism.find((m) => m.id === 'mec_aldol-ethanal')?.variants).toHaveLength(2);
    expect(records.route).toHaveLength(2);
  });

  it('maps every reaction to at least one topic, and diazonium → phenol to two chapters', () => {
    for (const r of reactions) expect(records.topic_mapping.some((m) => m.target.id === r.id), r.id).toBe(true);
    const phenol = records.topic_mapping.filter((m) => m.target.id === 'rxn_benzenediazonium-to-phenol').map((m) => m.topicId);
    expect(phenol).toEqual(expect.arrayContaining(['top_diazonium-chemistry', 'top_phenols']));
  });

  it('includes the edge records', () => {
    const species = (id: string) => must(records.species.find((s) => s.id === id), id);
    expect(species('spc_invalid-smiles-demo').review.status).toBe('review_required');
    expect(species('spc_cholesterol').structure).toBeUndefined();
    expect((species('spc_cholesterol').names.iupac ?? '').length).toBeGreaterThan(100);
    expect(species('spc_palmitic-acid').structure?.value).toBe('CCCCCCCCCCCCCCCC(=O)O'); // 16 carbons (reviewer data correction, step 4.3b review)
    expect(species('spc_lactic-acid').names.aliases.some((a) => /[α₃₆]/.test(a))).toBe(true);
  });

});

describe('demo-invalid', () => {
  const invalidFindings = findingsOf(stateOf(buildDemoInvalidDocument()));

  it('is schema-valid and referentially intact: only domain rules fire', () => {
    expect(DatasetDocumentSchema.safeParse(buildDemoInvalidDocument()).success).toBe(true);
    expect(invalidFindings.filter((f) => f.level < 3 && f.severity === 'error')).toEqual([]);
  });

  it.each(INVALID_EXPECTATIONS)('reports $ruleId on $id ($why)', (expected) => {
    const hit = invalidFindings.find((f) => f.ruleId === expected.ruleId && f.subject.id === expected.id);
    expect(hit?.severity).toBe(expected.severity);
  });
});
