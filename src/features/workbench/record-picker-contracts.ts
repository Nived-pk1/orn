/**
 * What the record pickers need of the app (step 6.2b decision D4, replacing the class-only picker of 6.2a): records found by name through
 * the search engine, the words for a record already chosen, and the cycle questions a picker asks BEFORE Save. The app fills it; the
 * pickers decide nothing. `kindWords` and `scope` are words ("compound class", "in the syllabus").
 */
export type PickKind = 'species' | 'class' | 'reagent';

export interface RecordChoice {
  readonly kind: PickKind;
  readonly id: string;
  readonly name: string;
  readonly kindWords: string;
  readonly scope: string;
}

export interface RecordPickerPort {
  /** Records of these kinds whose name matches `text`, best first. A newer search supersedes an older one (the older answers an empty list). */
  search(kinds: readonly PickKind[], text: string): Promise<readonly RecordChoice[]>;
  /** The record with this kind and ID in the dataset now, or undefined. */
  describe(kind: PickKind, id: string): RecordChoice | undefined;
  /** Why class `candidate` cannot be a parent of class `owner` (it would close a cycle), in words; undefined when it can. */
  parentRefusal?(owner: string, candidate: string): string | undefined;
  /** Why `candidate` cannot be a component of reagent `owner` (a reagent built from the owner would close a cycle); undefined when it can. */
  componentRefusal?(owner: string, candidate: { readonly kind: PickKind; readonly id: string }): string | undefined;
  /** Whether the class is a family on the navigator map (read-only; making one is step 6.6). */
  isMapFamily?(classId: string): boolean;
}
