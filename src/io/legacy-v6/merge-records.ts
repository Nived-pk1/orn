/**
 * The records of the compound mapping (step 3.10) and of the reaction mapping (step 3.11a) as ONE set, in the shape of
 * `ImportParseResult.records`. An asset used by a compound and by a reaction is one record: the reaction mapper returns a changed
 * copy (`updatedAssets`), which replaces the compound mapper's record here. Nothing is mutated; order is compounds first.
 */
import type { AnyRecord, RecordKind } from '@/core/schema';
import type { ParsedAsset } from '../contracts';
import type { MappedCompounds } from './compound-map';
import type { MappedClassification } from './classify-map';
import type { MappedReactions } from './reaction-map';

export interface MergedMapping {
  readonly records: Readonly<Partial<Record<RecordKind, readonly AnyRecord[]>>>;
  readonly assetBytes: readonly ParsedAsset[];
}

export function mergeMappedRecords(compounds: MappedCompounds, reactions: MappedReactions): MergedMapping {
  const updated = new Map(reactions.updatedAssets.map((asset) => [asset.id as string, asset] as const));
  return {
    records: {
      species: [...compounds.records.species, ...reactions.records.species],
      class: compounds.records.class,
      reagent: reactions.records.reagent,
      reaction: reactions.records.reaction,
      navigator_anchor: compounds.records.navigator_anchor,
      entity_display: compounds.records.entity_display,
      asset: [...compounds.records.asset.map((asset) => updated.get(asset.id as string) ?? asset), ...reactions.records.asset],
    },
    assetBytes: [...compounds.assetBytes, ...reactions.assetBytes],
  };
}

/**
 * The compound, reaction and classification results (step 3.11b) as one set: the completed reactions replace the 3.11a ones (same
 * IDs, same order), and the concepts, named reactions, topics, topic mappings, transformations, mechanisms, caveats, relationships and
 * exam relevance records are added.
 */
export function mergeAllMappedRecords(compounds: MappedCompounds, reactions: MappedReactions, classification: MappedClassification): MergedMapping {
  const base = mergeMappedRecords(compounds, reactions);
  const { reaction, ...added } = classification.records;
  return { records: { ...base.records, reaction, ...added }, assetBytes: base.assetBytes };
}
