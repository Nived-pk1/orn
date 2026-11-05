/**
 * The words of a map selection (step 8.3, C6), for the line beside the toolbar and for the live region, so both say the same. `full` is the
 * accessible name the map already speaks (Studio: "Alcohols, class hub, 3 reactions out ..."); `name` is the record's name only (Study:
 * "Alcohols", an arrow "Alcohols to Aldehydes": no kind words, no counts). Undefined when the selection is not drawn now.
 */
import type { Scene } from '@/render/scene';
import { nameOf } from './canvas-menu';

export type SelectionMode = 'full' | 'name';

export function selectionWordsOf(scene: Scene | null, selected: { readonly kind: string; readonly id: string }, mode: SelectionMode): string | undefined {
  if (scene === null) return undefined;
  if (selected.kind === 'node') {
    const node = scene.nodes.find((candidate) => candidate.id === selected.id);
    return node === undefined ? undefined : mode === 'full' ? node.ariaLabel : nameOf(node);
  }
  const edge = scene.edges.find((candidate) => candidate.id === selected.id);
  if (edge === undefined) return undefined;
  if (mode === 'full') return edge.ariaLabel;
  const end = (id: string): string => {
    const node = scene.nodes.find((candidate) => candidate.id === id);
    return node === undefined ? id : nameOf(node);
  };
  return `${end(edge.from)} to ${end(edge.to)}`;
}
