// @vitest-environment jsdom
/**
 * The fields of a reaction that no editor could set (step 6.9b, Gate D round 1, G1) over the real store, session manager and record picker:
 * an outcome's label and concepts, a variant's note, solvent character and the participants present only under it, a participant's note and
 * original wording, a stage's original wording. Each is shown with the demo's value, edited and saved into the draft, and ABSENT when emptied.
 */
import { utcTime } from '@/test-support/editing-kit';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRecordPicker } from '@/app/window/record-picker-port';
import { indexEngine } from '@/core/indexes';
import type { Reaction } from '@/core/schema';
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

const ETHANOL = 'rxn_ethanol-conc-h2so4';
const ALDOL = 'rxn_ethanal-aldol';
const HBR = 'rxn_propene-hbr';
const ACYLATION = 'rxn_benzene-friedel-crafts-acylation';
const HYDRATION = 'rxn_ethene-hydration';
const DICHROMATE = 'rxn_ethanol-to-ethanal-dichromate';
const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};

function pickerFor(rig: EditorRig) {
  const state = () => rig.store.getState();
  return createRecordPicker({
    search: (async (_channel: string, request: { text: string; kinds: readonly string[] }) => ({
      ok: true,
      value: request.kinds.flatMap((kind) =>
        Object.values((state().records as unknown as Record<string, Record<string, { id: string; names?: { canonical: string }; name?: string }>>)[kind] ?? {})
          .filter((r) => (r.names?.canonical ?? r.name ?? '').toLowerCase().includes(request.text.toLowerCase()))
          .map((r) => ({ ref: { kind, id: r.id } })),
      ),
    })) as never,
    state,
    indexes: () => indexEngine.build(state()),
    activeExam: () => null,
  });
}
function show(target: string) {
  const rig = editorRig();
  const opened = rig.drafts.open({ kind: 'reaction', id: target });
  if (!opened.ok) throw new Error(opened.message);
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet, records: pickerFor(rig) }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id };
}
const draftOf = (rig: EditorRig, id: string): Reaction => rig.drafts.entry(id)?.session.draft as Reaction;
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const has = (record: object, key: string): boolean => key in record;

describe('an outcome label', () => {
  it('is shown, edited, saved and absent when emptied; the summary line stays as it was', () => {
    const { rig, id } = show(ETHANOL);
    const before = screen.getAllByTestId('outcome-summary').map((e) => e.textContent);
    const first = must(draftOf(rig, id).outcomes[0]);
    click('Edit outcome 1');
    expect((screen.getByLabelText('Label of outcome 1') as HTMLInputElement).value).toBe(first.label);
    change('Label of outcome 1', 'Ether, new wording');
    expect(must(draftOf(rig, id).outcomes[0]).label).toBe('Ether, new wording');
    change('Label of outcome 1', '');
    expect(has(must(draftOf(rig, id).outcomes[0]), 'label')).toBe(false);
    expect(screen.getAllByTestId('outcome-summary').map((e) => e.textContent)).toEqual(before);
  });
  it('a new outcome has no label (no default)', () => {
    const { rig, id } = show(HBR);
    click('Add outcome');
    const added = must(draftOf(rig, id).outcomes.at(-1));
    expect(has(added, 'label')).toBe(false);
    expect((screen.getByLabelText(`Label of outcome ${draftOf(rig, id).outcomes.length}`) as HTMLInputElement).value).toBe('');
  });
});

describe('the concepts of an outcome', () => {
  it('are listed, removed, found by name and added; an emptied list stays a (required) empty array', async () => {
    const { rig, id } = show(HBR);
    const withConcept = draftOf(rig, id).outcomes.findIndex((o) => o.conceptIds.length > 0);
    expect(withConcept).toBeGreaterThanOrEqual(0);
    const n = withConcept + 1;
    click(`Edit outcome ${n}`);
    const list = screen.getByRole('list', { name: `Concepts of outcome ${n}` });
    const kept = must(draftOf(rig, id).outcomes[withConcept]).conceptIds;
    expect(within(list).getAllByRole('listitem')).toHaveLength(kept.length);
    fireEvent.click(within(list).getAllByRole('button', { name: /^Remove / })[0] as HTMLElement);
    expect(must(draftOf(rig, id).outcomes[withConcept]).conceptIds).toEqual([]);
    change(`Find a concept for outcome ${n} by name`, 'Addition');
    const found = await screen.findByRole('list', { name: 'Concepts found' });
    fireEvent.click(await waitFor(() => found.querySelector('button[aria-label^="Add "]') as HTMLElement));
    expect(must(draftOf(rig, id).outcomes[withConcept]).conceptIds).toHaveLength(1);
  });
  it('the other outcome of the reaction is not changed', async () => {
    const { rig, id } = show(HBR);
    const before = must(draftOf(rig, id).outcomes[1]).conceptIds;
    click('Edit outcome 1');
    change('Find a concept for outcome 1 by name', 'Addition');
    const found = await screen.findByRole('list', { name: 'Concepts found' });
    fireEvent.click(await waitFor(() => found.querySelector('button[aria-label^="Add "]') as HTMLElement));
    expect(must(draftOf(rig, id).outcomes[1]).conceptIds).toEqual(before);
  });
});

describe('the note of a condition variant', () => {
  it('is shown, edited, saved and absent when emptied', () => {
    const { rig, id } = show(ETHANOL);
    click('Edit variant 1');
    const field = screen.getByLabelText('Note of variant 1') as HTMLTextAreaElement;
    expect(field.value).toBe(must(draftOf(rig, id).conditionVariants[0]).note);
    change('Note of variant 1', 'Two **ethanol** molecules lose one water.');
    expect(must(draftOf(rig, id).conditionVariants[0]).note).toBe('Two **ethanol** molecules lose one water.');
    expect(screen.getByRole('region', { name: 'Preview of Note of variant 1' })).toBeTruthy();
    change('Note of variant 1', '');
    expect(has(must(draftOf(rig, id).conditionVariants[0]), 'note')).toBe(false);
  });
});

describe('the solvent character of a condition variant', () => {
  it('is offered in "Add a field to override"; its control is the stage control; an emptied list stays an array', () => {
    const { rig, id } = show(ETHANOL);
    click('Edit variant 1');
    const offered = Array.from((screen.getByLabelText('Add a field to override') as HTMLSelectElement).options).map((o) => o.textContent);
    expect(offered).toContain('Solvent character');
    change('Add a field to override', 'solventCharacter');
    fireEvent.click(screen.getByLabelText('Solvent character: polar protic (variant 1)'));
    expect(must(draftOf(rig, id).conditionVariants[0]).parameters.solventCharacter).toEqual(['polar_protic']);
    expect(screen.getByText(/A variant's solvent character does not reach the arrow/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Solvent character: polar protic (variant 1)'));
    expect(must(draftOf(rig, id).conditionVariants[0]).parameters.solventCharacter).toEqual([]);
  });
  it('a stored value is shown with its words checked', () => {
    show(ALDOL);
    click('Edit variant 1');
    expect((screen.getByLabelText('Solvent character: aqueous (variant 1)') as HTMLInputElement).checked).toBe(true);
  });
});

describe('the participants present only under a variant', () => {
  it('the demo variant lists its participant: checked in the list, named in the summary line', () => {
    const { rig, id } = show(ALDOL);
    const listed = must(draftOf(rig, id).conditionVariants[0]).participantIds;
    expect(listed).toHaveLength(1);
    expect(screen.getAllByTestId('variant-summary')[0]?.textContent).toMatch(/ · only with .*Sodium hydroxide/);
    click('Edit variant 1');
    const group = screen.getByRole('group', { name: 'Present only under variant 1' });
    const boxes = within(group).getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.filter((b) => b.checked)).toHaveLength(1);
  });
  it('ticking a participant lists it, unticking removes it; nothing else changes', () => {
    const { rig, id } = show(ALDOL);
    const participants = draftOf(rig, id).participants;
    const before = JSON.stringify(draftOf(rig, id).stages);
    click('Edit variant 1');
    const target = must(participants[0]);
    fireEvent.click(screen.getByLabelText('Participant 1: only under variant 1'));
    expect(must(draftOf(rig, id).conditionVariants[0]).participantIds).toContain(target.id);
    fireEvent.click(screen.getByLabelText('Participant 1: only under variant 1'));
    expect(must(draftOf(rig, id).conditionVariants[0]).participantIds).not.toContain(target.id);
    expect(JSON.stringify(draftOf(rig, id).stages)).toBe(before);
  });
  it('a participant added in the variant gets the chosen role, is listed in the variant and is a participant of the reaction', async () => {
    const { rig, id } = show(ALDOL);
    const count = draftOf(rig, id).participants.length;
    click('Edit variant 1');
    change('Add it as, variant 1', 'catalyst');
    change('Find a substance for variant 1 by name', 'water');
    const found = await screen.findByRole('list', { name: 'Substances found' });
    fireEvent.click(await waitFor(() => found.querySelector('button[aria-label^="Add "]') as HTMLElement));
    const reaction = draftOf(rig, id);
    expect(reaction.participants).toHaveLength(count + 1);
    const added = must(reaction.participants.at(-1));
    expect(added.role).toBe('catalyst');
    expect(must(reaction.conditionVariants[0]).participantIds).toContain(added.id);
    expect(reaction.conditionVariants[1]?.participantIds).not.toContain(added.id);
  });
  it('a variant that lists none says so in its summary line without "only with"', () => {
    show(ETHANOL);
    expect(screen.getAllByTestId('variant-summary')[0]?.textContent).not.toContain('only with');
  });
});

describe('the note and the original wording of a participant', () => {
  it('the note is shown, edited, saved and absent when emptied', () => {
    const { rig, id } = show(ACYLATION);
    const at = draftOf(rig, id).participants.findIndex((p) => p.note !== undefined);
    expect(at).toBeGreaterThanOrEqual(0);
    click(`Edit participant ${at + 1}`);
    expect((screen.getByLabelText(`Note of participant ${at + 1}`) as HTMLTextAreaElement).value).toBe(must(draftOf(rig, id).participants[at]).note);
    change(`Note of participant ${at + 1}`, 'It is *used up*.');
    expect(must(draftOf(rig, id).participants[at]).note).toBe('It is *used up*.');
    change(`Note of participant ${at + 1}`, '');
    expect(has(must(draftOf(rig, id).participants[at]), 'note')).toBe(false);
  });
  it('the original wording is a one-line field: shown, edited, saved and absent when emptied', () => {
    const { rig, id } = show(HYDRATION);
    const at = draftOf(rig, id).participants.findIndex((p) => p.originalText !== undefined);
    expect(at).toBeGreaterThanOrEqual(0);
    click(`Edit participant ${at + 1}`);
    const field = screen.getByLabelText(`Written in the source as, participant ${at + 1}`) as HTMLInputElement;
    expect(field.tagName).toBe('INPUT');
    expect(field.value).toBe(must(draftOf(rig, id).participants[at]).originalText);
    change(`Written in the source as, participant ${at + 1}`, 'alc. KOH');
    expect(must(draftOf(rig, id).participants[at]).originalText).toBe('alc. KOH');
    change(`Written in the source as, participant ${at + 1}`, '');
    expect(has(must(draftOf(rig, id).participants[at]), 'originalText')).toBe(false);
  });
  it('a participant with neither starts with both fields empty (no default)', () => {
    const { rig, id } = show(ETHANOL);
    click('Edit participant 1');
    expect((screen.getByLabelText('Written in the source as, participant 1') as HTMLInputElement).value).toBe(must(draftOf(rig, id).participants[0]).originalText ?? '');
    expect((screen.getByLabelText('Note of participant 1') as HTMLTextAreaElement).value).toBe(must(draftOf(rig, id).participants[0]).note ?? '');
  });
});

describe('the original wording of a stage', () => {
  it('is shown, edited, saved and absent when emptied', () => {
    const { rig, id } = show(DICHROMATE);
    const at = draftOf(rig, id).stages.findIndex((s) => s.originalText !== undefined);
    expect(at).toBeGreaterThanOrEqual(0);
    const label = `Written in the source as, stage ${at + 1}`;
    expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(must(draftOf(rig, id).stages[at]).originalText);
    change(label, '1. K2Cr2O7, dil. H2SO4, heat');
    expect(must(draftOf(rig, id).stages[at]).originalText).toBe('1. K2Cr2O7, dil. H2SO4, heat');
    change(label, '');
    expect(has(must(draftOf(rig, id).stages[at]), 'originalText')).toBe(false);
  });
});
