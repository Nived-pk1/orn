/**
 * What a node shows (step 5.3): its glyph, the box kind that sizes it, its label and sublabel as runs, and its depiction key.
 * Names are text: one run, character for character, never read as markup (ADV-033); a formula gets typography only.
 * Labels of virtual nodes are fixed words, never derived from a record.
 */
import type { GraphNode } from '@/core/graph/contracts';
import type { BoxKind, FormattedText, NodeGlyph, ScenePorts } from './contracts';
import { formulaRuns, plainRuns } from './formatted-text';

export type { BoxKind };
/** Glyphs without a box of their own (reaction, concept, ...) use the `species` box. */

export interface NodeContent {
  readonly glyph: NodeGlyph;
  readonly box: BoxKind;
  /** The name shown, as plain text (the record's name, or its ID when the record is gone: shown, never blank). */
  readonly name: string;
  readonly label: FormattedText;
  readonly sublabel?: FormattedText;
  readonly depictionKey?: string;
}

export const UNCLASSIFIED_LABEL = 'Unclassified';

const GLYPH_OF_KIND: Readonly<Record<Exclude<GraphNode['kind'], 'virtual'>, NodeGlyph>> = {
  class: 'class_hub',
  species: 'species',
  reagent: 'reagent',
  reaction: 'reaction',
  concept: 'concept',
  named_reaction: 'named_reaction',
  mechanism: 'mechanism',
  topic: 'topic',
};

export function glyphOf(node: GraphNode): NodeGlyph {
  if (node.role === 'overflow') return 'overflow';
  if (node.role === 'unclassified') return 'unclassified';
  return node.kind === 'virtual' ? 'unclassified' : GLYPH_OF_KIND[node.kind];
}

function boxOf(node: GraphNode, glyph: NodeGlyph): BoxKind {
  if (glyph === 'overflow') return 'overflow';
  if (glyph === 'unclassified') return 'unclassified';
  if (node.role === 'member') return 'member';
  if (node.role === 'anchor') return 'hub';
  return glyph === 'reagent' ? 'reagent' : 'species';
}

const arrowsHidden = (node: GraphNode): number => node.hidden.outgoing + node.hidden.incoming;

export function contentOf(node: GraphNode, ports: ScenePorts): NodeContent {
  const glyph = glyphOf(node);
  const box = boxOf(node, glyph);
  if (glyph === 'overflow') {
    const members = node.hiddenMembers ?? arrowsHidden(node);
    const arrows = node.hiddenMembers === undefined ? 0 : arrowsHidden(node);
    const name = `+${members} more`;
    return { glyph, box, name, label: plainRuns(name), ...(arrows > 0 ? { sublabel: plainRuns(`${arrows} ${arrows === 1 ? 'arrow' : 'arrows'}`) } : {}) };
  }
  if (glyph === 'unclassified') return { glyph, box, name: UNCLASSIFIED_LABEL, label: plainRuns(UNCLASSIFIED_LABEL) };
  const described = node.record === undefined ? undefined : ports.describe(node.record);
  const name = described?.name ?? node.id;
  const formula = described?.formula;
  const depictionKey = node.record !== undefined && node.record.kind === 'species' ? ports.depictionKeyOf(node.record) : undefined;
  return {
    glyph,
    box,
    name,
    label: plainRuns(name),
    ...(formula === undefined || formula === '' ? {} : { sublabel: formulaRuns(formula, described?.charge) }),
    ...(depictionKey === undefined ? {} : { depictionKey }),
  };
}
