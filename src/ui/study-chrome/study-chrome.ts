/**
 * What a student sees (step 8.3, ADR-045): the ONE edition rule for the author and developer pieces of the window. A pure function of the
 * edition and of what the visitor has done; components read its answer (from `useStudyChrome`), never the edition itself. Studio shows every
 * piece, exactly as before. Study hides what a student has no use for (the status bar, the storage warning for published chemistry, the
 * layout note, the import notice of the published dataset, the Dataset page, the Unanchored list, kind words and counts in the selection line,
 * the pill, the word "exclusive") and gives the visitor's OWN imported data a quiet saved line and a storage warning in plain words.
 */
export type ChromeEdition = 'study' | 'studio';

export interface Visitor {
  /** The visitor imported a file of their own (the published chemistry is re-loaded from the site; this is not). */
  readonly ownData: boolean;
}

export interface StudyChrome {
  /** `full`: the status line, panels and navigator status (Studio); `saved-line`: one quiet line (own data); `none`. */
  readonly statusBar: 'full' | 'saved-line' | 'none';
  /** `author`: the browser's own message (Studio); `visitor`: the Study wording, after an own import; `none`. */
  readonly storageWarning: 'author' | 'visitor' | 'none';
  readonly layoutNotice: boolean;
  /** The "Imported n records from ..." notice of the first load of the published dataset. */
  readonly publishedImportNotice: boolean;
  /** The rail item "Dataset". */
  readonly datasetRail: boolean;
  /** The phone More sheet's Dataset counts (and its Status button). */
  readonly datasetCounts: boolean;
  /** "Unanchored reactions (n)". */
  readonly unanchored: boolean;
  /** `full`: the accessible name of the selection; `name`: the record's name only. */
  readonly selectionLine: 'full' | 'name';
  /** `pill`: the purple words; `dot`: a small grey dot with a label. */
  readonly reviewMark: 'pill' | 'dot';
  /** The outcome word "exclusive". */
  readonly exclusiveWord: boolean;
  /** The status words after an exam's name in the exam select ("provisional, not verified"). */
  readonly examStatusWords: boolean;
}

export const STUDIO_CHROME: StudyChrome = {
  statusBar: 'full',
  storageWarning: 'author',
  layoutNotice: true,
  publishedImportNotice: true,
  datasetRail: true,
  datasetCounts: true,
  unanchored: true,
  selectionLine: 'full',
  reviewMark: 'pill',
  exclusiveWord: true,
  examStatusWords: true,
};

const STUDY_CHROME: StudyChrome = {
  statusBar: 'none',
  storageWarning: 'none',
  layoutNotice: false,
  publishedImportNotice: false,
  datasetRail: false,
  datasetCounts: false,
  unanchored: false,
  selectionLine: 'name',
  reviewMark: 'dot',
  exclusiveWord: false,
  examStatusWords: false,
};

export function studyChrome(edition: ChromeEdition, visitor: Visitor): StudyChrome {
  if (edition === 'studio') return STUDIO_CHROME;
  return visitor.ownData ? { ...STUDY_CHROME, statusBar: 'saved-line', storageWarning: 'visitor' } : STUDY_CHROME;
}
