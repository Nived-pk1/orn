/**
 * The map's multi-selection engine (step 6.8b, Y1; Studio only): the part that is loaded on the first Shift-click, marquee or Select tap,
 * not at start. It holds the pure model (`multi-select.ts`), the selection-store changes of a toggle and of a finished marquee, the
 * description of a selection (the line and its reactions) and the bulk bar. The hook (`use-multi-select.tsx`) is the small shell that
 * stays in the entry chunk and loads this through the injected loader. No chemistry.
 */
import type { Selected } from '@/ui/state';
import { MultiActions } from './multi-actions';
import { marqueeFamilies, reactionsOfSelection, selectionLine, worldRect } from './multi-select';
import type { MultiEngine } from './multi-types';

export const multiEngine: MultiEngine = {
  toggle(selection, hit, isHub) {
    if (hit.kind === 'node' && !isHub(hit.id)) return null;
    const item: Selected = { kind: hit.kind, id: hit.id };
    const store = selection.getState();
    // the single selection and the multi-selection are never both on: the first Shift-click brings the single one in
    if (store.multi.length === 0 && store.selected !== null && (store.selected.kind !== item.kind || store.selected.id !== item.id)) store.setMulti([store.selected]);
    store.toggle(item);
    const now = selection.getState().multi.length;
    return now === 0 ? 'Selection cleared' : `${now} selected`;
  },
  toggleFocused(selection, id, isHub) {
    return id === undefined ? 'Move to a family first, then press Shift+Space to select it' : multiEngine.toggle(selection, { kind: 'node', id }, isHub);
  },
  addMarquee(selection, scene, origin, view, rect) {
    const inside = marqueeFamilies(scene, worldRect({ x: rect.x0, y: rect.y0 }, { x: rect.x1, y: rect.y1 }, origin, view));
    const store = selection.getState();
    const base = store.multi.length === 0 && store.selected !== null ? [store.selected] : store.multi;
    store.setMulti([...base, ...inside.map((id) => ({ kind: 'node', id }) as const)]);
    return `${inside.length} ${inside.length === 1 ? 'family' : 'families'} added; ${selection.getState().multi.length} selected`;
  },
  describe(items, scene, candidatesFrom) {
    const reactionIds = scene === null || items.length === 0 ? [] : reactionsOfSelection(items, scene, candidatesFrom);
    const line = selectionLine({ families: items.filter((one) => one.kind === 'node').length, arrows: items.filter((one) => one.kind === 'edge').length, reactions: reactionIds.length });
    return { line, reactionIds };
  },
  Actions: MultiActions,
};
