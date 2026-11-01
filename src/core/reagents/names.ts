/** Small readers shared by the reagent list and the usage (7.3c): a record's shown name and the names a reagent can be found by. */
import type { AnyRecord } from '../schema';

type Loose = Readonly<Record<string, unknown>>;
const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

export function shownName(record: AnyRecord | undefined, fallback: string): string {
  if (record === undefined) return fallback;
  const loose = record as unknown as Loose;
  const names = loose.names as Loose | undefined;
  return text(names?.display) ?? text(names?.canonical) ?? text(loose.name) ?? fallback;
}

interface Findable {
  readonly names: { readonly canonical: string; readonly display?: string | undefined; readonly iupac?: string | undefined; readonly common: readonly string[]; readonly aliases: readonly string[] };
  readonly profiles: readonly { readonly label: string; readonly aliases: readonly string[] }[];
}

/** Every name a reagent is found by: its names, aliases, and its profiles' labels and aliases. */
export function findableNames(reagent: Findable): string[] {
  const { names } = reagent;
  return [
    names.canonical,
    ...(names.display === undefined ? [] : [names.display]),
    ...(names.iupac === undefined ? [] : [names.iupac]),
    ...names.common,
    ...names.aliases,
    ...reagent.profiles.flatMap((profile) => [profile.label, ...profile.aliases]),
  ];
}
