/**
 * Rich-text link rewriting for `import_as_copy` (docs/IMPLEMENTATION_PLAN.md Phase 3 note 2, step 3.7): `[[id]]` links in a
 * record's rich-text fields that point at IDs being remapped get the new ID; links to anything else are left untouched.
 * Driven by the registry of rich-text locations (RICH_TEXT_PATHS), never by a kind- or field-specific branch, and pure: the
 * input record is not mutated (an unaffected record is returned as is).
 */
import { RICH_TEXT_PATHS, type AnyRecord } from '../schema';
import { rewriteRichTextLinks as rewriteLinksInText } from '../text/richtext';
import { applyEdits, matchPath, parsePath, type Edit, type PathSegment } from './paths';

const SEGMENTS = new Map<string, readonly PathSegment[]>();

function segmentsOf(path: string): readonly PathSegment[] {
  let segments = SEGMENTS.get(path);
  if (segments === undefined) {
    segments = parsePath(path);
    SEGMENTS.set(path, segments);
  }
  return segments;
}

export interface RichTextLinkRewrite {
  readonly record: AnyRecord;
  /** How many `[[id]]` links were changed, across every rich-text field of the record. */
  readonly rewritten: number;
}

export function rewriteRecordRichTextLinks(record: AnyRecord, idMap: ReadonlyMap<string, string>): RichTextLinkRewrite {
  if (idMap.size === 0) return { record, rewritten: 0 };
  const edits: Edit[] = [];
  let rewritten = 0;
  for (const path of RICH_TEXT_PATHS[record.kind]) {
    for (const match of matchPath(record, segmentsOf(path))) {
      if (typeof match.value !== 'string') continue;
      const result = rewriteLinksInText(match.value, (id) => idMap.get(id));
      if (result.rewritten === 0) continue;
      rewritten += result.rewritten;
      edits.push({ tokens: match.tokens, value: result.text });
    }
  }
  return { record: applyEdits(record, edits), rewritten };
}
