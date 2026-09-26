/**
 * Rich-text `[[record links]]` of a record (soft references, never blocking a delete). Locations come
 * from the RICH_TEXT_PATHS registry; nothing here names a field or a record kind.
 */
import { RICH_TEXT_PATHS, type AnyRecord } from '../schema';
import { matchPath, parsePath } from '../references';
import { richTextLinks } from '../text';

/** Distinct IDs linked from any rich-text field of the record, in first-seen order. */
export function linkedIdsOf(record: AnyRecord): readonly string[] {
  const found = new Set<string>();
  for (const spec of RICH_TEXT_PATHS[record.kind]) {
    for (const match of matchPath(record, parsePath(spec))) {
      if (typeof match.value !== 'string' || !match.value.includes('[[')) continue;
      for (const link of richTextLinks(match.value)) found.add(link.id);
    }
  }
  return [...found];
}
