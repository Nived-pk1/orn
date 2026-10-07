/**
 * Accessible names (docs/UI_ARCHITECTURE.md §11; step 5.3): "Ethanol, species, 3 reactions out, 1 reaction in, 2 hidden".
 * Plain text built from counts the projection already holds; no markup, so a hostile name is read as it is written.
 */
import type { GraphNode, NodeFlag } from '@/core/graph/contracts';
import type { NodeGlyph, SceneEdge } from './contracts';
import type { NodeContent } from './node-content';
import type { DrawnPath } from './paths';

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const GLYPH_WORD: Readonly<Record<NodeGlyph, string>> = {
  class_hub: 'class hub',
  species: 'species',
  reagent: 'reagent',
  reaction: 'reaction',
  concept: 'concept',
  named_reaction: 'named reaction',
  mechanism: 'mechanism',
  topic: 'topic',
  overflow: 'hidden members',
  unclassified: 'hub for everything without a hub',
};

const FLAG_WORD: Readonly<Record<NodeFlag, string>> = {
  has_caveat: 'has a caveat',
  has_mechanism: 'has a mechanism',
  review_required: 'review required',
  has_warning: 'has a warning',
  has_error: 'has an error',
  outside_scope: 'outside the exam scope',
  unanchored: 'not under a hub',
  no_structure: 'no structure',
};

/** Arrows (not paths) leaving and entering each node, and self-loops, from the drawn paths; structural edges are not reactions. */
export interface NodeCounts {
  readonly out: number;
  readonly in: number;
  readonly loops: number;
}

export function countsByNode(paths: readonly DrawnPath[]): ReadonlyMap<string, NodeCounts> {
  const counts = new Map<string, { out: number; in: number; loops: number }>();
  const at = (id: string) => {
    let entry = counts.get(id);
    if (entry === undefined) {
      entry = { out: 0, in: 0, loops: 0 };
      counts.set(id, entry);
    }
    return entry;
  };
  for (const path of paths) {
    if (path.edges.every((edge) => edge.semantic === 'membership' || edge.semantic === 'overflow')) continue;
    if (path.loop) at(path.from).loops += path.total;
    else {
      at(path.from).out += path.total;
      at(path.to).in += path.total;
    }
  }
  return counts;
}

export function nodeAria(node: GraphNode, content: NodeContent, counts: NodeCounts | undefined): string {
  const parts = [content.name, GLYPH_WORD[content.glyph]];
  if (node.role === 'member') parts.push('member of a hub');
  if (node.role === 'overflow') {
    parts.push(plural(node.hidden.outgoing + node.hidden.incoming, 'arrow'));
    return parts.join(', ');
  }
  if (counts !== undefined) {
    if (counts.out > 0) parts.push(`${plural(counts.out, 'reaction')} out`);
    if (counts.in > 0) parts.push(`${plural(counts.in, 'reaction')} in`);
    if (counts.loops > 0) parts.push(`${plural(counts.loops, 'reaction')} from and back to itself`);
  }
  const hidden = node.hidden.outgoing + node.hidden.incoming;
  if (hidden > 0) parts.push(`${plural(hidden, 'hidden neighbour')}`);
  for (const flag of node.flags) parts.push(FLAG_WORD[flag]);
  return parts.join(', ');
}

export function edgeAria(path: DrawnPath, semantic: SceneEdge['semantic'], fromName: string, toName: string, drawn: number): string {
  if (semantic === 'membership') return `${toName} is a member of ${fromName}`;
  if (semantic === 'overflow') return `${toName} stands for hidden members of ${fromName}`;
  const what = path.loop ? `${fromName} back to itself` : `${fromName} to ${toName}`;
  const count = path.bundled || path.total > 1 ? `${plural(path.total, 'reaction')}${drawn < path.total ? `, ${drawn} drawn` : ''}` : '1 reaction';
  return `${what}, ${count}`;
}
