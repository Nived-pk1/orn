/**
 * CHEM-001 to CHEM-004 for one species (worker side, over a `StructureToolkit`). Only `invalid` means the structure is bad;
 * `unavailable` and `timeout` say nothing about it and give NO finding (Q7). What could not be compared is listed, not dropped:
 * a formula that cannot be read as element counts, a structure whose formula the toolkit could not derive.
 */
import type { StructureFacts, StructureToolkit } from '../contracts';
import type { CheckDraft, NotCompared, SpeciesCheckRequest, SpeciesCheckResult } from './contracts';
import { countDifferences, countsText, parseFormula } from './formula';

const checked = (notCompared: readonly NotCompared[] = []) => ({ state: 'checked', notCompared }) as const;

function formulaDrafts(request: SpeciesCheckRequest, facts: StructureFacts, drafts: CheckDraft[], notCompared: NotCompared[]): void {
  if (request.formula === undefined) return;
  const entered = parseFormula(request.formula);
  if (!entered.ok) {
    notCompared.push({ ruleId: 'CHEM-003', reason: `the entered formula "${request.formula}" was not compared: ${entered.reason}` });
    return;
  }
  const derived = facts.formula === undefined ? undefined : parseFormula(facts.formula);
  if (derived === undefined || !derived.ok) {
    notCompared.push({ ruleId: 'CHEM-003', reason: 'the toolkit could not derive a formula from this structure (an atom is a dummy or not an element)' });
    return;
  }
  const differences = countDifferences(entered.counts, derived.counts);
  if (Object.keys(differences).length === 0) return;
  const enteredText = countsText(entered.counts);
  drafts.push({
    ruleId: 'CHEM-003',
    path: 'formula',
    message: `The entered formula ${request.formula}${enteredText === request.formula.trim() ? '' : ` (${enteredText})`} does not match the structure, which has ${countsText(derived.counts)}.`,
    data: { entered: { ...entered.counts }, derived: { ...derived.counts }, differences: { ...differences } },
  });
}

export async function checkOneSpecies(toolkit: StructureToolkit, request: SpeciesCheckRequest): Promise<SpeciesCheckResult> {
  const outcome = await toolkit.parse(request.structure);
  if (!outcome.ok) {
    if (outcome.reason !== 'invalid') return { id: request.id, status: { state: 'not_checked', reason: outcome.reason, message: outcome.error }, drafts: [] };
    const sanitisation = outcome.problem === 'sanitisation';
    return {
      id: request.id,
      status: checked(),
      drafts: [
        sanitisation
          ? { ruleId: 'CHEM-002', path: 'structure', message: 'The structure can be read, but it is not chemically valid (valence or another sanitisation check fails).', data: { detail: outcome.error } }
          : { ruleId: 'CHEM-001', path: 'structure', message: `The structure cannot be read: ${outcome.error}.`, data: { detail: outcome.error } },
      ],
    };
  }
  const drafts: CheckDraft[] = [];
  const notCompared: NotCompared[] = [];
  formulaDrafts(request, outcome.facts, drafts, notCompared);
  if (request.charge !== undefined && outcome.facts.charge !== undefined && request.charge !== outcome.facts.charge) {
    drafts.push({
      ruleId: 'CHEM-004',
      path: 'charge',
      message: `The entered charge is ${request.charge}, but the structure has a net charge of ${outcome.facts.charge}.`,
      data: { entered: request.charge, derived: outcome.facts.charge },
    });
  }
  return {
    id: request.id,
    status: checked(notCompared),
    drafts,
    ...(outcome.facts.canonicalSmiles === undefined ? {} : { canonicalSmiles: outcome.facts.canonicalSmiles }),
  };
}
