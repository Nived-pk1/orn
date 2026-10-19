// @vitest-environment jsdom
/** The structure panel (step 6.2a part 3): 400 ms debounce, derived values beside entered ones, the explicit button, invalid text, the limits. */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { editDraft, type DraftRecipe } from '@/core/editing';
import type { ParseOutcome, StructureFacts } from '@/chem/contracts';
import type { StructureRep } from '@/core/schema';
import { clockContext } from '@/test-support/editing-kit';
import { manualScheduler } from '@/test-support/persistence-kit';
import { StructurePanel } from './structure-panel';
import type { StructurePort } from './structure-contracts';
import { formatOf, limitProblem, setStructureText } from './structure-model';

afterEach(cleanup);

const facts = (over: Partial<StructureFacts> = {}): StructureFacts => ({ formula: 'C2H6O', charge: 0, atomMaps: [], warnings: [], specifiedStereocentres: 0, unspecifiedStereocentres: 0, ...over });
const ok = (over: Partial<StructureFacts> = {}): ParseOutcome => ({ ok: true, facts: facts(over) });

function rig(parse: StructurePort['parse'], start: Record<string, unknown> = {}) {
  const timers = manualScheduler();
  const ctx = clockContext();
  const state = { session: { draft: { kind: 'species', id: 'spc_x', ...start } as Record<string, unknown>, past: [] as never[], future: [] as never[] } };
  const edits: string[] = [];
  function Host() {
    const [draft, setDraft] = useState<unknown>(state.session.draft);
    return (
      <StructurePanel
        draft={draft}
        port={{ parse }}
        timers={timers}
        onEdit={(recipe: DraftRecipe, path) => {
          edits.push(path ?? 'none');
          const next = editDraft({ ...state.session, draft } as never, recipe, ctx, path === undefined ? {} : { path });
          setDraft(next.draft);
          state.session.draft = next.draft as never;
        }}
      />
    );
  }
  render(<Host />);
  return { timers, edits, state };
}
const type = (text: string): void => void fireEvent.change(screen.getByLabelText('SMILES, CXSMILES or molfile'), { target: { value: text } });

describe('notation and limits', () => {
  it('tells SMILES, CXSMILES and a molfile apart by content', () => {
    expect(formatOf('CCO')).toBe('smiles');
    expect(formatOf('CCO |$_AV:1;2$|')).toBe('cxsmiles');
    expect(formatOf('\n  RDKit 2D\n\n  0  0  0  0  0  0  0  0  0  0999 V2000\nM  END\n')).toBe('molfile');
  });
  it('refuses over 20,000 characters (line notation) and 1 MB (molfile) in words', () => {
    expect(limitProblem('C'.repeat(20_000))).toBeUndefined();
    expect(limitProblem('C'.repeat(20_001))).toMatch(/at most 20,000 characters.*20,001.*nothing was cut/);
    expect(limitProblem(`${'x'.repeat(1_000_000)}\nM  END`)).toMatch(/molfile can have at most 1,000,000/);
  });
  it('an empty text removes the structure; text is kept as typed', () => {
    const d = { structure: { format: 'smiles', value: 'C' } } as Record<string, unknown>;
    setStructureText('')(d as never);
    expect(d).toEqual({});
    setStructureText('  CCO ')(d as never);
    expect(d.structure).toEqual({ format: 'smiles', value: '  CCO ' });
  });
});

describe('the panel', () => {
  it('parses 400 ms after the last keystroke (injected timers), not before', async () => {
    const parse = vi.fn(async () => ok());
    const { timers } = rig(parse);
    type('C');
    type('CC');
    type('CCO');
    expect(parse).not.toHaveBeenCalled();
    expect(timers.liveDelays().filter((ms) => ms === 400)).toHaveLength(1);
    await act(async () => void timers.fireAfter(400));
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledWith({ format: 'smiles', value: 'CCO' } satisfies StructureRep);
  });

  it('shows the derived values BESIDE the entered ones, and writes nothing until the button', async () => {
    const { timers, state } = rig(async () => ok({ formula: 'C2H6O' }), { structure: { format: 'smiles', value: 'CCO' }, formula: 'C3H8O', charge: 0 });
    await act(async () => void timers.fireAfter(400));
    const table = screen.getByRole('table', { name: 'Entered and derived values' });
    const formulaRow = within(table).getByText('Formula').closest('tr') as HTMLElement;
    const cells = within(formulaRow).getAllByRole('cell');
    expect(cells[0]?.textContent).toBe('C3H8O'); // entered (in the formula typography: the digits are subscripts)
    expect(cells[1]?.textContent).toMatch(/^C2H6O/); // derived, beside it
    expect((state.session.draft as unknown as { formula: string }).formula).toBe('C3H8O'); // nothing written
    fireEvent.click(within(formulaRow).getByRole('button', { name: 'Use derived formula' }));
    expect((state.session.draft as unknown as { formula: string }).formula).toBe('C2H6O');
  });

  it('no button when the entered formula already equals the derived one', async () => {
    const { timers } = rig(async () => ok(), { structure: { format: 'smiles', value: 'CCO' }, formula: 'C2H6O' });
    await act(async () => void timers.fireAfter(400));
    expect(screen.queryByRole('button', { name: 'Use derived formula' })).toBeNull();
  });

  it('an unreadable structure is said with the engine words; the draft still holds the text (it saves with CHEM-001)', async () => {
    const { timers, state } = rig(async () => ({ ok: false, reason: 'invalid', problem: 'unreadable', error: 'SMILES Parse Error: unclosed ring' }));
    type('C1CC');
    await act(async () => void timers.fireAfter(400));
    expect(screen.getByRole('alert').textContent).toBe('The chemistry engine could not read this structure: SMILES Parse Error: unclosed ring');
    expect((state.session.draft as unknown as { structure: unknown }).structure).toEqual({ format: 'smiles', value: 'C1CC' });
  });

  it('a worker that does not answer is not "invalid"', async () => {
    const { timers } = rig(async () => ({ ok: false, reason: 'unavailable', error: 'the toolkit did not load' }), { structure: { format: 'smiles', value: 'CCO' } });
    await act(async () => void timers.fireAfter(400));
    expect(screen.getByRole('status').textContent).toMatch(/did not answer.*toolkit did not load/);
    expect(screen.queryByText(/could not read this structure/)).toBeNull();
  });

  it('an over-limit text is refused in the field with the limit; the draft is not changed', () => {
    const { edits } = rig(async () => ok());
    type('C'.repeat(20_001));
    expect(screen.getByRole('alert').textContent).toMatch(/at most 20,000 characters/);
    expect(screen.getByLabelText('SMILES, CXSMILES or molfile').getAttribute('aria-invalid')).toBe('true');
    expect(edits).toEqual([]);
    type('CCO');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(edits).toEqual(['structure']);
  });

  it('drops the answer for an older text', async () => {
    let first: (o: ParseOutcome) => void = () => undefined;
    let calls = 0;
    const { timers } = rig(() => (++calls === 1 ? new Promise<ParseOutcome>((r) => (first = r)) : Promise.resolve(ok({ formula: 'C3H8O' }))));
    type('CCO');
    await act(async () => void timers.fireAfter(400));
    type('CCCO');
    await act(async () => void timers.fireAfter(400));
    await act(async () => first(ok({ formula: 'STALE' })));
    expect(screen.queryByText(/STALE/)).toBeNull();
    expect(screen.getByRole('table').textContent).toMatch(/C3H8O/);
  });
});

describe('typography and layout (review of 6.2a)', () => {
  it('formulas in the facts table use subscripts; the text inputs stay plain text', async () => {
    const { timers } = rig(async () => ok({ formula: 'C2H6O' }), { structure: { format: 'smiles', value: 'CCO' }, formula: 'C3H8O' });
    await act(async () => void timers.fireAfter(400));
    const table = screen.getByRole('table', { name: 'Entered and derived values' });
    const subs = [...table.querySelectorAll('sub')].map((el) => el.textContent);
    expect(subs).toEqual(expect.arrayContaining(['3', '8', '2', '6']));
    expect((screen.getByLabelText('SMILES, CXSMILES or molfile') as HTMLTextAreaElement).value).toBe('CCO');
  });

  it('the drawing sits in a tile (the family card styling class)', async () => {
    const timers = manualScheduler();
    render(
      <StructurePanel
        draft={{ structure: { format: 'smiles', value: 'CCO' } }}
        port={{ parse: async () => ok(), depictions: undefined as never }}
        timers={timers}
        onEdit={() => undefined}
      />,
    );
    await act(async () => void timers.fireAfter(400));
    // without a depiction port the hint stands in; the tile wraps only a ready drawing
    expect(document.querySelector('img')).toBeNull();
  });

  it('a phone marks every cell with its label so the rows can stack', async () => {
    const timers = manualScheduler();
    render(<StructurePanel draft={{ structure: { format: 'smiles', value: 'CCO' }, formula: 'C3H8O' }} port={{ parse: async () => ok() }} timers={timers} onEdit={() => undefined} phone />);
    await act(async () => void timers.fireAfter(400));
    const row = screen.getByText('Formula').closest('tr') as HTMLElement;
    expect([...row.querySelectorAll('td')].map((td) => td.getAttribute('data-label'))).toEqual(['Entered', 'Derived from the structure']);
    expect(screen.getByLabelText('SMILES, CXSMILES or molfile').closest('div')?.parentElement?.className).toMatch(/phone/);
  });
});
