/**
 * Gate D findings of the authoring run (step 6.9): demo fields that no editor can set. Round 1 of the review found eight (outcome label and
 * concepts, variant note, solvent character and participants only under a variant, participant note and original text, stage original text);
 * step 6.9b added their editors and the list is EMPTY: every difference from the demo now fails the run. The variant `stageId` default is no
 * difference any more (the comparator treats "no stage" and "the first reaction stage" as equal). The demo is never edited.
 */
const FINDINGS: readonly { readonly path: RegExp; readonly why: string }[] = [];

/** The reason a difference is a known finding, or undefined when it is not. */
export function knownFinding(path: string): string | undefined {
  return FINDINGS.find((one) => one.path.test(path))?.why;
}
