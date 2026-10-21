/**
 * What the record pickers need of the app (step 6.2b decision D4, replacing the class-only picker of 6.2a): records found by name through
 * the search engine, the words for a record already chosen, and the cycle questions a picker asks BEFORE Save. The app fills it; the
 * pickers decide nothing. `kindWords` and `scope` are words ("compound class", "in the syllabus").
 */
/** `route` can be described (its name, for an existing relationship end) but has no search yet (Phase 7). */
export type PickKind = 'species' | 'class' | 'reagent' | 'reaction' | 'mechanism' | 'concept' | 'reference' | 'named_reaction' | 'transformation' | 'caveat' | 'route';

/** The kinds that have parents (a hierarchy): a parent picker asks the cycle question for one of these. */
export type ParentKind = 'class' | 'concept' | 'named_reaction';

export interface RecordChoice {
  readonly kind: PickKind;
  readonly id: string;
  readonly name: string;
  readonly kindWords: string;
  /** The exam scope in words; empty when no exam is chosen (then nothing is said about it). */
  readonly scope: string;
  /** For a reaction: its scope, so a picker of generic reactions can refuse a specific one in words. */
  readonly reactionScope?: 'generic' | 'specific';
  /** For a concept: its conceptKind (reaction_type, mechanism_class, ...), so a picker can offer the matching kind first. */
  readonly conceptKind?: string;
}

export interface RecordPickerPort {
  /** Records of these kinds whose name matches `text`, best first. A newer search supersedes an older one (the older answers an empty list). */
  search(kinds: readonly PickKind[], text: string): Promise<readonly RecordChoice[]>;
  /** The record with this kind and ID in the dataset now, or undefined. */
  describe(kind: PickKind, id: string): RecordChoice | undefined;
  /** Why `candidate` cannot be a parent of the `kind` record `owner` (it would close a cycle), in words; undefined when it can. `kind` is a class when absent. */
  parentRefusal?(owner: string, candidate: string, kind?: ParentKind): string | undefined;
  /** The relationships this record is an end of (stored ones only), in words ("commonly confused with <other>"; "requires <other>" from the far end of a directed one), in ID order and bounded. */
  relationshipsOf?(ref: { readonly kind: string; readonly id: string }): readonly { readonly id: string; readonly words: string }[];
  /** The reactions that name this named reaction or transformation (derived from the reactions' links), once each, in ID order; "Used by". */
  usedBy?(kind: 'named_reaction' | 'transformation', id: string): readonly RecordChoice[];
  /** Why `candidate` cannot be a component of reagent `owner` (a reagent built from the owner would close a cycle); undefined when it can. */
  componentRefusal?(owner: string, candidate: { readonly kind: PickKind; readonly id: string }): string | undefined;
  /** The profiles of a reagent (ID and label), in order, for a participant's profile choice; empty when the reagent has none or does not exist. */
  profilesOf?(reagentId: string): readonly { readonly id: string; readonly label: string }[];
  /** How many records of this kind the dataset has ("No sources yet" needs it). */
  count?(kind: PickKind): number;
  /** The title and year of a source (a citation's summary line), or undefined when it is not in the dataset. */
  sourceOf?(referenceId: string): { readonly title: string; readonly year?: number | undefined } | undefined;
  /** Whether the class is a family on the navigator map (read-only; making one is step 6.6b). */
  isMapFamily?(classId: string): boolean;
}
