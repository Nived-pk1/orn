/** The editor's port filled from the app's session manager and store (ADR-040). Pure wiring; no chemistry. */
import { LIMITS, type RecordRef } from '@/core/schema';
import type { EditorPort, MechanismLinksPort, PicturesPort, PreviewPort, RecordPickerPort, SmartsCheck, StructurePort } from '@/features/workbench';
import type { WindowServices } from './context';

export function makeEditorPort(
  services: Pick<WindowServices, 'drafts' | 'store'> & Partial<Pick<WindowServices, 'draftChecks' | 'chem' | 'duplicateCheck'>>,
  timers: EditorPort['timers'],
  extras: { readonly depictions?: StructurePort['depictions']; readonly records?: RecordPickerPort; readonly openRecord?: (ref: RecordRef) => void; readonly preview?: PreviewPort; readonly links?: MechanismLinksPort; readonly pictures?: PicturesPort; readonly chain?: EditorPort['chain']; readonly createNew?: EditorPort['createNew']; readonly merge?: EditorPort['merge'] } = {},
): EditorPort {
  const { depictions, records, openRecord, preview, links, pictures, chain, createNew, merge } = extras;
  const { drafts, store } = services;
  return {
    entry: (id) => drafts.entry(id),
    subscribe: drafts.subscribe,
    keeping: () => drafts.view().keeping,
    newId: (prefix) => drafts.newId(prefix),
    edit: (id, recipe, meta) => drafts.edit(id, recipe, meta),
    undo: (id) => drafts.undo(id),
    redo: (id) => drafts.redo(id),
    release: (id) => drafts.release(id),
    commit: (id, choices, section) => drafts.commit(id, choices, section),
    discard: (id) => drafts.discard(id),
    gone: (id) => {
      const target = drafts.entry(id)?.session.target;
      return target !== null && target !== undefined && !Object.hasOwn(store.getState().records[target.kind], target.id);
    },
    warningsOf: (ref) => store.findings.bySubject(ref).filter((finding) => finding.severity === 'warning').length,
    ...(services.draftChecks === undefined ? {} : { checks: services.draftChecks }),
    ...(services.chem === undefined ? {} : { structure: { parse: (structure) => (services.chem as NonNullable<typeof services.chem>).parse(structure), checkSmarts: (smarts) => checkSmarts(services.chem as NonNullable<typeof services.chem>, smarts), ...(depictions === undefined ? {} : { depictions }) } }),
    ...(records === undefined ? {} : { records }),
    ...(preview === undefined ? {} : { preview }),
    ...(links === undefined ? {} : { links }),
    ...(pictures === undefined ? {} : { pictures }),
    ...(chain === undefined ? {} : { chain }),
    ...(createNew === undefined ? {} : { createNew }),
    ...(merge === undefined ? {} : { merge }),
    ...(services.duplicateCheck === undefined || openRecord === undefined ? {} : { duplicates: { check: services.duplicateCheck.check, openRecord } }),
    timers,
  };
}

/** Whether the chem worker reads a SMARTS pattern: one probe against a fixed one-atom structure (the answer to "can it be read" does not depend on the structure). */
async function checkSmarts(chem: NonNullable<WindowServices['chem']>, smarts: string): Promise<SmartsCheck> {
  // over the limit is refused here in words (the wire would refuse it as a bad request, which is not "did not answer")
  if (smarts.length > LIMITS.inlineStructure) return { state: 'invalid', message: `a SMARTS can have 1 to ${LIMITS.inlineStructure} characters; this one has ${smarts.length}` };
  const answer = await chem.matches([{ structure: { format: 'smiles', value: 'C' }, smarts }]);
  if (!answer.ok) return { state: 'unanswered', message: answer.error };
  const outcome = answer.value.outcomes[0];
  if (outcome === undefined) return { state: 'unanswered', message: 'the chemistry engine gave no answer' };
  if (outcome.ok) return { state: 'ok' };
  return outcome.reason === 'invalid_smarts' ? { state: 'invalid', message: outcome.error } : { state: 'unanswered', message: outcome.error };
}
