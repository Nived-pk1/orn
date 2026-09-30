/**
 * The substances a legacy reaction refers to (docs/MIGRATION.md §4.5, §4.6). Three ways to a record, all inside the SAME imported
 * document (matching against the user's live dataset is not done here: the import pipeline's conflict analysis handles IDs):
 *  - a participant `ref` names a mapped compound (the species or class it became, whatever the hub decision was); an ID no compound
 *    has gets ONE placeholder species "Missing legacy compound <id>" (draft, review), shared by every reference to it;
 *  - a label-only participant is matched by folded name against the mapped compounds, then against the records this run already
 *    created from labels;
 *  - otherwise ONE record per folded label is created (a reagent for reagent-like roles, a species for substance roles), review.
 * Ambiguity is never resolved silently: several matches use the first (file order) and say so. Everything is a Map lookup.
 */
import { NameTextSchema, type ChemicalClass, type Reagent, type RecordRef, type Species, type SpeciesOrClassRef, type SubstanceRef } from '@/core/schema';
import { fold } from '@/core/text';
import { provenanceOf, reviewOf, speciesRecord, type Stamp } from './compound-records';
import { excerpt } from './compound-scope';
import { list } from './compound-review';
import type { MappedCompounds } from './compound-map';
import { idKey, type LegacyDocumentIds } from './id-collect';
import { LabelTextSchema } from '@/core/schema';

/** What a label-only participant needs: a reagent-like role may end at a reagent, a substance role at a species or reagent, a product only at a species or class. */
export type SubstanceNeed = 'reagent_like' | 'substance' | 'product';

export interface LabelResolution {
  readonly ref: SubstanceRef;
  readonly how: 'compound' | 'created_earlier' | 'created';
  /** Set when several mapped records have this folded name (the first was used). */
  readonly ambiguousWith?: readonly string[];
}

interface Usage {
  readonly reactions: string[];
}

interface CreatedLabel extends Usage {
  readonly id: string;
  readonly kind: 'reagent' | 'species';
  readonly name: string;
  readonly labels: string[];
}

interface Placeholder extends Usage {
  readonly id: string;
  readonly legacyRef: string;
  readonly ordinal: number;
}

export interface SubstanceBook {
  /** A participant `ref` (truthy legacy value): the mapped compound, or the shared placeholder for a compound the file lacks. */
  refFor(legacyRef: unknown, reaction: string): { readonly ref: SpeciesOrClassRef; readonly placeholder: boolean };
  /** A label-only participant: `name` is the remainder (or the whole label when it holds tokens only); `original` the label as written. */
  labelFor(name: string, original: string, need: SubstanceNeed, reaction: string): LabelResolution;
  /** The records this run made (placeholders, then labels, in first-use order). `moreReasons` adds reasons by record ID (ID collisions). */
  records(moreReasons: (id: string) => readonly string[]): { readonly reagent: Reagent[]; readonly species: Species[] };
  /** True when `name` can be the name of a created record. */
  canName(name: string): boolean;
}

const usedBy = (usage: Usage): string => `${list(usage.reactions.map((reaction) => excerpt(reaction, 30)), 3)}`;

function note(usage: Usage, reaction: string): void {
  if (!usage.reactions.includes(reaction)) usage.reactions.push(reaction);
}

export function createSubstanceBook(input: { readonly ids: LegacyDocumentIds; readonly compounds: MappedCompounds; readonly stamp: Stamp }): SubstanceBook {
  const { ids, compounds, stamp } = input;
  const byName = new Map<string, RecordRef[]>();
  const index = (record: Species | ChemicalClass): void => {
    const key = fold(record.names.canonical);
    byName.set(key, [...(byName.get(key) ?? []), { kind: record.kind, id: record.id } as RecordRef]);
  };
  compounds.records.species.forEach(index);
  compounds.records.class.forEach(index);

  const placeholders = new Map<string, Placeholder>();
  const created = new Map<string, { reagent?: CreatedLabel; species?: CreatedLabel }>();
  const order: (CreatedLabel | Placeholder)[] = [];

  return {
    canName: (name) => NameTextSchema.safeParse(name).success,
    refFor(legacyRef, reaction) {
      const key = idKey(legacyRef);
      const hit = compounds.refByLegacyId.get(key);
      if (hit !== undefined) return { ref: { kind: hit.kind, id: hit.id } as SpeciesOrClassRef, placeholder: false };
      let placeholder = placeholders.get(key);
      if (placeholder === undefined) {
        placeholder = { id: ids.ids.speciesId(key), legacyRef: key, ordinal: placeholders.size + 1, reactions: [] };
        placeholders.set(key, placeholder);
        order.push(placeholder);
      }
      note(placeholder, reaction);
      return { ref: { kind: 'species', id: placeholder.id } as SpeciesOrClassRef, placeholder: true };
    },
    labelFor(name, original, need, reaction) {
      const key = fold(name);
      const matches = byName.get(key);
      if (matches !== undefined) {
        const first = matches[0] as RecordRef;
        const ambiguousWith = matches.length > 1 ? matches.slice(1).map((match) => match.id as string) : undefined;
        return { ref: { kind: first.kind, id: first.id } as SubstanceRef, how: 'compound', ...(ambiguousWith === undefined ? {} : { ambiguousWith }) };
      }
      const pool = created.get(key) ?? {};
      created.set(key, pool);
      const wanted: readonly ('reagent' | 'species')[] = need === 'product' ? ['species'] : need === 'reagent_like' ? ['reagent', 'species'] : ['species', 'reagent'];
      for (const kind of wanted) {
        const existing = pool[kind];
        if (existing !== undefined) {
          note(existing, reaction);
          if (!existing.labels.includes(original)) existing.labels.push(original);
          return { ref: { kind, id: existing.id } as SubstanceRef, how: 'created_earlier' };
        }
      }
      const kind: 'reagent' | 'species' = need === 'reagent_like' ? 'reagent' : 'species';
      const record: CreatedLabel = { id: kind === 'reagent' ? ids.ids.reagentFromLabelId(name) : ids.ids.speciesFromLabelId(name), kind, name, labels: [original], reactions: [reaction] };
      pool[kind] = record;
      order.push(record);
      return { ref: { kind, id: record.id } as SubstanceRef, how: 'created' };
    },
    records(moreReasons) {
      const reagent: Reagent[] = [];
      const species: Species[] = [];
      for (const item of order) {
        if ('legacyRef' in item) {
          const named = NameTextSchema.safeParse(`Missing legacy compound ${item.legacyRef}`).success;
          const name = named ? `Missing legacy compound ${item.legacyRef}` : `Missing legacy compound #${item.ordinal}`;
          const stored = LabelTextSchema.safeParse(item.legacyRef).success;
          const reasons = [
            `referenced by ${item.reactions.length} reaction(s) (${usedBy(item)}) but no compound has the legacy id ${excerpt(item.legacyRef)}; placeholder created so nothing dangles`,
            ...(named ? [] : [`the legacy id cannot be part of a name; kept in legacy.unmapped`]),
            ...moreReasons(item.id),
          ];
          species.push(
            speciesRecord(
              { id: item.id, fields: { canonicalName: name, tags: [], neverNode: false }, provenance: provenanceOf(stamp, stored ? item.legacyRef : undefined, named && stored ? undefined : { id: item.legacyRef }), review: reviewOf(reasons, 'draft') },
              [],
            ),
          );
          continue;
        }
        const reasons = [
          `created from the participant label ${excerpt(item.labels[0] ?? item.name)}${item.labels.length > 1 ? ` (and ${item.labels.length - 1} other spelling(s))` : ''} in ${item.reactions.length} reaction(s) (${usedBy(item)}); no compound of this name in the file: check whether it is an existing compound`,
          ...moreReasons(item.id),
        ];
        const provenance = provenanceOf(stamp, LabelTextSchema.safeParse(`label:${item.name}`).success ? `label:${item.name}` : undefined);
        const review = reviewOf(reasons, 'published');
        if (item.kind === 'species') {
          species.push(speciesRecord({ id: item.id, fields: { canonicalName: item.name, tags: [], neverNode: false }, provenance, review }, []));
        } else {
          reagent.push({
            id: item.id as Reagent['id'],
            kind: 'reagent',
            names: { canonical: item.name, common: [], aliases: [] },
            components: [],
            families: [],
            classIds: [],
            profiles: [],
            tags: [],
            citations: [],
            provenance,
            review,
          });
        }
      }
      return { reagent, species };
    },
  };
}
