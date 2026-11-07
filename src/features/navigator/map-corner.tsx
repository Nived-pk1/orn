/**
 * What sits INSIDE the map (step 8.3b, A3, A4, B2.2; a lazy chunk): the hint or "Selected: A → B" with its clear button in the top-left corner,
 * and the small key of the drawn arrows in the bottom-left corner (the bottom-right when the left would cover a box). Pure placement rule:
 * `keyPlacement` over the boxes' screen rectangles. It draws overlays only; the map under them is the canvas's.
 */
import { useMemo } from 'react';
import type { Scene } from '@/render/scene';
import type { Viewport } from '@/render/viewport';
import { ArrowKey } from './arrow-key';
import { keyPlacement, type ScreenRect } from './key-placement';
import type { LegendKey } from './legend';
import { MapHint } from './map-hint';
import { selectionWordsOf } from './selection-words';

const KEY_SIZE = { width: 300, height: 48 };

export interface MapCornerProps {
  readonly scene: Scene;
  /** The boxes as drawn now (the focus view); the selection is read from the full scene. */
  readonly drawn: Scene;
  readonly selected: { readonly kind: string; readonly id: string } | null;
  /** A multi-selection (Studio) has its own line: no "Selected:" label then. */
  readonly multi: boolean;
  readonly settled: Viewport | undefined;
  readonly svg: SVGSVGElement | null;
  readonly onClear: () => void;
  /** "Zoom to selection": the button in the "Selected" label; absent when there is nothing to zoom to. */
  readonly onZoom?: (() => void) | undefined;
  readonly hint: string | undefined;
  readonly hintKind: 'quiet' | 'busy' | undefined;
  readonly keys: LegendKey;
}

export function MapCorner(props: MapCornerProps) {
  const { drawn, settled, svg } = props;
  const corner = useMemo(() => {
    const area = svg?.getBoundingClientRect();
    if (settled === undefined || area === undefined) return 'bottom-left' as const;
    const boxes: ScreenRect[] = drawn.nodes.map((node) => ({ x: node.x * settled.scale + settled.x, y: node.y * settled.scale + settled.y, width: node.width * settled.scale, height: node.height * settled.scale }));
    return keyPlacement(boxes, KEY_SIZE, { width: area.width, height: area.height });
  }, [drawn, settled, svg]);
  const words = props.selected === null || props.multi ? undefined : selectionWordsOf(props.scene, props.selected, 'corner');
  return (
    <>
      <MapHint selected={words === undefined ? undefined : `Selected: ${words}`} onClear={props.onClear} onZoom={props.onZoom} zoomName={words} hint={props.hint} hintKind={props.hintKind} />
      <ArrowKey keys={props.keys} corner={corner} />
    </>
  );
}
