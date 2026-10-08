/**
 * Test kit for the scene builders (step 5.3): a deterministic text measurer, ports read from a canonical state, tiny hand-made
 * projections, and the whole pure pipeline (projection -> sizes -> request -> fallback layout -> scene). Test code only.
 */
import { arrowTextOf } from '@/core/graph/arrow-text';
import type { EdgeBundle, GraphEdge, GraphNode, Projection } from '@/core/graph/contracts';
import type { AnyRecord, CanonicalState, Reaction, RecordRef } from '@/core/schema';
import { layoutFallback } from '@/layout';
import type { LayoutResult } from '@/layout/contracts';
import { buildLayoutRequest, buildScene, labelSizes, nodeSizes, type LabelSizes, type LayoutRequestOptions, type NodeSizes, type Scene, type ScenePorts, type TextMeasurer } from '@/render/scene';
import type { LayoutRequest } from '@/layout/contracts';

/** Width by characters, height by size: no fonts, no DOM. */
export const fakeMeasurer: TextMeasurer = (runs, style) => ({
  width: runs.reduce((sum, run) => sum + run.text.length * style.size * (style.mono ? 0.6 : 0.5) * (style.weight === 'strong' ? 1.1 : 1), 0),
  height: style.size * 1.3,
});

type Loose = Record<string, unknown>;
const recordOf = (state: CanonicalState, ref: RecordRef): Loose | undefined => (state.records[ref.kind] as Record<string, unknown>)[ref.id] as Loose | undefined;

/** Ports over a state: names, formulas and charges of records, no depictions, arrow text from the real producer. */
export function portsOf(state: CanonicalState, depictions = false): ScenePorts {
  const nameOf = (record: Loose): string => {
    const names = record.names as { canonical?: string; display?: string } | undefined;
    return names?.display ?? names?.canonical ?? String(record.name ?? record.id);
  };
  const describe: ScenePorts['describe'] = (ref) => {
    const record = recordOf(state, ref);
    if (record === undefined) return undefined;
    const formula = (record.formula ?? record.generalFormula ?? record.formulaText) as string | undefined;
    const charge = record.charge as number | undefined;
    return { name: nameOf(record), ...(formula === undefined ? {} : { formula }), ...(charge === undefined ? {} : { charge }) };
  };
  // As in the app's scene ports: a reagent has a formula for arrow text only when it is exactly one species.
  const describeForArrow: ScenePorts['describe'] = (ref) => {
    if (ref.kind !== 'reagent') return describe(ref);
    const reagent = recordOf(state, ref);
    if (reagent === undefined) return undefined;
    const speciesId = reagent.speciesId as string | undefined;
    const species = speciesId === undefined ? undefined : recordOf(state, { kind: 'species', id: speciesId } as RecordRef);
    const formula = (species?.formula ?? species?.formulaText) as string | undefined;
    return { name: nameOf(reagent), ...(formula === undefined ? {} : { formula }) };
  };
  const hidden = new Set(Object.values(state.records.entity_display).filter((d) => d.showAsNode === 'never').map((d) => `${d.target.kind}:${d.target.id}`));
  return {
    describe,
    depictionKeyOf: (ref) => (depictions ? `depiction:${ref.id}` : undefined),
    arrowTextOf: (edge) => {
      if (edge.reactionId === undefined) return undefined;
      const reaction = state.records.reaction[edge.reactionId] as Reaction | undefined;
      if (reaction === undefined) return undefined;
      return arrowTextOf(reaction, {
        schemes: Object.values(state.records.reaction_scheme).filter((scheme) => scheme.reactionId === reaction.id),
        conditionVariantIds: edge.conditionVariantIds,
        ...(edge.participantId === undefined ? {} : { carriedParticipantId: edge.participantId }),
        describe: describeForArrow,
        shownAsNode: (ref) => !hidden.has(`${ref.kind}:${ref.id}`),
      });
    },
  };
}

export const nobodyPorts: ScenePorts = { describe: () => undefined, depictionKeyOf: () => undefined, arrowTextOf: () => undefined };

export const node = (id: string, over: Partial<GraphNode> = {}): GraphNode => ({
  id,
  kind: 'class',
  record: { kind: 'class', id },
  role: 'anchor',
  depth: 0,
  hidden: { outgoing: 0, incoming: 0 },
  flags: [],
  ...over,
});

export const edge = (id: string, from: string, to: string, over: Partial<GraphEdge> = {}): GraphEdge => ({
  id,
  from,
  to,
  semantic: 'transforms_to',
  selectivity: 'major',
  conditionVariantIds: [],
  inferred: false,
  layoutDirection: 'forward',
  ...over,
});

export const bundle = (id: string, from: string, to: string, edgeIds: readonly string[], total = edgeIds.length): EdgeBundle => ({ id, from, to, edgeIds: [...edgeIds].sort(), total });

export function projectionOf(parts: { nodes: readonly GraphNode[]; edges?: readonly GraphEdge[]; bundles?: readonly EdgeBundle[]; truncation?: Projection['truncation']; view?: Projection['view'] }): Projection {
  return {
    view: parts.view ?? 'navigator',
    revision: 7,
    key: 'key',
    nodes: [...parts.nodes].sort((a, b) => (a.id < b.id ? -1 : 1)),
    edges: [...(parts.edges ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1)),
    bundles: [...(parts.bundles ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1)),
    unanchoredReactionIds: [],
    truncation: parts.truncation ?? null,
  };
}

export interface Piped {
  readonly sizes: NodeSizes;
  readonly labels: LabelSizes;
  readonly request: LayoutRequest;
  readonly layout: LayoutResult;
  readonly scene: Scene;
}

/** projection -> sizes -> request -> the pure fallback layout -> scene; throws on a refused step (a test bug or a real one). */
export function pipe(projection: Projection, ports: ScenePorts, options: LayoutRequestOptions = {}): Piped {
  const sizes = nodeSizes(projection, ports, fakeMeasurer);
  const labels = labelSizes(projection, ports, fakeMeasurer);
  const built = buildLayoutRequest(projection, sizes, { labelSizes: labels, ...options });
  if (!built.ok) throw new Error(`layout request refused: ${built.code} ${built.message}`);
  const layout = layoutFallback(built.request, 'engine_unavailable', () => 0);
  const scene = buildScene(projection, layout, { sizes, labelSizes: options.labelSizes ?? labels }, ports);
  if (!scene.ok) throw new Error(`scene refused: ${scene.code} ${scene.message}`);
  return { sizes, labels, request: built.request, layout, scene: scene.scene };
}

export const recordsOf = (state: CanonicalState, kind: AnyRecord['kind']): readonly AnyRecord[] => Object.values(state.records[kind] as Record<string, AnyRecord>);
