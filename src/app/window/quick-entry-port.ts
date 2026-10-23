/**
 * The quick-entry dialog's port (step 6.7b), made from the search service, the canonical state, the chem worker and the duplicate check.
 * Names are found through the search service (never guessed): a hit is an EXACT match when the term, folded, equals a folded name, common
 * name, alias, IUPAC name or entered formula of the record. A structure is asked of the chem worker (`parse`) and, when it reads one, matched
 * against the species through the duplicate check (the same canonical structure). The chem worker or the duplicate check not answering is
 * said in words. Derived at the moment it is asked; nothing is stored. No chemistry here: the workers decide.
 */
import { blankDraft } from '@/core/editing';
import type { TermRef } from '@/core/quick-entry/seed';
import { similarReactions } from '@/core/quick-entry/similar';
import { LIMITS, type CanonicalState, type RecordRef } from '@/core/schema';
import { fold } from '@/core/text/normalizer';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { DuplicateCheckPort, PickKind, PreviewPort, QuickEntryPort, RecordChoice } from '@/features/workbench';
import type { ChemService } from '@/workers/chem';
import type { SearchService } from '@/workers/search';
import type { ActiveExam } from '@/ui/state';
import { createRecordPicker } from './record-picker-port';

export const QUICK_ENTRY_CHANNEL = 'quick-entry';
const KINDS = ['species', 'reagent', 'class'] as const satisfies readonly PickKind[];
const MAX_HITS = 20;
/** The search service lets a newer query on a channel replace an older one; the terms of a line are asked together, so each takes the next of this many channels (more than a line has terms). */
const CHANNELS = 64;
const MAX_SUGGESTIONS = 5;

export interface QuickEntryPortDeps {
  readonly search: SearchService['search'];
  readonly state: () => CanonicalState;
  readonly indexes: () => ReadonlyIndexes;
  readonly activeExam: () => ActiveExam | null;
  readonly chem?: Pick<ChemService, 'parse'> | undefined;
  readonly duplicateCheck?: DuplicateCheckPort | undefined;
  readonly preview: PreviewPort | undefined;
  readonly createNew: QuickEntryPort['createNew'];
  readonly openRecord: (ref: RecordRef) => void;
  readonly open: QuickEntryPort['open'];
  readonly newId: (prefix: string) => string;
}

type Loose = { readonly names?: { readonly canonical?: string; readonly iupac?: string; readonly common?: readonly string[]; readonly aliases?: readonly string[] }; readonly formula?: string; readonly formulaText?: string };

/** Every spelling a record answers to: canonical, IUPAC, common names, aliases and the entered formula. */
function spellings(record: Loose): readonly string[] {
  const names = record.names;
  return [names?.canonical, names?.iupac, ...(names?.common ?? []), ...(names?.aliases ?? []), record.formula, record.formulaText].filter((s): s is string => typeof s === 'string' && s !== '');
}

/** A species draft that passes L1 with this SMILES, for the duplicate check (it is never saved). */
const probeSpecies = (smiles: string): unknown => {
  const blank = blankDraft('species', { newId: () => 'spc_quick-entry-probe', now: () => '1970-01-01T00:00:00.000Z' } as never) as Record<string, unknown>;
  return { ...blank, names: { canonical: smiles.slice(0, 120), common: [], aliases: [] }, structure: { format: 'smiles', value: smiles } };
};

export function createQuickEntryPort(deps: QuickEntryPortDeps): QuickEntryPort {
  const picker = createRecordPicker({ search: deps.search, state: deps.state, indexes: deps.indexes, activeExam: deps.activeExam });
  let next = 0;
  const choiceOf = (kind: PickKind, id: string): RecordChoice | undefined => picker.describe(kind, id);
  return {
    async find(text) {
      const answer = await deps.search(`${QUICK_ENTRY_CHANNEL}:${(next = (next + 1) % CHANNELS)}`, { text, kinds: [...KINDS], limit: MAX_HITS });
      if (!answer.ok) throw new Error((answer as { message?: string }).message ?? 'the search is not ready');
      const wanted = fold(text);
      const state = deps.state();
      const exact: RecordChoice[] = [];
      const others: RecordChoice[] = [];
      for (const hit of answer.value) {
        const kind = hit.ref.kind as (typeof KINDS)[number];
        if (!(KINDS as readonly string[]).includes(kind)) continue;
        const choice = choiceOf(kind, hit.ref.id);
        const table = state.records[kind] as Readonly<Record<string, Loose>>;
        const record = Object.hasOwn(table, hit.ref.id) ? table[hit.ref.id] : undefined;
        if (choice === undefined || record === undefined) continue;
        (spellings(record).some((spelling) => fold(spelling) === wanted) ? exact : others).push(choice);
      }
      const sameSubstance = exact.flatMap((reagent) => {
        const made = reagent.kind === 'reagent' ? (state.records.reagent as Readonly<Record<string, { readonly speciesId?: string }>>)[reagent.id]?.speciesId : undefined;
        const species = made === undefined ? undefined : exact.find((one) => one.kind === 'species' && one.id === made);
        return species === undefined ? [] : [{ reagent, species }];
      });
      return { exact, suggestions: others.slice(0, MAX_SUGGESTIONS), ...(sameSubstance.length > 0 ? { sameSubstance } : {}) };
    },
    async structure(text) {
      if (deps.chem === undefined) return { state: 'unanswered', message: 'The structure toolkit is not available here, so this was not read as a structure.' };
      if (text.length > LIMITS.inlineStructure) return { state: 'not_structure' };
      const parsed = await deps.chem.parse({ format: 'smiles', value: text });
      if (!parsed.ok) return parsed.reason === 'invalid' ? { state: 'not_structure' } : { state: 'unanswered', message: parsed.error };
      if (deps.duplicateCheck === undefined) return { state: 'unanswered', message: 'Existing species were not compared by structure here.' };
      const outcome = await deps.duplicateCheck.check('species', probeSpecies(text));
      if (!outcome.structureChecked) return { state: 'unanswered', message: outcome.message ?? 'Existing species were not compared by structure.' };
      const matches = outcome.matches.filter((match) => match.reasons.includes('structure')).flatMap((match) => choiceOf('species', match.ref.id) ?? []);
      return matches.length > 0 ? { state: 'matched', matches } : { state: 'new' };
    },
    describe: (ref: TermRef) => choiceOf(ref.kind, ref.id),
    similar: (left, products) => similarReactions(deps.state(), left, products).map((reaction) => ({ id: reaction.id, name: reaction.name })),
    preview: deps.preview,
    createNew: deps.createNew,
    openRecord: deps.openRecord,
    open: deps.open,
    newId: deps.newId,
  };
}
