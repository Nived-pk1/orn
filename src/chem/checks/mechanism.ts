/**
 * CHEM-008 for one step of a mechanism (worker side): an atom-map number used by a bond change or an electron movement must be
 * on an atom of one of the step's structures. The maps of a structure are the ones the toolkit reads from it. A step whose
 * structures cannot all be read is "not compared" (the maps could be in the one that cannot be read), said out loud.
 */
import type { StructureToolkit } from '../contracts';
import type { NotCompared, StepCheckRequest, StepCheckResult } from './contracts';

export async function checkOneStep(toolkit: StructureToolkit, request: StepCheckRequest): Promise<StepCheckResult> {
  const present = new Set<number>();
  const unread: NotCompared[] = [];
  for (const [i, structure] of request.structures.entries()) {
    const outcome = await toolkit.parse(structure);
    if (outcome.ok) for (const map of outcome.facts.atomMaps) present.add(map);
    else if (outcome.reason === 'invalid') unread.push({ ruleId: 'CHEM-008', reason: `${request.path} was not compared: structure ${i + 1} of the step cannot be read` });
    else return { path: request.path, status: { state: 'not_checked', reason: outcome.reason, message: outcome.error }, drafts: [] };
  }
  if (unread.length > 0) return { path: request.path, status: { state: 'checked', notCompared: unread }, drafts: [] };
  const drafts = request.uses.flatMap((use) => {
    const absent = [...new Set(use.maps)].filter((map) => !present.has(map)).sort((a, b) => a - b);
    if (absent.length === 0) return [];
    return [
      {
        ruleId: 'CHEM-008',
        path: use.path,
        message: `Atom map ${absent.join(', ')} is not on any atom of the structures of this step.`,
        data: { absent, present: [...present].sort((a, b) => a - b) },
      },
    ];
  });
  return { path: request.path, status: { state: 'checked', notCompared: [] }, drafts };
}
