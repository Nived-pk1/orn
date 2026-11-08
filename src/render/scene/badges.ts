/** The badges of a node (step 5.4a): from its flags and its hidden neighbours; the renderer draws them, the title row (step 8.4c) reserves room for them. */
import type { GraphNode, NodeFlag } from '@/core/graph/contracts';
import type { SceneBadge } from './contracts';

const BADGE_OF: Readonly<Partial<Record<NodeFlag, SceneBadge['kind']>>> = {
  has_caveat: 'caveat',
  has_mechanism: 'mechanism',
  review_required: 'review',
  has_warning: 'warning',
  has_error: 'error',
  outside_scope: 'outside_scope',
};

export function badgesOf(node: GraphNode): SceneBadge[] {
  const badges: SceneBadge[] = [];
  for (const flag of node.flags) {
    const kind = BADGE_OF[flag];
    if (kind !== undefined) badges.push({ kind });
  }
  const hidden = node.hidden.outgoing + node.hidden.incoming;
  if (hidden > 0) badges.push({ kind: 'hidden_neighbours', count: hidden });
  return badges;
}
