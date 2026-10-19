/**
 * The first draft of a NEW record (ADR-040 addendum, step 6.2a decision D3): every required field has its empty value, so the editor can
 * show every field from the start. Species only; any other kind starts as the smallest draft (`openSession`). Pure: the ID and both times
 * come from the `CommandContext`. The empty canonical name does not pass L1, which is right: Save is refused until a name is typed.
 */
import { RECORD_ID_PREFIX, type RecordKind } from '../schema';
import type { CommandContext } from '../commands/contracts';

export function blankDraft(kind: RecordKind, ctx: CommandContext): Record<string, unknown> | undefined {
  if (kind !== 'species') return undefined;
  const now = ctx.now();
  return {
    kind: 'species',
    id: ctx.newId(RECORD_ID_PREFIX.species),
    names: { canonical: '', common: [], aliases: [] },
    speciesKind: 'unspecified',
    classIds: [],
    properties: [],
    tags: [],
    citations: [],
    provenance: { origin: 'user', createdAt: now, updatedAt: now },
    review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] },
  };
}
