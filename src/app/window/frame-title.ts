/**
 * The breadcrumb and the tab title (step 8.4d, Part C): both say where the reader is, as the view then the record the page is about.
 * Pure: the window reads the active view and the shown record's name and passes them here.
 */
export interface Crumb {
  readonly section: string;
  readonly record?: string;
}

/** The breadcrumb for the active view: its rail label (the mode id for a view the rail does not list), then the record name when there is one. */
export function crumbOf(modes: readonly { readonly id: string; readonly label: string }[], activeMode: string, record: string | undefined): Crumb {
  const section = modes.find((mode) => mode.id === activeMode)?.label ?? activeMode;
  return record === undefined || record === '' ? { section } : { section, record };
}

/** "Alcohols · Map · ORN" with a record, "Reactions · ORN" without. */
export const documentTitleOf = (crumb: Crumb): string => [...(crumb.record === undefined || crumb.record === '' ? [] : [crumb.record]), crumb.section, 'ORN'].join(' · ');
