/**
 * Gate D findings of the authoring run (step 6.9): demo fields that no editor can set and that are not in the plan's excluded list. The
 * demo is never edited; the comparator reports the difference and the packet lists it. Each entry: a pattern for the comparator's path.
 */
const FINDINGS: readonly { readonly path: RegExp; readonly why: string }[] = [
  { path: /(^| )outcome \d+ label$/, why: 'no editor field for an outcome label' },
  { path: /(^| )variant \d+ note$/, why: 'no editor field for a condition variant note' },
  { path: /(^| )variant \d+ participant 1$|(^| )variant \d+ participant \d+$/, why: 'no editor for the participants present only under a variant' },
  { path: /(^| )outcome \d+ concept \d+$/, why: 'no editor field for the concepts of an outcome' },
  { path: /(^| )stage \d+ original text$/, why: 'the original text of a stage is shown, not editable' },
  { path: /(^| )participant \d+ original text$/, why: 'the original text of a participant is shown, not editable' },
  { path: /(^| )participant \d+ note$/, why: 'no editor field for a participant note' },
  { path: /(^| )variant \d+ parameters solvent character \d+$/, why: 'a condition variant cannot override the solvent character (its field is not offered: it does not reach the arrow)' },
  { path: /(^| )variant \d+ stage id$/, why: 'EQUIVALENT: the editor names the stage a variant overrides (stage 1); the demo leaves the default, the first stage of kind reaction' },
];

/** The reason a difference is a known finding, or undefined when it is not. */
export function knownFinding(path: string): string | undefined {
  return FINDINGS.find((one) => one.path.test(path))?.why;
}
