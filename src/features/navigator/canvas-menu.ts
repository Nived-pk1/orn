/**
 * What the canvas context menu offers (step 5.7, item g): a pure function of the Scene and the thing under the pointer or the
 * keyboard focus. It returns data (labels and actions); the hook runs the actions. An item that cannot apply is kept and says why.
 *
 *   family:  Open family page, Show in inspector, then its arrows ("To Aldehydes (3 reactions)", "From Alcohols (2 reactions)"),
 *            each selecting that arrow (the only keyboard route to an arrow: the keyboard moves between families)
 *   arrow:   Open at this group, Show in inspector
 *   nothing: Fit to view, Zoom in, Zoom out
 */
import type { Scene, SceneEdge, SceneNode } from '@/render/scene';
import { plainText, type SceneHit } from '@/render/svg';

export type MenuAction =
  | { readonly type: 'openPage'; readonly hubId: string }
  | { readonly type: 'openGroup'; readonly from: string; readonly to: string }
  | { readonly type: 'inspect'; readonly hit: SceneHit }
  | { readonly type: 'zoomIn' | 'zoomOut' | 'fit' };

export interface MenuEntry {
  readonly id: string;
  readonly label: string;
  readonly action: MenuAction;
  readonly unavailable?: string;
}

export interface CanvasMenu {
  /** The menu's accessible name. */
  readonly label: string;
  readonly entries: readonly MenuEntry[];
}

const reactionsWords = (count: number): string => `${count} ${count === 1 ? 'reaction' : 'reactions'}`;
export const bundleOf = (edge: SceneEdge): number => edge.bundleSize ?? 1;
export const nameOf = (node: SceneNode): string => plainText(node.label);

function familyEntries(scene: Scene, node: SceneNode, isHub: (id: string) => boolean): readonly MenuEntry[] {
  const name = nameOf(node);
  const entries: MenuEntry[] = [
    {
      id: 'page',
      label: 'Open family page',
      action: { type: 'openPage', hubId: node.id },
      ...(isHub(node.id) ? {} : { unavailable: `${name} is not a family with a page` }),
    },
    { id: 'inspect', label: 'Show in inspector', action: { type: 'inspect', hit: { kind: 'node', id: node.id } } },
  ];
  const label = (id: string): string => {
    const other = scene.nodes.find((candidate) => candidate.id === id);
    return other === undefined ? id : nameOf(other);
  };
  for (const edge of scene.edges) {
    if (edge.from === node.id && edge.to === node.id) entries.push(arrow(edge, `Within ${name}`));
    else if (edge.from === node.id) entries.push(arrow(edge, `To ${label(edge.to)}`));
  }
  for (const edge of scene.edges) {
    if (edge.to === node.id && edge.from !== node.id) entries.push(arrow(edge, `From ${label(edge.from)}`));
  }
  return entries;
}

const arrow = (edge: SceneEdge, text: string): MenuEntry => ({
  id: `arrow-${edge.id}`,
  label: `${text} (${reactionsWords(bundleOf(edge))})`,
  action: { type: 'inspect', hit: { kind: 'edge', id: edge.id } },
});

export function canvasMenuOf(scene: Scene, hit: SceneHit | null, isHub: (id: string) => boolean): CanvasMenu {
  if (hit === null) {
    return {
      label: 'Canvas',
      entries: [
        { id: 'fit', label: 'Fit to view', action: { type: 'fit' } },
        { id: 'zoom-in', label: 'Zoom in', action: { type: 'zoomIn' } },
        { id: 'zoom-out', label: 'Zoom out', action: { type: 'zoomOut' } },
      ],
    };
  }
  if (hit.kind === 'node') {
    const node = scene.nodes.find((candidate) => candidate.id === hit.id);
    if (node === undefined) return canvasMenuOf(scene, null, isHub);
    return { label: nameOf(node), entries: familyEntries(scene, node, isHub) };
  }
  const edge = scene.edges.find((candidate) => candidate.id === hit.id);
  if (edge === undefined) return canvasMenuOf(scene, null, isHub);
  const between = isHub(edge.from) && isHub(edge.to);
  return {
    label: edge.ariaLabel,
    entries: [
      {
        id: 'group',
        label: 'Open at this group',
        action: { type: 'openGroup', from: edge.from, to: edge.to },
        ...(between ? {} : { unavailable: 'the arrow does not run between two families' }),
      },
      { id: 'inspect', label: 'Show in inspector', action: { type: 'inspect', hit: { kind: 'edge', id: edge.id } } },
    ],
  };
}
