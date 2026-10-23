/**
 * The quick-entry draft (ADR-040 addendum, step 6.7b, Q3 and Q4): a SEED for a new reaction draft built from a parsed line and the records its
 * terms resolved to. Pure. Nothing is chosen for the user: a species or class on the left is a reactant and a reagent record a reagent (what a
 * term IS), a stage per ", then" with its condition text and the fields the condition parser read (they need Confirm), ONE outcome that holds
 * under all conditions with the products, selectivity `unspecified`, and the product roles ABSENT (the editor says "Choose a role"). The scope
 * is only set when it is `specific` or `generic`; `choose` leaves it absent. No primary-substrate flag. Follow-ups U2-U5: an item in a
 * term's ( ) that exactly names a species is a participant of that stage with its role ABSENT ("Choose a role"); stage 1 is a reaction
 * step and every later stage has its kind ABSENT ("Choose a kind", a workup is not a reaction step).
 */
import { ShortTextSchema } from '../schema';
import { conditionPieces, conditionsFromText } from './conditions';
import { formatQuickEntry, type QuickEntry, type QuickStage } from './grammar';

export interface TermRef {
  readonly kind: 'species' | 'class' | 'reagent';
  readonly id: string;
}

export type QuickScope = 'specific' | 'generic' | 'choose';

/** Which scope the resolved terms suggest, and why in words. A term that is not resolved is `undefined`. */
export function quickScope(terms: readonly (TermRef | undefined)[]): { readonly scope: QuickScope; readonly words: string } {
  if (terms.length === 0) return { scope: 'choose', words: 'Choose a scope: there is nothing to judge it from yet.' };
  if (terms.some((term) => term === undefined)) return { scope: 'choose', words: 'Choose a scope: some terms are not resolved yet.' };
  const known = terms as readonly TermRef[];
  if (known.some((term) => term.kind === 'class')) return { scope: 'generic', words: 'Generic: at least one term is a class.' };
  return { scope: 'specific', words: 'Specific: every term is a species or a reagent.' };
}

export interface QuickRefs {
  /** Per stage, per term in order; `undefined` while a term is unresolved. */
  readonly stages: readonly (readonly (TermRef | undefined)[])[];
  readonly products: readonly (TermRef | undefined)[];
}

export interface QuickSeedInput {
  readonly entry: QuickEntry;
  readonly refs: QuickRefs;
  readonly scope: QuickScope;
  /** Items of a term's ( ) text that exactly name a species, by the item's text (U2). */
  readonly solvents?: Readonly<Record<string, TermRef>>;
  readonly newId: (prefix: string) => string;
}

/** Every item of the ( ) texts of the entry, each once: the ones the dialog asks the port about (U2). */
export function conditionItems(entry: QuickEntry): readonly string[] {
  return [...new Set(entry.stages.flatMap((stage) => stage.terms.flatMap((term) => (term.condition === undefined ? [] : conditionPieces(term.condition)))))];
}

/** The condition text of a stage once the items that name species are taken out; the typed text is kept as typed when none is. */
export function remainingText(stage: QuickStage, taken: (item: string) => boolean): string {
  return stage.terms
    .flatMap((term) => {
      if (term.condition === undefined) return [];
      const pieces = conditionPieces(term.condition);
      return pieces.some(taken) ? [pieces.filter((piece) => !taken(piece)).join(', ')] : [term.condition];
    })
    .filter((text) => text !== '')
    .join('; ');
}

const wording = (text: string): { readonly originalText?: string } => (ShortTextSchema.safeParse(text).success ? { originalText: text } : {});

export function quickSeed(input: QuickSeedInput): Readonly<Record<string, unknown>> | undefined {
  const { entry, refs, newId } = input;
  if (refs.stages.some((stage) => stage.some((ref) => ref === undefined)) || refs.products.some((ref) => ref === undefined)) return undefined;
  const participants: Record<string, unknown>[] = [];
  const stages = entry.stages.map((stage, s) => {
    const solvents = input.solvents ?? {};
    const isSolvent = (item: string): boolean => Object.hasOwn(solvents, item);
    const ids = stage.terms.flatMap((term, t) => {
      const ref = refs.stages[s]?.[t] as TermRef;
      const id = newId('prt');
      participants.push({ id, ref: { kind: ref.kind, id: ref.id }, role: ref.kind === 'reagent' ? 'reagent' : 'reactant', ...wording(term.text) });
      const named = term.condition === undefined ? [] : [...new Set(conditionPieces(term.condition).filter(isSolvent))];
      return [id, ...named.map((item) => {
        const solvent = solvents[item] as TermRef;
        const solventId = newId('prt');
        participants.push({ id: solventId, ref: { kind: solvent.kind, id: solvent.id }, ...wording(item) });
        return solventId;
      })];
    });
    const conditions = conditionsFromText(remainingText(stage, isSolvent));
    return { id: newId('stg'), ...(s === 0 ? { kind: 'reaction' } : {}), participantIds: ids, parameters: conditions.parameters };
  });
  const products = entry.products.map((term, p) => {
    const ref = refs.products[p] as TermRef;
    return { id: newId('pdt'), ref: { kind: ref.kind, id: ref.id }, ...wording(term.text) };
  });
  return {
    name: formatQuickEntry(entry, '→'),
    ...(input.scope === 'choose' ? {} : { scope: input.scope }),
    participants,
    stages,
    conditionVariants: [],
    outcomes: [{ id: newId('out'), conditionVariantIds: [], selectivity: 'unspecified', products, conceptIds: [] }],
  };
}
