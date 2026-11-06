/**
 * The Key popover (step 8.3b, A3; a lazy chunk): every legend row of the map (group colours, "n within the family", "Not in a family yet" with its
 * count and Show / Hide, and the marks of the drawn arrows) in a panel under the toolbar's Key button. Esc, a click outside or the Key button
 * closes it and the focus goes back to the button. The words are the legend's own (`NavigatorLegend`).
 */
import { useEffect, useRef } from 'react';
import type { LegendItem, LegendKey } from './legend';
import { NavigatorLegend } from './navigator-legend';
import styles from './map-room.module.css';

export interface KeyPopoverProps {
  readonly items: readonly LegendItem[];
  readonly keys: LegendKey;
  readonly outsideNote?: string;
  readonly onToggleUnclassified?: () => void;
  readonly onSeeCompounds?: () => void;
  readonly onClose: () => void;
}

export function KeyPopover(props: KeyPopoverProps) {
  const box = useRef<HTMLDivElement>(null);
  const { onClose } = props;
  useEffect(() => {
    const keyButton = (): HTMLElement | null => box.current?.parentElement?.querySelector<HTMLElement>('[data-key-button]') ?? null;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
      keyButton()?.focus();
    };
    const onPointer = (event: PointerEvent): void => {
      const wrap = box.current?.parentElement;
      if (wrap !== null && wrap !== undefined && event.target instanceof Node && wrap.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose]);
  return (
    <div ref={box} className={styles.popover} role="dialog" aria-label="Key" data-map-key="">
      <NavigatorLegend items={props.items} keys={props.keys} {...(props.outsideNote === undefined ? {} : { outsideNote: props.outsideNote })} {...(props.onToggleUnclassified === undefined ? {} : { onToggleUnclassified: props.onToggleUnclassified })} {...(props.onSeeCompounds === undefined ? {} : { onSeeCompounds: props.onSeeCompounds })} />
    </div>
  );
}
