/**
 * What the Classes section needs of the app (step 6.2a part 4): classes found by name through the search engine, and the words for a
 * class already listed. The app fills it; the section decides nothing. `kind` and `scope` are words ("compound class", "official").
 */
export interface ClassChoice {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly scope: string;
}

export interface ClassPickerPort {
  /** Classes whose name matches `text`, best first. A newer search supersedes an older one (the older answers an empty list). */
  search(text: string): Promise<readonly ClassChoice[]>;
  /** The class with this ID in the dataset now, or undefined. */
  describe(id: string): ClassChoice | undefined;
}
