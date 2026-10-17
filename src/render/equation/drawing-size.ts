/**
 * How big a fixed-scale drawing is shown (equation step, part 5): every drawing has the same bond length on the page (`bondPx`), so its
 * size is the size RDKit gave it times (bondPx / the nominal bond of the chem module). A drawing wider than `maxWidth` or taller than
 * `maxHeight` is scaled down WHOLE (one factor for both sides), so it is never distorted; its bond is then shorter, as the drawing is.
 * Pure arithmetic on numbers: no chemistry.
 */
import { FIXED_SCALE_BOND_UNITS } from '@/chem/contracts';

export interface DrawingSize {
  readonly width: number;
  readonly height: number;
  /** The bond length on the page, in px, after any scaling down. */
  readonly bondPx: number;
}

export function drawingSizeOf(drawing: { readonly width: number; readonly height: number }, bondPx: number, maxWidth: number, maxHeight: number): DrawingSize {
  const wanted = bondPx / FIXED_SCALE_BOND_UNITS;
  const down = Math.min(1, maxWidth / (drawing.width * wanted), maxHeight / (drawing.height * wanted));
  const scale = wanted * down;
  return { width: Math.max(1, Math.round(drawing.width * scale)), height: Math.max(1, Math.round(drawing.height * scale)), bondPx: Math.round(FIXED_SCALE_BOND_UNITS * scale * 100) / 100 };
}
