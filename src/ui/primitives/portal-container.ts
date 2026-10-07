import { createContext, useContext } from 'react';

/**
 * Where menus and tooltips mount. A native modal `<dialog>` makes everything outside itself inert (CSP spike, step 5.2), so a menu
 * opened INSIDE a dialog must mount inside it: the dialog provides its own element here. `null`: the document body.
 */
export const PortalContainerContext = createContext<HTMLElement | null>(null);

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined;
}
