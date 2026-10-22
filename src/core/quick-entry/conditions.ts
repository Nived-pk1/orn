/**
 * The condition text of a quick-entry stage through the EXISTING condition parser (step 6.7b, Q2; the parser moved to `core/condition-parse`).
 * The text is cut at commas and semicolons (outside brackets); each piece is offered to the field parsers in a fixed order and goes to the
 * FIRST field that reads it (a field already filled does not take a second piece). A piece no parser reads - a solvent name, say - is NOT
 * guessed: it stays in the stage's `text` (which always holds the whole text) and is listed in `unrecognised`. Every field a parser filled is
 * in `parsedFields`, so it needs Confirm (RXN-015), exactly as after a legacy import. Total.
 */
import { parseConditionField, type ConditionField, type FieldParse } from '../condition-parse/condition-fields';
import { parseLegacyConditions, type ParsedConditions } from '../condition-parse/condition-parser';
import type { ConditionParameters } from '../schema';

/** The order a piece is tried in: number-and-unit fields first, then the word tables. */
const TRY_ORDER = ['temperature', 'pressure', 'atmosphere', 'medium', 'phase', 'strength'] as const satisfies readonly ConditionField[];

export interface RecognisedPiece {
  readonly piece: string;
  readonly field: ConditionField;
}

export interface QuickConditions {
  readonly parameters: ConditionParameters;
  readonly recognised: readonly RecognisedPiece[];
  /** Pieces no parser read; they stay in `parameters.text`. */
  readonly unrecognised: readonly string[];
  /** The condition parser's own review lines for what was read (empty when nothing needs a decision). */
  readonly review: ParsedConditions['review'];
}

/** Pieces split at "," and ";" outside brackets, trimmed, empty ones dropped. */
export function conditionPieces(text: string): readonly string[] {
  const pieces: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth += 1;
    else if ((ch === ')' || ch === ']') && depth > 0) depth -= 1;
    if ((ch === ',' || ch === ';') && depth === 0) {
      pieces.push(current);
      current = '';
    } else current += ch;
  }
  pieces.push(current);
  return pieces.map((piece) => piece.trim()).filter((piece) => piece !== '');
}

const readsAs = (field: ConditionField, parsed: FieldParse): boolean => {
  if (parsed.review.length > 0 || parsed.other.some((entry) => field !== 'strength' && entry !== '')) return false;
  if (field === 'temperature') return parsed.temperature !== undefined;
  if (field === 'pressure') return parsed.pressure !== undefined;
  if (field === 'atmosphere') return parsed.atmosphere !== undefined;
  if (field === 'medium') return parsed.medium !== undefined;
  if (field === 'phase') return parsed.solventCharacter !== undefined;
  return parsed.strength !== undefined;
};

export function conditionsFromText(text: string): QuickConditions {
  const whole = typeof text === 'string' ? text.trim() : '';
  const filled = new Map<ConditionField, string>();
  const recognised: RecognisedPiece[] = [];
  const unrecognised: string[] = [];
  for (const piece of conditionPieces(whole)) {
    const field = TRY_ORDER.find((candidate) => !filled.has(candidate) && readsAs(candidate, parseConditionField(candidate, piece)));
    if (field === undefined) unrecognised.push(piece);
    else {
      filled.set(field, piece);
      recognised.push({ piece, field });
    }
  }
  const parsed = parseLegacyConditions({ ...Object.fromEntries(filled), ...(whole === '' ? {} : { text: whole }) });
  return { parameters: parsed.parameters, recognised, unrecognised, review: parsed.review };
}
