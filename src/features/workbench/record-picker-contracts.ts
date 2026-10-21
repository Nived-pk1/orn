/**
 * What the record pickers need of the app (step 6.2b decision D4, replacing the class-only picker of 6.2a): records found by name through
 * the search engine, the words for a record already chosen, and the cycle questions a picker asks BEFORE Save. The app fills it; the
 * pickers decide nothing. `kindWords` and `scope` are words ("compound class", "in the syllabus").
 */
/** `route` can be described (its name, for an existing relationship end) but has no search yet (Phase 7). */
export type PickKind = 'species' | 'class' | 'reagent' | 'reaction' | 'mechanism' | 'concept' | 'reference' | 'named_reaction' | 'transformation' | 'caveat' | 'route';

/** The kinds that have parents (a hierarchy): a parent picker asks the cycle question for one of these. */
export type ParentKind = 'class' | 'concept' | 'named_reaction' | 'topic';

/** A topic as a choice in a list (a select), in tree order (step 6.6c). */
export interface TopicChoice {
  readonly id: string;
  readonly name: string;
  readonly topicKind: string;
  /** 0 for a top-level topic. */
  readonly depth: number;
  readonly order: number;
  readonly parentId?: string;
}

/** A line of a read-only list about a record: the linking record's ID (for opening it) and the line in words. */
export interface CurriculumLine {
  readonly id: string;
  readonly words: string;
}

/** A navigator anchor as the map-family editor and its cell grid read it (step 6.6c). */
/** A syllabus unit as the editors copy it (the schema's shape, plain data). */
export interface VersionUnit {
  readonly id: string;
  readonly code?: string;
  readonly title: string;
  readonly officialText?: string;
  readonly topicCoverage: readonly { readonly topicId: string; readonly coverage: string; readonly note?: string }[];
}

export interface MapFamilyChoice {
  readonly id: string;
  readonly targetId: string;
  /** The label, or the class name when there is none. */
  readonly name: string;
  readonly group?: string;
  readonly tone?: string;
  readonly order: number;
  readonly cell?: { readonly column: number; readonly row: number };
}

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
  /** Whether the class is a family on the navigator map. */
  isMapFamily?(classId: string): boolean;
  /** Every topic, depth first (a topic, then its children by order); bounded. */
  topics?(): readonly TopicChoice[];
  /** The topic mappings of a record: "<topic> · <role>" (the mapping's ID to open it). */
  topicLinesOf?(ref: { readonly kind: string; readonly id: string }): readonly (CurriculumLine & { readonly topicId: string })[];
  /** The records mapped to a topic: "<record> (<kind>) · <role>" with the record to open. */
  mappedRecordsOf?(topicId: string): readonly (CurriculumLine & { readonly target: { readonly kind: string; readonly id: string } })[];
  /** The exams (name order) and the versions of one exam (label order). */
  exams?(): readonly { readonly id: string; readonly name: string }[];
  versionsOf?(examId: string): readonly { readonly id: string; readonly label: string }[];
  /** The versions of one exam as summary lines: label, status and the number of syllabus units (label order). */
  versionSummariesOf?(examId: string): readonly { readonly id: string; readonly label: string; readonly status: string; readonly units: number }[];
  /** A version's syllabus units (a copy, to start another version from), or undefined when it is not in the dataset. */
  unitsOfVersion?(versionId: string): readonly VersionUnit[] | undefined;
  /** The exam relevance records of a record: "<versions> · <scope>". */
  relevanceLinesOf?(ref: { readonly kind: string; readonly id: string }): readonly CurriculumLine[];
  /** Every navigator anchor, in ID order. */
  mapFamilies?(): readonly MapFamilyChoice[];
  /** The ID of the anchor of a class, or undefined (the lowest ID when there are several). */
  mapFamilyOf?(classId: string): string | undefined;
}
