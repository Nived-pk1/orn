/**
 * The phone map's two floating round buttons (ADR-039): Fit (the controller's fit, the floor of the names) and Legend (i), which opens
 * a sheet with the legend's own content. The toolbar row and the permanent legend are not shown on a phone.
 */
import { useState } from 'react';
import type { ViewportController } from '@/render/viewport';
import { Dialog, Icon } from '@/ui/primitives';
import type { LegendItem, LegendKey } from './legend';
import { NavigatorLegend } from './navigator-legend';
import styles from './phone-home.module.css';

export function PhoneMapControls(props: {
  readonly controller: ViewportController | null;
  readonly items: readonly LegendItem[];
  readonly keys: LegendKey;
  readonly outsideNote?: string;
  /** Studio's Select mode (step 6.8b): a tap toggles instead of selecting. Absent in Study. */
  readonly select?: { readonly on: boolean; readonly set: (on: boolean) => void };
}) {
  const [legend, setLegend] = useState(false);
  return (
    <>
      <div className={styles.floating}>
        {props.select === undefined ? null : (
          <button type="button" className={`${styles.round} ${styles.pill} ${props.select.on ? styles.on : ''}`} aria-pressed={props.select.on} onClick={() => props.select?.set(!props.select.on)}>
            Select
          </button>
        )}
        <button type="button" className={styles.round} aria-label="Fit" onClick={() => props.controller?.fit()} aria-disabled={props.controller === null ? true : undefined}>
          <Icon name="fit" size={22} />
        </button>
        <button type="button" className={styles.round} aria-label="Legend" aria-haspopup="dialog" onClick={() => setLegend(true)}>
          <Icon name="info" size={22} />
        </button>
      </div>
      <Dialog open={legend} onClose={() => setLegend(false)} title="Legend">
        <NavigatorLegend items={props.items} keys={props.keys} {...(props.outsideNote === undefined ? {} : { outsideNote: props.outsideNote })} />
      </Dialog>
    </>
  );
}
