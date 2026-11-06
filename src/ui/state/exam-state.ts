/**
 * The exam choice's UI state beyond WHICH exam (step 8.3b, B2 and B3; ADR-046): `mode` is "Only <exam>" or "Everything" (one switch for every
 * view) and `asked` says the first-run card has been answered. Saved inside the navigator's `uiState` entry as the sibling key `examChoice`, read
 * tolerantly: optional fields, no version. UI state only, never records.
 */
export type ScopeMode = 'only' | 'everything';

export interface ParsedExamChoice {
  readonly mode: ScopeMode;
  readonly asked: boolean;
  readonly damaged: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseExamChoice(raw: unknown): ParsedExamChoice {
  const defaults: ParsedExamChoice = { mode: 'only', asked: false, damaged: [] };
  if (raw === undefined) return defaults;
  if (!isRecord(raw)) return { ...defaults, damaged: ['examChoice'] };
  const damaged: string[] = [];
  let mode: ScopeMode = 'only';
  if (raw.mode !== undefined) {
    if (raw.mode === 'only' || raw.mode === 'everything') mode = raw.mode;
    else damaged.push('examChoice.mode');
  }
  let asked = false;
  if (raw.asked !== undefined) {
    if (typeof raw.asked === 'boolean') asked = raw.asked;
    else damaged.push('examChoice.asked');
  }
  return { mode, asked, damaged };
}

/** Whether records outside the exam are HIDDEN: an exam is chosen and the switch says "Only" (no exam: nothing is outside anything). */
export function effectiveOnly(choice: { readonly active: unknown; readonly mode: ScopeMode }): boolean {
  return choice.active !== null && choice.mode === 'only';
}
