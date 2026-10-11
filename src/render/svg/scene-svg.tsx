/**
 * The static SVG renderer (step 5.4a; UI_ARCHITECTURE §6): ONE root `<svg>` and ONE world `<g>` (step 5.4b transforms it; nothing
 * here moves it) holding five memoised layers in drawing order: edges, nodes, labels, badges, overlay. A Scene and a few props in,
 * SVG out: no data access, no services, no chemistry. Selection and focus are props drawn by the overlay only.
 */
import { useId, useMemo, useRef, type MouseEvent, type PointerEvent } from 'react';
import { defIds, SceneDefs } from './defs';
import { BadgesLayer } from './badges-layer';
import type { SceneSvgProps } from './contracts';
import { EdgesLayer } from './edges-layer';
import { hitOf } from './hit';
import { LabelsLayer } from './labels-layer';
import { NodesLayer } from './nodes-layer';
import { OverlayLayer } from './overlay-layer';
import styles from './scene-svg.module.css';

export function SceneSvg(props: SceneSvgProps) {
  const { scene, lod, selectedIds, focusedId, depictions, onLayerCommit, worldRef } = props;
  // `useId` is stable per drawing and unique per page; its colons are not valid in `url(#…)` references.
  const prefix = `orn${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const ids = useMemo(() => defIds(prefix), [prefix]);
  const { onSceneClick, onSceneDoubleClick } = props;
  const click = onSceneClick === undefined ? undefined : (event: MouseEvent): void => onSceneClick(hitOf(event.target));
  const doubleClick = onSceneDoubleClick === undefined ? undefined : (event: MouseEvent): void => onSceneDoubleClick(hitOf(event.target));
  // hover: the arrow under the pointer, reported when it changes; ignored while a button is held (a drag pans)
  const hovered = useRef<string | null>(null);
  const { onSceneHover } = props;
  const report = (id: string | null): void => {
    if (hovered.current === id) return;
    hovered.current = id;
    onSceneHover?.(id === null ? null : { kind: 'edge', id });
  };
  const move = onSceneHover === undefined ? undefined : (event: PointerEvent): void => {
    if (event.buttons !== 0) return report(null);
    const hit = hitOf(event.target);
    report(hit !== null && hit.kind === 'edge' ? hit.id : null);
  };
  const leave = onSceneHover === undefined ? undefined : (): void => report(null);
  const { keyboard } = props;
  return (
    <svg ref={props.svgRef} onClick={click} onPointerMove={move} onPointerLeave={leave} onDoubleClick={doubleClick} className={props.interactive === true ? `${styles.root} ${styles.interactive}` : styles.root} role="group" aria-label={props.ariaLabel} {...(keyboard === undefined ? {} : { tabIndex: 0, onKeyDown: keyboard.onKeyDown, onFocus: keyboard.onFocus, onBlur: keyboard.onBlur, ...(keyboard.activeId === undefined ? {} : { 'aria-activedescendant': ids.node(keyboard.activeId) }) })} data-lod={lod} data-scene-width={scene.bounds.width} data-scene-height={scene.bounds.height} xmlns="http://www.w3.org/2000/svg">
      <SceneDefs scene={scene} ids={ids} />
      <g ref={worldRef} data-world="true">
        <EdgesLayer scene={scene} lod={lod} ids={ids} {...(onLayerCommit === undefined ? {} : { onCommit: onLayerCommit })} />
        <NodesLayer scene={scene} lod={lod} depictions={depictions} ids={ids} {...(onLayerCommit === undefined ? {} : { onCommit: onLayerCommit })} />
        <LabelsLayer scene={scene} lod={lod} depictions={depictions} ids={ids} {...(onLayerCommit === undefined ? {} : { onCommit: onLayerCommit })} />
        <BadgesLayer scene={scene} lod={lod} {...(onLayerCommit === undefined ? {} : { onCommit: onLayerCommit })} />
        <OverlayLayer scene={scene} lod={lod} ids={ids} selectedIds={selectedIds} focusedId={focusedId} hoveredId={props.hoveredId} {...(onLayerCommit === undefined ? {} : { onCommit: onLayerCommit })} />
      </g>
    </svg>
  );
}
