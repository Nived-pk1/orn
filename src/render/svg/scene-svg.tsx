/**
 * The static SVG renderer (step 5.4a; UI_ARCHITECTURE §6): ONE root `<svg>` and ONE world `<g>` (step 5.4b transforms it; nothing
 * here moves it) holding five memoised layers in drawing order: edges, nodes, labels, badges, overlay. A Scene and a few props in,
 * SVG out: no data access, no services, no chemistry. Selection and focus are props drawn by the overlay only.
 */
import { useId, useMemo, type MouseEvent } from 'react';
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
  return (
    <svg ref={props.svgRef} onClick={click} onDoubleClick={doubleClick} className={props.interactive === true ? `${styles.root} ${styles.interactive}` : styles.root} role="group" aria-label={props.ariaLabel} data-lod={lod} xmlns="http://www.w3.org/2000/svg">
      <SceneDefs scene={scene} ids={ids} />
      <g ref={worldRef} data-world="true">
        <EdgesLayer scene={scene} lod={lod} ids={ids} {...(onLayerCommit === undefined ? {} : { onCommit: onLayerCommit })} />
        <NodesLayer scene={scene} lod={lod} depictions={depictions} {...(onLayerCommit === undefined ? {} : { onCommit: onLayerCommit })} />
        <LabelsLayer scene={scene} lod={lod} depictions={depictions} ids={ids} {...(onLayerCommit === undefined ? {} : { onCommit: onLayerCommit })} />
        <BadgesLayer scene={scene} lod={lod} {...(onLayerCommit === undefined ? {} : { onCommit: onLayerCommit })} />
        <OverlayLayer scene={scene} lod={lod} selectedIds={selectedIds} focusedId={focusedId} {...(onLayerCommit === undefined ? {} : { onCommit: onLayerCommit })} />
      </g>
    </svg>
  );
}
