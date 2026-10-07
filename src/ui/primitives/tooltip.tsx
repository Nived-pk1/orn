/**
 * Tooltip: Radix Tooltip, non-modal (CSP spike, step 5.2: no violation in Chromium, Firefox or WebKit). It shows on hover and on
 * keyboard focus and Esc hides it. It is a supplement: the trigger keeps its own accessible name (a tooltip is never the only place
 * a fact is stated).
 */
import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactElement } from 'react';
import { usePortalContainer } from './portal-container';
import styles from './tooltip.module.css';

export function Tooltip(props: { readonly content: string; readonly children: ReactElement }) {
  const container = usePortalContainer();
  return (
    <RadixTooltip.Provider delayDuration={400} skipDelayDuration={200}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{props.children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal {...(container === undefined ? {} : { container })}>
          <RadixTooltip.Content className={styles.content} sideOffset={6} collisionPadding={8}>
            {props.content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
