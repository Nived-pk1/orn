// @vitest-environment jsdom
/**
 * The mechanism links of the reaction editor (step 6.5a part 5, D5) over the real store, session manager and record picker, on the demo's PCC
 * oxidation (no mechanism) and its aldol reaction (one mechanism, two outcomes that name its two variants): link and unlink a mechanism through
 * the picker, an unlink refused in words while an outcome names the mechanism, and each outcome's mechanism and variant choice.
 */
import { utcTime } from '@/test-support/editing-kit';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMechanismLinks } from '@/app/window/mechanism-links-port';
import { createRecordPicker } from '@/app/window/record-picker-port';
import { indexEngine } from '@/core/indexes';
import type { Reaction } from '@/core/schema';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort } from './check-contracts';
import { EditorHost } from './editor-host';

beforeAll(stubDialog);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PCC = 'rxn_ethanol-to-ethanal-pcc';
const ALDOL = 'rxn_ethanal-aldol';
const E2_MECH = 'mec_e2-haloalkane';
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
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet, records: pickerFor(rig), links: createMechanismLinks(rig.store.getState) }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id };
}
const draftOf = (rig: EditorRig, id: string): Reaction => rig.drafts.entry(id)?.session.draft as Reaction;
const editOutcome = (n: number) => fireEvent.click(screen.getByRole('button', { name: `Edit outcome ${n}` }));
const isOff = (el: HTMLElement): boolean => el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled;
const values = (label: string): string[] => within(screen.getByLabelText(label)).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);

describe('the Mechanism links section', () => {
  it('lists the linked mechanisms by name; a reaction with none says so', () => {
    show(PCC);
    const section = within(screen.getByRole('region', { name: 'Mechanism links' }));
    expect(section.getByText('No mechanism is linked to this reaction.')).toBeTruthy();
    cleanup();
    show(ALDOL);
    expect(within(screen.getByRole('list', { name: 'Linked mechanisms' })).getByText(/Aldol addition of ethanal/)).toBeTruthy();
  });

  it('links a mechanism found by name, and unlinks it (no outcome names it)', async () => {
    const { rig, id } = show(PCC);
    fireEvent.change(screen.getByLabelText('Find the mechanism by name'), { target: { value: 'e2' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add E2 elimination of a haloalkane' }));
    expect(draftOf(rig, id).mechanismIds).toEqual([E2_MECH]);
    expect(within(screen.getByRole('list', { name: 'Linked mechanisms' })).getByText(/E2 elimination of a haloalkane/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove link to E2 elimination of a haloalkane' }));
    expect(draftOf(rig, id).mechanismIds).toEqual([]);
  });

  it('a mechanism an outcome names cannot be unlinked, and the words say which outcomes', () => {
    show(ALDOL);
    const unlink = screen.getByRole('button', { name: 'Remove link to Aldol addition of ethanal' });
    expect(isOff(unlink)).toBe(true);
    expect(screen.getAllByText('Outcomes 1 and 2 use this mechanism; change those links first').length).toBeGreaterThan(0);
  });
});

describe('the outcome mechanism and variant', () => {
  it('shows the link of an outcome and offers the reaction mechanisms, "none" and "link another"; the variants of the chosen mechanism', () => {
    show(ALDOL);
    editOutcome(1);
    expect((screen.getByLabelText('Mechanism of outcome 1') as HTMLSelectElement).value).toBe('mec_aldol-ethanal');
    expect(values('Mechanism of outcome 1')).toEqual(['', 'mec_aldol-ethanal', '__other']);
    expect((screen.getByLabelText('Variant of outcome 1') as HTMLSelectElement).value).toBe('mvr_aldol-base');
    expect(values('Variant of outcome 1')).toEqual(['', 'mvr_aldol-base', 'mvr_aldol-acid']);
  });

  it('changes the variant; "none" removes the outcome link and the reaction keeps its link', () => {
    const { rig, id } = show(ALDOL);
    editOutcome(1);
    fireEvent.change(screen.getByLabelText('Variant of outcome 1'), { target: { value: 'mvr_aldol-acid' } });
    expect(draftOf(rig, id).outcomes[0]?.mechanism).toEqual({ mechanismId: 'mec_aldol-ethanal', variantId: 'mvr_aldol-acid' });
    fireEvent.change(screen.getByLabelText('Mechanism of outcome 1'), { target: { value: '' } });
    expect(draftOf(rig, id).outcomes[0]?.mechanism).toBeUndefined();
    expect(draftOf(rig, id).mechanismIds).toEqual(['mec_aldol-ethanal']);
    expect((screen.getByLabelText('Variant of outcome 1') as HTMLSelectElement).disabled).toBe(true);
  });

  it('"Link another mechanism to the reaction" finds one by name, links it to the reaction and to the outcome in ONE edit, then a variant is chosen', async () => {
    const { rig, id } = show(PCC);
    editOutcome(1);
    expect(values('Mechanism of outcome 1')).toEqual(['', '__other']);
    fireEvent.change(screen.getByLabelText('Mechanism of outcome 1'), { target: { value: '__other' } });
    fireEvent.change(screen.getByLabelText('Find the mechanism for outcome 1 by name'), { target: { value: 'e2' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add E2 elimination of a haloalkane' }));
    expect(draftOf(rig, id).outcomes[0]?.mechanism).toEqual({ mechanismId: E2_MECH });
    expect(draftOf(rig, id).mechanismIds).toEqual([E2_MECH]);
    expect(rig.drafts.entry(id)?.canUndo).toBe(true);
    fireEvent.change(screen.getByLabelText('Variant of outcome 1'), { target: { value: 'mvr_e2-hofmann' } });
    expect(draftOf(rig, id).outcomes[0]?.mechanism).toEqual({ mechanismId: E2_MECH, variantId: 'mvr_e2-hofmann' });
  });

  it('an outcome whose mechanism the reaction does not link still shows it, and says so', () => {
    const { rig, id } = show(ALDOL);
    rig.drafts.edit(id, (draft) => void ((draft as unknown as Reaction).mechanismIds = []));
    editOutcome(1);
    expect(within(screen.getByLabelText('Mechanism of outcome 1')).getByRole('option', { name: /Aldol addition of ethanal.*not linked to this reaction/ })).toBeTruthy();
  });
});
