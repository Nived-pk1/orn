/**
 * CHEM-005 for one outcome of a reaction (worker side): the atoms of the reactants, each times its coefficient, against the atoms
 * of the products. Compares ELEMENT COUNTS taken from the formula the toolkit derives from each structure, never strings. The
 * service only sends an outcome when every atom-contributing participant and every product is a species with a structure and a
 * coefficient (the rule's own condition); a structure that cannot be read here leaves the outcome "not compared", said out loud.
 */
import type { StructureRep } from '@/core/schema';
import type { StructureToolkit } from '../contracts';
import type { BalanceRequest, BalanceResult, BalanceSide, NotCompared } from './contracts';
import { addScaled, countDifferences, countsText, parseFormula, type ElementCounts } from './formula';

type Counted = { readonly ok: true; readonly counts: ElementCounts } | { readonly ok: false; readonly status: 'unavailable' | 'timeout' | 'skip'; readonly message: string };

async function countsOf(toolkit: StructureToolkit, side: BalanceSide, known: Map<string, Counted>): Promise<Counted> {
  const key = `${side.structure.format}\u0000${side.structure.value}`;
  const seen = known.get(key);
  if (seen !== undefined) return seen;
  const outcome = await toolkit.parse(side.structure as StructureRep);
  let answer: Counted;
  if (!outcome.ok) {
    answer = outcome.reason === 'invalid' ? { ok: false, status: 'skip', message: `the structure of ${side.label} cannot be read` } : { ok: false, status: outcome.reason, message: outcome.error };
  } else {
    const read = outcome.facts.formula === undefined ? undefined : parseFormula(outcome.facts.formula);
    answer = read?.ok === true ? { ok: true, counts: read.counts } : { ok: false, status: 'skip', message: `the toolkit could not derive a formula for ${side.label}` };
  }
  known.set(key, answer);
  return answer;
}

export async function checkOneBalance(toolkit: StructureToolkit, request: BalanceRequest, known: Map<string, Counted> = new Map()): Promise<BalanceResult> {
  const totals = { reactants: {} as Record<string, number>, products: {} as Record<string, number> };
  const skipped: NotCompared[] = [];
  for (const [name, sides] of [['reactants', request.reactants], ['products', request.products]] as const) {
    for (const side of sides) {
      const counted = await countsOf(toolkit, side, known);
      if (counted.ok) addScaled(totals[name], counted.counts, side.coefficient);
      else if (counted.status === 'skip') skipped.push({ ruleId: 'CHEM-005', reason: `${request.path} was not compared: ${counted.message}` });
      else return { path: request.path, status: { state: 'not_checked', reason: counted.status, message: counted.message }, drafts: [] };
    }
  }
  if (skipped.length > 0) return { path: request.path, status: { state: 'checked', notCompared: skipped }, drafts: [] };
  const differences = countDifferences(totals.reactants, totals.products);
  if (Object.keys(differences).length === 0) return { path: request.path, status: { state: 'checked', notCompared: [] }, drafts: [] };
  return {
    path: request.path,
    status: { state: 'checked', notCompared: [] },
    drafts: [
      {
        ruleId: 'CHEM-005',
        path: request.path,
        message: `The atoms do not balance: the reactants have ${countsText(totals.reactants)} and the products have ${countsText(totals.products)}.`,
        data: { reactants: totals.reactants, products: totals.products, differences: { ...differences } },
      },
    ],
  };
}
