/**
 * The legacy v6 functional-group registry and `fgId` (v6 script, `FG` and `fgId`). It is DATA of the legacy format: `fgId` maps
 * free text (an id, a label or a known alias, case-insensitive) onto the canonical id and returns anything unrecognised
 * unchanged. It only exists so that the v4 → v5 port reproduces what v6 stored; it is not ORN chemistry.
 */
import { or } from './text';

interface LegacyFg {
  readonly id: string;
  readonly label: string;
  readonly aliases: readonly string[];
}

export const LEGACY_FG: readonly LegacyFg[] = [
  { id: 'alkane', label: 'Alkane', aliases: ['saturated hydrocarbon'] },
  { id: 'alkene', label: 'Alkene', aliases: ['olefin'] },
  { id: 'alkyne', label: 'Alkyne', aliases: [] },
  { id: 'arene', label: 'Arene', aliases: ['aromatic ring', 'aromatic'] },
  { id: 'haloalkane', label: 'Haloalkane', aliases: ['alkyl halide'] },
  { id: 'haloarene', label: 'Haloarene', aliases: ['aryl halide'] },
  { id: '1-alcohol', label: '1° alcohol', aliases: ['primary alcohol'] },
  { id: '2-alcohol', label: '2° alcohol', aliases: ['secondary alcohol'] },
  { id: '3-alcohol', label: '3° alcohol', aliases: ['tertiary alcohol'] },
  { id: 'phenol', label: 'Phenol', aliases: [] }, // hardcode-ok: a row of the legacy v6 FG vocabulary table (data of the format); nothing branches on it or on any record
  { id: 'ether', label: 'Ether', aliases: [] },
  { id: 'epoxide', label: 'Epoxide', aliases: ['oxirane'] },
  { id: 'aldehyde', label: 'Aldehyde', aliases: [] },
  { id: 'ketone', label: 'Ketone', aliases: [] },
  { id: 'carboxylic-acid', label: 'Carboxylic acid', aliases: ['COOH'] },
  { id: 'acyl-halide', label: 'Acyl halide', aliases: ['acid halide', 'acid chloride'] },
  { id: 'anhydride', label: 'Anhydride', aliases: [] },
  { id: 'ester', label: 'Ester', aliases: [] },
  { id: 'amide', label: 'Amide', aliases: [] },
  { id: 'nitrile', label: 'Nitrile', aliases: ['cyanide'] },
  { id: '1-amine', label: '1° amine', aliases: ['primary amine'] },
  { id: '2-amine', label: '2° amine', aliases: ['secondary amine'] },
  { id: '3-amine', label: '3° amine', aliases: ['tertiary amine'] },
  { id: 'diazonium', label: 'Diazonium salt', aliases: ['diazonium'] },
  { id: 'nitro', label: 'Nitro', aliases: [] },
  { id: 'isocyanide', label: 'Isocyanide', aliases: ['isonitrile'] },
  { id: 'grignard', label: 'Grignard reagent', aliases: ['organomagnesium'] },
  { id: 'sulphonic-acid', label: 'Sulphonic acid', aliases: ['sulfonic acid'] },
];

const norm = (value: unknown): string => String(or(value, '')).trim().toLowerCase();

/** Legacy `fgId`: the canonical id for an id, label or alias (case-insensitive); anything else is returned trimmed and unchanged. */
export function fgId(value: unknown): string {
  const text = String(or(value, '')).trim();
  if (!text) return '';
  const target = norm(text);
  const hit = LEGACY_FG.find((fg) => norm(fg.id) === target || norm(fg.label) === target || fg.aliases.some((alias) => norm(alias) === target));
  return hit ? hit.id : text;
}
