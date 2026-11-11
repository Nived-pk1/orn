/**
 * The phone map's two floating round buttons (ADR-039): Fit (the controller's fit, the floor of the names) and Legend (i), which opens
 * a sheet with the legend's own content. The toolbar row and the permanent legend are not shown on a phone.
 */
import { useState, type ReactNode } from 'react';
import type { ViewportController } from '@/render/viewport';
import { Dialog, Icon } from '@/ui/primitives';
import type { MapStore } from '@/ui/state/map-state';
import FullMapButton from './full-map-button';
import type { LegendItem, LegendKey } from './legend';
import { NavigatorLegend } from './navigator-legend';
import styles from './phone-home.module.css';

export function PhoneMapControls(props: {
  readonly controller: ViewportController | null;
  readonly items: readonly LegendItem[];
  readonly keys: LegendKey;
  readonly outsideNote?: string;
  /** The legend's Unclassified Show / Hide and Studio's "See those compounds" (step 8.2a). */
  readonly onToggleUnclassified?: () => void;
  readonly onSeeCompounds?: () => void;
  /** Studio's Select toggle (step 6.8b): a tap toggles instead of selecting. Absent in Study. */
  readonly extra?: ReactNode;
  /** The Select bar is shown at the bottom: the buttons move to the top so none is half covered (step 6.9, Z2). */
  readonly barShown?: boolean;
  /** The map's UI state (step 8.4e, Part D): the Full map button. */
  readonly map?: MapStore;
}) {
  const [legend, setLegend] = useState(false);
  return (
    <>
      <div className={styles.floating} data-map-control="stack" {...(props.barShown === true ? { 'data-bar': 'shown' } : {})}>
        {props.map === undefined ? null : <FullMapButton map={props.map} variant="round" />}
        {props.extra}
        <button type="button" className={styles.round} aria-label="Fit" onClick={() => props.controller?.fit()} aria-disabled={props.controller === null ? true : undefined}>
          <Icon name="scan" size={20} />
        </button>
        <button type="button" className={styles.round} aria-label="Legend" aria-haspopup="dialog" onClick={() => setLegend(true)}>
          <Icon name="info" size={20} />
        </button>
      </div>
      <Dialog open={legend} onClose={() => setLegend(false)} title="Legend">
        <NavigatorLegend items={props.items} keys={props.keys} {...(props.onToggleUnclassified === undefined ? {} : { onToggleUnclassified: props.onToggleUnclassified })} {...(props.onSeeCompounds === undefined ? {} : { onSeeCompounds: props.onSeeCompounds })} {...(props.outsideNote === undefined ? {} : { outsideNote: props.outsideNote })} />
      </Dialog>
    </>
  );
}
