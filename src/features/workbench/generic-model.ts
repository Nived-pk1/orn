/**
 * The edits of a class's `generic` block (step 6.2b decision D1), shared by the Generic representation section (formula text, general
 * formula, SMARTS) and the structure panel in its generic mode. An EMPTY value means the field is ABSENT, and a `generic` block that
 * holds nothing any more is removed, so a class never keeps an empty `{}`. Other fields of the block (the R-group note) are kept as they are.
 */
import type { DraftRecipe } from '@/core/editing';

type Fields = Record<string, unknown>;

export const setGenericField = (field: string, value: unknown): DraftRecipe => (draft) => {
  const existing = typeof draft.generic === 'object' && draft.generic !== null ? (draft.generic as Fields) : undefined;
  if (value === undefined) {
    if (existing === undefined) return;
    Reflect.deleteProperty(existing, field);
    if (Object.keys(existing).length === 0) Reflect.deleteProperty(draft, 'generic');
    return;
  }
  if (existing === undefined) draft.generic = { [field]: value };
  else existing[field] = value;
};

/** The text of one `generic` field, or '' when absent. */
export function genericText(draft: unknown, field: string): string {
  const generic = (draft as { generic?: unknown } | null)?.generic;
  const value = typeof generic === 'object' && generic !== null ? (generic as Fields)[field] : undefined;
  return typeof value === 'string' ? value : '';
}
