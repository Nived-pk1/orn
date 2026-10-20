// @vitest-environment jsdom
/**
 * The reaction editor's Stages section (step 6.3a part 4, decisions D3, 4 and 5) over the real store and session manager: the FIRST stage
 * takes every participant and says so; reorder is an exact permutation; a stage only participants use asks where they go; a stage a condition
 * variant or an intermediate names is refused in words.
 */
import { utcTime } from '@/test-support/editing-kit';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CanonicalState, Reaction } from '@/core/schema';
import { PHONE_QUERIES } from '@/ui/hooks';
import { demoState } from '@/test-support/app-boot-kit';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { must } from '@/test-support/state-fixture';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort } from './check-contracts';
import { EditorHost } from './editor-host';

beforeAll(stubDialog);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};
const PCC = 'rxn_ethanol-to-ethanal-pcc';
const GRIGNARD = 'rxn_methylmgbr-ethanal';

const withReaction = (id: string, change: (r: Reaction) => Reaction): CanonicalState => {
  const state = demoState();
  return { ...state, records: { ...state.records, reaction: { ...state.records.reaction, [id]: change(state.records.reaction[id as never] as Reaction) } } } as unknown as CanonicalState;
};
function show(target: string, state?: CanonicalState) {
  const rig = editorRig(state === undefined ? {} : { state });
  const opened = rig.drafts.open({ kind: 'reaction', id: target });
  if (!opened.ok) throw new Error(opened.message);
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id, dialog: screen.getByRole('dialog') };
}
const draftOf = (rig: EditorRig, id: string): Reaction => rig.drafts.entry(id)?.session.draft as Reaction;
const stageRow = (n: number): HTMLElement => screen.getAllByTestId('stage-row')[n - 1] as HTMLElement;
const bare = (id = PCC): CanonicalState => withReaction(id, (r) => ({ ...r, stages: [] }) as Reaction);

describe('the Stages section', () => {
  it('a reaction with no stages says so; adding the FIRST takes every participant and says so in words', () => {
    const { rig, id } = show(PCC, bare());
    expect(screen.getByText(/No stages: every participant is common/)).toBeTruthy();
    const count = draftOf(rig, id).participants.length;
    fireEvent.click(screen.getByRole('button', { name: 'Add stage' }));
    expect(draftOf(rig, id).stages).toHaveLength(1);
    expect(draftOf(rig, id).stages[0]?.participantIds).toEqual(draftOf(rig, id).participants.map((p) => p.id));
    expect(screen.getByText(`All ${count} participants are now in stage 1.`)).toBeTruthy();
    // the participant rows now show their stage (a row shows its fields once it is opened with Edit; step 6.3b)
    fireEvent.click(screen.getByRole('button', { name: 'Edit participant 1' }));
    expect(screen.getByLabelText('Stage of participant 1')).toBeTruthy();
  });

  it('the second stage starts empty and says so; its kind comes from the chooser', () => {
    const { rig, id } = show(GRIGNARD);
    const before = draftOf(rig, id).stages.length;
    fireEvent.change(screen.getByLabelText('Add a stage of kind'), { target: { value: 'purification' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add stage' }));
    const next = draftOf(rig, id);
    expect(next.stages).toHaveLength(before + 1);
    expect(next.stages.at(-1)).toMatchObject({ kind: 'purification', participantIds: [] });
    expect(screen.getByText(new RegExp(`Stage ${before + 1} was added; it has no participants yet`))).toBeTruthy();
    expect(within(stageRow(before + 1)).getByText('No participants in this stage.')).toBeTruthy();
  });

  it('label and kind are edited; an empty label removes the field; the conditions are read-only', () => {
    const { rig, id } = show(GRIGNARD);
    fireEvent.change(screen.getByLabelText('Label of stage 1'), { target: { value: 'Grignard addition' } });
    fireEvent.change(screen.getByLabelText('Kind of stage 2'), { target: { value: 'quench' } });
    expect(draftOf(rig, id).stages[0]?.label).toBe('Grignard addition');
    expect(draftOf(rig, id).stages[1]?.kind).toBe('quench');
    fireEvent.change(screen.getByLabelText('Label of stage 1'), { target: { value: '' } });
    expect(Object.hasOwn(must(draftOf(rig, id).stages[0]), 'label')).toBe(false);
    expect(within(stageRow(1)).getByText(/Editing arrives in step 6\.4/)).toBeTruthy();
  });

  it('Up and Down reorder the stages as an exact permutation, and back; each stage keeps its participants', () => {
    const { rig, id } = show(GRIGNARD);
    const before = draftOf(rig, id).stages;
    fireEvent.click(screen.getByRole('button', { name: 'Move stage 1 down' }));
    const swapped = draftOf(rig, id).stages;
    expect(swapped.map((s) => s.id)).toEqual([must(before[1]).id, must(before[0]).id]);
    expect(swapped[1]?.participantIds).toEqual(before[0]?.participantIds);
    fireEvent.click(screen.getByRole('button', { name: 'Move stage 1 up' }).getAttribute('aria-disabled') === 'true' ? screen.getByRole('button', { name: 'Move stage 2 up' }) : screen.getByRole('button', { name: 'Move stage 1 up' }));
    expect(draftOf(rig, id).stages).toEqual(before);
    expect(screen.getByRole('button', { name: 'Move stage 1 up' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('removing a stage only participants use ASKS where they go; Cancel changes nothing; Move and remove keeps every participant in exactly one stage', () => {
    const { rig, id } = show(GRIGNARD);
    const before = draftOf(rig, id);
    const moved = must(before.stages[1]).participantIds;
    expect(moved.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Remove stage 2' }));
    const ask = screen.getByRole('group', { name: 'Remove stage 2?' });
    expect(within(ask).getByText(/Stage 2 has \d+ participants?\. Move them to/)).toBeTruthy();
    expect(draftOf(rig, id).stages).toHaveLength(2);
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Remove stage 2?' })).toBeNull();
    expect(draftOf(rig, id).stages).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove stage 2' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Remove stage 2?' })).getByRole('button', { name: 'Move them and remove the stage' }));
    const after = draftOf(rig, id);
    expect(after.stages).toHaveLength(1);
    expect([...(after.stages[0]?.participantIds ?? [])].sort()).toEqual(after.participants.map((p) => p.id).sort());
    expect(screen.getByText(/Stage 2 was removed; its participants moved to stage 1\./)).toBeTruthy();
  });

  it('an EMPTY stage is removed at once; the ONLY stage asks and leaves its participants in no stage', () => {
    const { rig, id } = show(PCC, bare());
    fireEvent.click(screen.getByRole('button', { name: 'Add stage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add stage' }));
    expect(draftOf(rig, id).stages).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove stage 2' })); // empty: no question
    expect(draftOf(rig, id).stages).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove stage 1' }));
    const ask = screen.getByRole('group', { name: 'Remove stage 1?' });
    expect(within(ask).getByText(/It is the only stage: its \d+ participants? will be in no stage/)).toBeTruthy();
    fireEvent.click(within(ask).getByRole('button', { name: 'Remove the stage' }));
    expect(draftOf(rig, id).stages).toEqual([]);
    expect(draftOf(rig, id).participants.length).toBeGreaterThan(0);
  });

  it("a stage a condition variant names is REFUSED in words, not detached; so is one an intermediate names", () => {
    const stageId = (state: CanonicalState): string => must((state.records.reaction[GRIGNARD as never] as Reaction).stages[1]).id;
    const variantState = withReaction(GRIGNARD, (r) => ({ ...r, conditionVariants: [{ id: 'cvr_x', label: '443 K', stageId: must(r.stages[1]).id, parameters: { solventCharacter: [], activation: [], other: [], parsedFields: [] }, participantIds: [] }] }) as unknown as Reaction);
    expect(stageId(variantState)).toBeTruthy();
    const { rig, id } = show(GRIGNARD, variantState);
    const button = screen.getByRole('button', { name: 'Remove stage 2' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(within(stageRow(2)).getAllByText("Stage 2 is used by the condition '443 K'; change that in step 6.4's editor first.").length).toBeGreaterThan(0);
    fireEvent.click(button);
    expect(draftOf(rig, id).stages).toHaveLength(2);
    cleanup();
    const interState = withReaction(GRIGNARD, (r) => ({ ...r, intermediates: [{ id: 'int_x', intermediateKind: 'carbanion', label: 'Alkoxide', stageId: must(r.stages[1]).id }] }) as unknown as Reaction);
    show(GRIGNARD, interState);
    expect(within(stageRow(2)).getAllByText("Stage 2 is used by the Alkoxide; change that in step 6.4's editor first.").length).toBeGreaterThan(0);
  });

  it('on a phone each stage is ONE stacked card', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    show(GRIGNARD);
    for (const card of screen.getAllByTestId('stage-row')) expect(card.className).toContain('participantPhone');
  });
});
