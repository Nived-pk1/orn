/**
 * CHEM-006 (reviewer's reading, 2026-09-30): the species' stereo descriptors are compared with RDKit's CIP labels ONLY as two
 * multisets of letters: R/S and E/Z. Locants and words are ignored. It is cautious: it says "not compared" (in the status, never a
 * finding) whenever the comparison could be wrong:
 *   - a descriptor that is not just `[locant]letter` items (cis, trans, meso, achiral, rel-, RS, text);
 *   - lower-case r or s, in a descriptor or in the structure (pseudo-asymmetric centres);
 *   - the structure has unspecified stereocentres;
 *   - R/S: the descriptors name FEWER centres than the structure has, and what they name fits inside it (they may just not name
 *     them all). More centres than the structure has, or a letter it does not have, is a disagreement;
 *   - E/Z: RDKit does not list a double bond whose geometry is not given, so unequal counts could be an unspecified bond in the
 *     structure; only equal counts with different letters are a disagreement.
 * Pure: the structure side comes from `StructureFacts.cipCounts`.
 */
import type { CipCounts } from '../contracts';
import type { CheckDraft, NotCompared } from './contracts';

export interface Letters {
  readonly R: number;
  readonly S: number;
  readonly E: number;
  readonly Z: number;
}

export type DescriptorRead =
  | { readonly ok: true; readonly letters: Letters; readonly lowerCase: boolean }
  | { readonly ok: false; readonly reason: string };

/** `2R`, `3aS`, `2'R`, `R`, `E`; a list of them separated by comma, semicolon or slash, optionally in parentheses. */
const ITEM = /^(?:\d+[a-z]?'*\s*-?\s*)?([RSEZrs])$/;
const MAX_DESCRIPTOR_CHARS = 200;

export function readDescriptors(descriptors: readonly string[]): DescriptorRead {
  const tally: Record<string, number> = { R: 0, S: 0, E: 0, Z: 0 };
  let lowerCase = false;
  for (const raw of descriptors) {
    const text = raw.trim().replace(/^\(\s*/, '').replace(/\s*\)\s*-?$/, '').replace(/-$/, '');
    if (text.length === 0 || text.length > MAX_DESCRIPTOR_CHARS) return { ok: false, reason: `the descriptor "${raw.slice(0, 40)}" has no letters to compare` };
    for (const part of text.split(/\s*[,;/]\s*/)) {
      const match = ITEM.exec(part.trim());
      if (match === null) return { ok: false, reason: `the descriptor "${raw.slice(0, 40)}" is words or a form that is not [locant]R/S/E/Z` };
      const letter = match[1] as string;
      if (letter === 'r' || letter === 's') lowerCase = true;
      else tally[letter] = (tally[letter] ?? 0) + 1;
    }
  }
  return { ok: true, letters: { R: tally.R ?? 0, S: tally.S ?? 0, E: tally.E ?? 0, Z: tally.Z ?? 0 }, lowerCase };
}

const text = (counts: Letters, keys: readonly (keyof Letters)[]): string => {
  const parts = keys.filter((k) => counts[k] > 0).map((k) => `${counts[k] === 1 ? '' : String(counts[k])}${k}`);
  return parts.length === 0 ? 'none' : parts.join(', ');
};

export interface StereoInput {
  readonly descriptors: readonly string[];
  readonly cip: CipCounts | undefined;
  readonly unspecifiedStereocentres: number | undefined;
}

export interface StereoOutcome {
  readonly drafts: readonly CheckDraft[];
  readonly notCompared: readonly NotCompared[];
}

const skip = (reason: string): StereoOutcome => ({ drafts: [], notCompared: [{ ruleId: 'CHEM-006', reason: `the stereo descriptors were not compared: ${reason}` }] });

export function compareStereo(input: StereoInput): StereoOutcome {
  if (input.descriptors.length === 0) return { drafts: [], notCompared: [] };
  const read = readDescriptors(input.descriptors);
  if (!read.ok) return skip(read.reason);
  if (read.lowerCase) return skip('a descriptor uses lower-case r or s (a pseudo-asymmetric centre)');
  const { cip } = input;
  if (cip === undefined || input.unspecifiedStereocentres === undefined) return skip('the toolkit gave no stereo labels for this structure');
  if (cip.r > 0 || cip.s > 0) return skip('the structure has lower-case r or s centres (pseudo-asymmetric)');
  if (input.unspecifiedStereocentres > 0) return skip('the structure has stereocentres that are not specified');

  const entered = read.letters;
  const derived: Letters = { R: cip.R, S: cip.S, E: cip.E, Z: cip.Z };
  const drafts: CheckDraft[] = [];
  const notCompared: NotCompared[] = [];
  const note = (reason: string): void => void notCompared.push({ ruleId: 'CHEM-006', reason: `part of the stereo descriptors was not compared: ${reason}` });

  const rsEqual = entered.R === derived.R && entered.S === derived.S;
  const rsInside = entered.R <= derived.R && entered.S <= derived.S;
  if (!rsEqual) {
    if (rsInside) note(`they name ${entered.R + entered.S} R/S centres and the structure has ${derived.R + derived.S}`);
    else drafts.push(draft(entered, derived, ['R', 'S']));
  }
  const ezTotal = (l: Letters): number => l.E + l.Z;
  if (entered.E !== derived.E || entered.Z !== derived.Z) {
    if (ezTotal(entered) === ezTotal(derived)) drafts.push(draft(entered, derived, ['E', 'Z']));
    else note(`they name ${ezTotal(entered)} E/Z bonds and the structure shows ${ezTotal(derived)} (RDKit does not list a double bond whose geometry is not given)`);
  }
  return { drafts, notCompared };
}

function draft(entered: Letters, derived: Letters, keys: readonly (keyof Letters)[]): CheckDraft {
  const pick = (counts: Letters): Record<string, number> => Object.fromEntries(keys.map((k) => [k, counts[k]]));
  return {
    ruleId: 'CHEM-006',
    path: 'stereo.descriptors',
    message: `The stereo descriptors name ${text(entered, keys)}, but the structure's CIP labels are ${text(derived, keys)}.`,
    data: { entered: pick(entered), derived: pick(derived) },
  };
}
