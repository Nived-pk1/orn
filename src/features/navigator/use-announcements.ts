/**
 * What the navigator says when the selection or the open page changes (step 5.7, item h). The words come from the Scene (a family's
 * or an arrow's accessible name) so they are the ones the map already speaks; the zoom level is said by the canvas. One screen, one
 * live region: this runs in the view that holds it, so a page opening is heard although the canvas has gone.
 */
import { useEffect } from 'react';
import type { Scene } from '@/render/scene';
import { nameOf } from './canvas-menu';
import type { Announcer } from './announcer';
import type { NavigatorPorts } from './contracts';

export function useAnnouncements(ports: NavigatorPorts, announcer: Announcer, scene: Scene | null): void {
  useEffect(() => {
    const { selection, family } = ports.ui;
    let selected = selection.getState().selected;
    let open = family.getState().open;
    const nameFor = (id: string): string => {
      const node = scene?.nodes.find((candidate) => candidate.id === id);
      return node === undefined ? id : nameOf(node);
    };
    const offSelection = selection.subscribe((state) => {
      const next = state.selected;
      if (next === selected || (next !== null && selected !== null && next.id === selected.id && next.kind === selected.kind)) return;
      selected = next;
      if (next === null) return announcer.say('Selection cleared');
      const label = next.kind === 'node' ? scene?.nodes.find((node) => node.id === next.id)?.ariaLabel : scene?.edges.find((edge) => edge.id === next.id)?.ariaLabel;
      announcer.say(`Selected ${label ?? next.id}`);
    });
    const offFamily = family.subscribe((state) => {
      if (state.open === open) return;
      open = state.open;
      announcer.say(state.open === null ? 'Back to the overview' : `Opened the family page of ${nameFor(state.open)}`);
    });
    return () => {
      offSelection();
      offFamily();
    };
  }, [ports, announcer, scene]);
}
