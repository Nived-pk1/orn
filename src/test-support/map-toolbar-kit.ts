/** Helpers for tests of the map toolbar (step 8.3b, A1): one row, with a More menu; the selection is a hidden live region. */
import { fireEvent, screen } from '@testing-library/react';

/** Opens the More menu of the map toolbar. */
export function openMore(): void {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false });
}

/** A toolbar action: its button in the row, or (the row is narrow, or the action always lives there) its item in More. */
export async function toolbarAction(name: string | RegExp): Promise<HTMLElement> {
  const inRow = screen.queryByRole('button', { name });
  if (inRow !== null) return inRow;
  const open = screen.queryByRole('menuitem', { name }); // the menu may be open already: opening it again would close it
  if (open !== null) return open;
  openMore();
  return screen.findByRole('menuitem', { name });
}

/** The words of the map's selection (the visually hidden live region). */
export function selectionLine(): string {
  return document.querySelector('[data-selection-line]')?.textContent ?? '';
}

/** Opens the Key popover (the legend) of the map toolbar and returns it. */
export async function openKey(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Key' }));
  return screen.findByRole('dialog', { name: 'Key' });
}
