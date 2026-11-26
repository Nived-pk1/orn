/**
 * ONE size rule for structure drawings, formulas and names (step 8.5d; standards per context and labels apart from the bond: 8.5e). Pure arithmetic on numbers: no chemistry, no DOM.
 * R1 every context draws at a FIXED BOND LENGTH (its standard), so every molecule has the same scale, like a textbook; the box follows the
 * drawing, with a minimum box so a tiny molecule is not lost. R2 when it does not fit: (a) the box grows into the free space of its row,
 * (b) the drawing shrinks, never below FLOOR of the standard, (c) a row of drawings wraps (`rowScale`), (d) a single drawing still wider
 * than its space keeps the floor scale in a box that scrolls. Nothing is clipped. R3 text is never clipped: `formulaBreaks` and
 * `nameBreaks` say where it may wrap.
 */
import { FIXED_SCALE_BOND_UNITS } from '@/chem/contracts';

/** An atom label is never drawn under this height, in px. */
export const MIN_LABEL_PX = 11;
/**
 * The smallest scale of a drawing, as a share of its context's standard. Labels are 13 px at the standard (`LABEL_GLYPH_PX`, set apart from the bond length in
 * the drawing itself, step 8.5e) and a shrink scales them with the drawing, so the floor is 11 / 13: a label is never under `MIN_LABEL_PX`.
 */
export const FLOOR = 0.85;

export type SizeContext = 'family' | 'equation' | 'hero' | 'mechanism';
export interface SizeRule {
  /** The bond length on the page, in px, when the drawing fits. */
  readonly standard: number;
  /** The smallest box, in px. */
  readonly minWidth: number;
  readonly minHeight: number;
}
/** The bond length of each context (step 8.5e; 8.5d had 56 for all; the mechanism's is 44 since 8.5g). The labels do not follow it: they are 13 px in every context. */
export const SIZE_RULES: Readonly<Record<SizeContext, SizeRule>> = {
  family: { standard: 28, minWidth: 72, minHeight: 56 },
  equation: { standard: 34, minWidth: 48, minHeight: 40 },
  hero: { standard: 40, minWidth: 48, minHeight: 40 },
  mechanism: { standard: 44, minWidth: 48, minHeight: 40 },
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

/**
 * The width of a row at scale 1, from what is measured now at `scale`: the widths of its parts and gaps, with the drawings' share (`drawings`, their summed
 * widths now) grown back to scale 1; the rest (text, arrows) does not scale (step 8.5e, E2 a).
 */
export function naturalRowWidth(row: { readonly parts: readonly number[]; readonly drawings: number; readonly gap: number }, scale: number): number {
  const parts = row.parts.reduce((sum, width) => sum + width, 0);
  return parts + row.gap * Math.max(0, row.parts.length - 1) + (scale > 0 ? row.drawings * (1 / scale - 1) : 0);
}

/** A condensed formula wraps after a bond dash that joins two groups, never inside a group ("CH3", "COO") and never at a charge. */
export function formulaBreaks(formula: string): string[] {
  return formula === '' ? [] : formula.split(/(?<=[-–])(?=[A-Za-z([])/);
}

/** A name wraps at spaces and after "-" (the browser's own breaks) and after a comma, so the caller adds a break after each part but the last. */
export function nameBreaks(name: string): string[] {
  return name === '' ? [] : name.split(/(?<=,)(?=\S)/);
}
