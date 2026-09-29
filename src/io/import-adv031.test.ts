/**
 * ADV-031 (docs/TEST_STRATEGY.md): a wrong ID prefix or a wrong-kind reference in an import is caught — at L1 (the record is
 * quarantined with issues). Measured in step 3.7: both variants are caught at L1, so there is no separate L2 half; the records
 * that referenced the quarantined one show up as dangling references on the merged replica (ADV-030).
 */
import { describe, expect, it } from 'vitest';
import { migrationRunner } from '@/core/migrations';
import { emptyRecordTables, type CanonicalState } from '@/core/schema';
import { makeStore } from '@/test-support/command-kit';
import { exportBytes, testSession } from '@/test-support/import-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import { parseImportSource } from './import-source';

const base = loadFixtureState('maximal-valid');
const empty: CanonicalState = { meta: base.meta, records: emptyRecordTables() };

type Doc = { records: Record<string, Record<string, unknown>[]> };

async function tamperedParse(edit: (doc: Doc) => void) {
  const doc = JSON.parse(new TextDecoder().decode(await exportBytes(base))) as Doc;
  edit(doc);
  const outcome = await parseImportSource({ fileName: 'x.orn.json', bytes: new Blob([JSON.stringify(doc)]) }, { runner: migrationRunner });
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.result;
}

const firstReactionWithSpeciesParticipant = (doc: Doc) => {
  const reaction = doc.records['reaction']?.find((r) => (r as { participants: { ref: { kind: string } }[] }).participants.some((p) => p.ref.kind === 'species'));
  const participant = (reaction as { participants: { ref: { kind: string; id: string } }[] }).participants.find((p) => p.ref.kind === 'species');
  if (reaction === undefined || participant === undefined) throw new Error('fixture has no species participant');
  return { reaction: reaction as { id: string }, ref: participant.ref };
};

describe('ADV-031: wrong ID prefix / wrong-kind reference', () => {
  it('a reference keeping its kind but carrying another kind\'s ID prefix is quarantined at L1 with issues; the rest still previews', async () => {
    const conceptId = Object.keys(base.records.concept)[0] as string;
    let brokenId = '';
    const parsed = await tamperedParse((doc) => {
      const { reaction, ref } = firstReactionWithSpeciesParticipant(doc);
      brokenId = reaction.id;
      ref.id = conceptId; // kind stays 'species'
    });
    expect(parsed.quarantined.some((q) => q.claimedId === brokenId && q.issues.length > 0)).toBe(true);
    const { session } = testSession(makeStore(empty));
    const outcome = session.preview({ parsed, fileName: 'x' });
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.plan.preview.quarantined.some((q) => q.claimedId === brokenId)).toBe(true);
  });

  it('a well-formed reference whose kind the field does not accept (species → concept) is also caught at L1 — there is no separate L2 half; nothing reaches the merged replica', async () => {
    const conceptId = Object.keys(base.records.concept)[0] as string;
    let brokenId = '';
    const parsed = await tamperedParse((doc) => {
      const { reaction, ref } = firstReactionWithSpeciesParticipant(doc);
      brokenId = reaction.id;
      ref.kind = 'concept';
      ref.id = conceptId;
    });
    expect(parsed.quarantined.some((q) => q.claimedId === brokenId && q.issues.length > 0)).toBe(true);
    expect((parsed.records.reaction ?? []).some((r) => r.id === brokenId)).toBe(false);
    const { session } = testSession(makeStore(empty));
    const outcome = session.preview({ parsed, fileName: 'x' });
    if (!outcome.ok) throw new Error(outcome.message);
    expect((outcome.plan.preview.counts.reaction?.incoming ?? 0)).toBe((parsed.counts.reaction ?? 0));
    // Records that pointed at the quarantined one are then dangling: that is ADV-030's L2 path (import-session.test.ts).
  });
});
