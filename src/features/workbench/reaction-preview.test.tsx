// @vitest-environment jsdom
/**
 * The live preview of the reaction editor (step 6.3b decision D2) over the real store and session manager: the reaction as its card shows
 * it, built from the DRAFT, 400 ms after the last edit; the words (not a drawing) when the draft cannot be drawn yet; "No products yet" with
 * no outcome; on a phone a collapsible "Preview" section that starts closed.
 */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { indexEngine } from '@/core/indexes';
import { familyStudy, previewOfDraft, type FamilyStudy } from '@/core/graph';
import { PHONE_QUERIES } from '@/ui/hooks';
import { demoState } from '@/test-support/app-boot-kit';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { contextOf } from '@/test-support/graph-state';
import { utcTime } from '@/test-support/editing-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort } from './check-contracts';
import { EditorHost } from './editor-host';
import type { PreviewPort } from './preview-contracts';

beforeAll(stubDialog);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};
const E2 = 'rxn_r-2-bromobutane-alc-koh';

function previewFor(rig: EditorRig): PreviewPort {
  let names = true;
  const listeners = new Set<() => void>();
  return {
    build: (draft) => previewOfDraft(rig.store.getState(), indexEngine.build(rig.store.getState()), draft),
    binding: undefined,
    facts: undefined,
    timers: rig.port.timers,
    names: {
      get: () => names,
      set: (next) => {
        names = next;
        listeners.forEach((listener) => listener());
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
}

function show(target = E2) {
  const rig = editorRig();
  const opened = rig.drafts.open({ kind: 'reaction', id: target });
  if (!opened.ok) throw new Error(opened.message);
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet, preview: previewFor(rig) }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id };
}
const preview = (): HTMLElement => screen.getByRole('region', { name: 'Preview' });
const schemeText = (): string => within(preview()).getAllByRole('group', { name: /Full equation|^Outcome|^Conditions/ })[0]?.textContent ?? '';
const settle = async (rig: EditorRig): Promise<void> => void (await act(async () => void rig.ui.fireAfter(400)));
const sentenceOf = (scheme: HTMLElement): string => document.getElementById(scheme.getAttribute('aria-describedby') ?? '')?.textContent ?? '';

describe('the live preview', () => {
  it("a demo reaction opened UNCHANGED shows the card's own full equation, both products with their words", () => {
    show();
    const ctx = contextOf(demoState());
    const card = (familyStudy(ctx, 'cls_haloalkanes') as FamilyStudy).reactionsOf.groups.find((g) => g.name === 'Alkenes')?.cards.find((c) => c.name.includes('alc. KOH'));
    const schemes = within(preview()).getAllByRole('group', { name: 'Full equation' });
    expect(schemes).toHaveLength(card?.groups.length ?? -1);
    expect(sentenceOf(schemes[0] as HTMLElement)).toBe(card?.groups[0]?.equation?.text);
    expect(within(preview()).getByText('(major · Saytzeff)')).toBeTruthy();
    expect(within(preview()).getByText('(minor · Hofmann)')).toBeTruthy();
  });

  it('an edit of the reactant coefficient shows in the preview AFTER the 400 ms debounce, not before', async () => {
    const { rig } = show();
    expect(schemeText()).not.toMatch(/(^|\s)2\s*\(R\)-2-bromobutane/);
    const index = screen.getAllByTestId('participant-row').findIndex((row) => /Reactant/.test(row.textContent ?? '')) + 1;
    fireEvent.click(screen.getByRole('button', { name: `Edit participant ${index}` }));
    fireEvent.change(screen.getByLabelText(`Coefficient of participant ${index}`), { target: { value: '2' } });
    expect(within(preview()).queryByText('2')).toBeNull();
    await settle(rig);
    expect(within(preview()).getAllByText('2').length).toBeGreaterThan(0);
  });

  it('a participant with no substance gives the words, no drawing', async () => {
    const { rig, id } = show();
    act(() =>
      rig.port.edit(id, (draft) => {
        delete (draft as unknown as { participants: { ref?: unknown }[] }).participants[1]?.ref;
      }),
    );
    await settle(rig);
    expect(within(preview()).getByText('Participant 2 has no substance.')).toBeTruthy();
    expect(within(preview()).queryByRole('group', { name: 'Full equation' })).toBeNull();
  });

  it('no outcomes: the reactant side and the arrow, and "No products yet (outcomes arrive in step 6.4)"', async () => {
    const { rig, id } = show();
    act(() =>
      rig.port.edit(id, (draft) => {
        (draft as unknown as { outcomes: unknown[] }).outcomes = [];
      }),
    );
    await settle(rig);
    expect(within(preview()).getByText('No products yet (outcomes arrive in step 6.4)')).toBeTruthy();
    expect(within(preview()).getByRole('group', { name: 'Full equation' }).textContent).toContain('(R)-2-bromobutane');
    expect(within(preview()).queryByText('nothing listed')).toBeNull();
  });

  it('on a phone the preview is a collapsible "Preview" section at the top, CLOSED by default, and draws only when opened', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    show();
    const section = screen.getByText('Preview', { selector: 'summary' }).closest('details') as HTMLDetailsElement;
    expect(section.open).toBe(false);
    expect(screen.queryByRole('group', { name: 'Full equation' })).toBeNull();
    section.open = true;
    fireEvent(section, new Event('toggle'));
    expect(within(section).getAllByRole('group', { name: 'Full equation' }).length).toBeGreaterThan(0);
    // top of the editor: before the first form section
    const first = document.querySelector('[data-editor-sections]') as HTMLElement;
    expect(section.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a new reaction with no participant says what to do instead of drawing', () => {
    const rig = editorRig();
    const opened = rig.drafts.open({ kind: 'reaction', blank: true });
    if (!opened.ok) throw new Error(opened.message);
    renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet, preview: previewFor(rig) }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
    expect(within(preview()).getByText('Add a participant to see the reaction here.')).toBeTruthy();
  });
});
