/**
 * ONE size rule for structure drawings, formulas and names (step 8.5d). Pure arithmetic on numbers: no chemistry, no DOM.
 * R1 every context draws at a FIXED BOND LENGTH (its standard), so every molecule has the same scale, like a textbook; the box follows the
 * drawing, with a minimum box so a tiny molecule is not lost. R2 when it does not fit: (a) the box grows into the free space of its row,
 * (b) the drawing shrinks, never below FLOOR of the standard, (c) a row of drawings wraps (`rowScale`), (d) a single drawing still wider
 * than its space keeps the floor scale in a box that scrolls. Nothing is clipped. R3 text is never clipped: `formulaBreaks` and
 * `nameBreaks` say where it may wrap.
 */
import { FIXED_SCALE_BOND_UNITS } from '@/chem/contracts';

/** The smallest scale of a drawing, as a share of its context's standard. */
export const FLOOR = 0.7;
/** An atom label is never drawn under this height, in px (a capital letter is 15.5 px high at the 54-unit bond, so 11 px is the floor of 56 px). */
export const MIN_LABEL_PX = 11;

export type SizeContext = 'family' | 'equation' | 'hero' | 'mechanism';
export interface SizeRule {
  /** The bond length on the page, in px, when the drawing fits. */
  readonly standard: number;
  /** The smallest box, in px. */
  readonly minWidth: number;
  readonly minHeight: number;
}
/** Measured on real RDKit (8.5d notes): a label is 15.5 px high at 54 px, 16.1 px at 56 px; at the floor 11.3 px. One standard for every context, as a textbook has one scale. */
export const SIZE_RULES: Readonly<Record<SizeContext, SizeRule>> = {
  family: { standard: 56, minWidth: 96, minHeight: 64 },
  equation: { standard: 56, minWidth: 48, minHeight: 40 },
  hero: { standard: 56, minWidth: 48, minHeight: 40 },
  mechanism: { standard: 56, minWidth: 48, minHeight: 40 },
};

export interface Fit {
  readonly mode: 'standard' | 'grown' | 'shrunk' | 'scroll';
  /** The scale against the context's standard: 1 down to FLOOR. */
  readonly scale: number;
  /** The drawing's size and bond length on the page. */
  readonly width: number;
  readonly height: number;
  readonly bondPx: number;
  /** The box that holds it; in 'scroll' the box is narrower than the drawing and scrolls sideways. */
  readonly boxWidth: number;
  readonly boxHeight: number;
}

/** `natural`: the size RDKit gave the drawing at the fixed scale. `available`: the width of its own space; `free`: more room its row can give. */
export function sizeDrawing(natural: { readonly width: number; readonly height: number }, context: SizeContext, space: { readonly available: number; readonly free?: number }): Fit {
  const rule = SIZE_RULES[context];
  const standard = rule.standard / FIXED_SCALE_BOND_UNITS;
  const wide = natural.width * standard;
  const room = Math.max(0, space.available + Math.max(0, space.free ?? 0));
  const scale = wide <= room ? 1 : Math.max(FLOOR, room / wide);
  const mode = wide <= space.available ? 'standard' : wide <= room ? 'grown' : room / wide >= FLOOR ? 'shrunk' : 'scroll';
  const width = Math.max(1, Math.round(wide * scale));
  const height = Math.max(1, Math.round(natural.height * standard * scale));
  const boxWidth = mode === 'scroll' ? Math.round(room) : Math.max(rule.minWidth, width);
  return { mode, scale, width, height, bondPx: Math.round(rule.standard * scale * 100) / 100, boxWidth, boxHeight: Math.max(rule.minHeight, height) };
}

/** A row of drawings (the hero, a family scheme): shrink to the floor first, then wrap. `total`: the row's width at the standard. */
export function rowScale(total: number, available: number): { readonly scale: number; readonly wrap: boolean } {
  if (total <= 0 || available <= 0 || total <= available) return { scale: 1, wrap: false };
  const scale = Math.round((available / total) * 1000) / 1000;
  return scale >= FLOOR ? { scale, wrap: false } : { scale: FLOOR, wrap: true };
}

/** A condensed formula wraps after a bond dash that joins two groups, never inside a group ("CH3", "COO") and never at a charge. */
export function formulaBreaks(formula: string): string[] {
  return formula === '' ? [] : formula.split(/(?<=[-–])(?=[A-Za-z([])/);
}

/** A name wraps at spaces and after "-" (the browser's own breaks) and after a comma, so the caller adds a break after each part but the last. */
export function nameBreaks(name: string): string[] {
  return name === '' ? [] : name.split(/(?<=,)(?=\S)/);
}
