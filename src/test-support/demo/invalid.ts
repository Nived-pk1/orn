/**
 * `demo-invalid` (docs/TEST_STRATEGY.md §2): the demo dataset with deliberate L3 problems for the
 * diagnostics UI and validator tests. Every problem is schema-valid (L1) and referentially intact (L2),
 * so only the domain rules fire. Each entry of INVALID_EXPECTATIONS names the rule and the record it is on.
 */
import type { DatasetDocument, RecordKind } from '@/core/schema';
import { buildDemoDocument } from './index';

export interface InvalidExpectation {
  readonly ruleId: string;
  readonly severity: 'error' | 'warning';
  readonly kind: RecordKind;
  readonly id: string;
  readonly why: string;
}

export const INVALID_EXPECTATIONS: readonly InvalidExpectation[] = [
  { ruleId: 'RXN-008', severity: 'error', kind: 'reaction', id: 'rxn_propene-hbr', why: 'an exclusive outcome overlaps the minor one (ADV-009)' },
  { ruleId: 'RXN-004', severity: 'error', kind: 'reaction', id: 'rxn_ethanol-to-ethanal-dichromate', why: 'a spectator contributes atoms (ADV-026)' },
  { ruleId: 'RXN-007', severity: 'error', kind: 'reaction', id: 'rxn_ethanol-to-ethanal-pcc', why: 'a participant is in no stage' },
  { ruleId: 'RXN-014', severity: 'error', kind: 'reaction', id: 'rxn_ethanol-conc-h2so4', why: 'a temperature below absolute zero (ADV-037)' },
  { ruleId: 'RXN-005', severity: 'warning', kind: 'reaction', id: 'rxn_fischer-esterification', why: 'a catalyst is marked consumed (ADV-025)' },
  { ruleId: 'HIER-001', severity: 'error', kind: 'class', id: 'cls_alcohols', why: 'a cycle in the class hierarchy (ADV-016)' },
  { ruleId: 'SPC-001', severity: 'warning', kind: 'species', id: 'spc_ethanol-duplicate', why: 'two species share a name (ADV-022)' },
  { ruleId: 'REL-004', severity: 'error', kind: 'relationship', id: 'rel_fischer-hydrolysis', why: 'reverse_of without a reverseKind' },
  { ruleId: 'RTE-001', severity: 'error', kind: 'route', id: 'rte_aniline-to-phenol', why: 'a cycle in the route step graph' },
  { ruleId: 'CUR-001', severity: 'error', kind: 'exam_version', id: 'exv_jee-main-2026', why: 'effectiveFrom is after effectiveTo' },
  { ruleId: 'MEC-002', severity: 'error', kind: 'mechanism', id: 'mec_aldol-ethanal', why: 'a step species has no ref, label or structure' },
];

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`demo-invalid: missing ${what}`);
  return value;
}
const at = <T>(list: readonly T[], index: number): T => must(list[index], `item ${index}`);

export function buildDemoInvalidDocument(): DatasetDocument {
  const doc = JSON.parse(JSON.stringify(buildDemoDocument())) as DatasetDocument;
  const { records } = doc;
  const byId = <T extends { id: string }>(list: T[], id: string): T => must(list.find((r) => r.id === id), id);

  at(byId(records.reaction, 'rxn_propene-hbr').outcomes, 0).selectivity = 'exclusive';

  const dichromate = at(byId(records.reaction, 'rxn_ethanol-to-ethanal-dichromate').participants, 1);
  dichromate.role = 'spectator';
  dichromate.flags = { contributesAtoms: true };

  at(byId(records.reaction, 'rxn_ethanol-to-ethanal-pcc').stages, 0).participantIds.pop();

  const ethanolVariant = at(byId(records.reaction, 'rxn_ethanol-conc-h2so4').conditionVariants, 0);
  ethanolVariant.parameters.temperature = { kind: 'value', value: -5, unit: 'K' };

  at(byId(records.reaction, 'rxn_fischer-esterification').participants, 2).flags = { consumed: true };

  const alcohols = byId(records.class, 'cls_alcohols');
  alcohols.parentIds = [byId(records.class, 'cls_alcohols-primary').id as (typeof alcohols.parentIds)[number]];

  const ethanol = byId(records.species, 'spc_ethanol');
  records.species.push({ ...JSON.parse(JSON.stringify(ethanol)), id: 'spc_ethanol-duplicate' as typeof ethanol.id });

  delete byId(records.relationship, 'rel_fischer-hydrolysis').reverseKind;

  const route = byId(records.route, 'rte_aniline-to-phenol');
  at(route.steps, 0).inputFromStepIds = [at(route.steps, 1).id];

  const version = byId(records.exam_version, 'exv_jee-main-2026');
  version.effectiveFrom = '2026-12-01';
  version.effectiveTo = '2026-01-01';

  const aldolStep = at(at(byId(records.mechanism, 'mec_aldol-ethanal').variants, 1).steps, 0);
  aldolStep.species[0] = { role: 'reagent' };
  return doc;
}
