/**
 * Validation of `DepictionOptions` (pure; used by the adapter and by the chem worker's host at the wire, where a bad value is
 * `BAD_REQUEST`). `DrawDetails` is what a depiction depends on, in a fixed order: it is also the options part of the cache key.
 */
import { STRUCTURE_MODES, type DepictionOptions, type StructureMode } from './contracts';

export const MIN_DEPICTION_SIZE = 16;
export const MAX_DEPICTION_SIZE = 4_096;
export const MAX_HIGHLIGHT_MAPS = 1_000;

export interface DrawDetails {
  readonly width: number;
  readonly height: number;
  readonly showAtomMaps: boolean;
  readonly highlightAtomMaps: readonly number[];
  readonly mode: StructureMode;
}

const isSize = (value: unknown): boolean => typeof value === 'number' && Number.isInteger(value) && value >= MIN_DEPICTION_SIZE && value <= MAX_DEPICTION_SIZE;

/** Bad options are a programmer error: this throws a `RangeError` with the reason. */
export function depictionDetails(options: DepictionOptions): DrawDetails {
  if (!isSize(options.width) || !isSize(options.height)) {
    throw new RangeError(`depiction width and height must be integers from ${MIN_DEPICTION_SIZE} to ${MAX_DEPICTION_SIZE}`);
  }
  if (typeof options.showAtomMaps !== 'boolean') throw new RangeError('depiction showAtomMaps must be true or false');
  const maps = options.highlightAtomMaps ?? [];
  if (!Array.isArray(maps) || maps.length > MAX_HIGHLIGHT_MAPS || !maps.every((map) => Number.isInteger(map) && map >= 0)) {
    throw new RangeError(`highlightAtomMaps must be at most ${MAX_HIGHLIGHT_MAPS} non-negative integers`);
  }
  const mode = options.mode ?? 'skeletal';
  if (!(STRUCTURE_MODES as readonly unknown[]).includes(mode)) throw new RangeError(`depiction mode must be one of ${STRUCTURE_MODES.join(', ')}`);
  return { width: options.width, height: options.height, showAtomMaps: options.showAtomMaps, highlightAtomMaps: [...new Set(maps)].sort((a, b) => a - b), mode };
}
