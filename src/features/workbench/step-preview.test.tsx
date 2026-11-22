// @vitest-environment jsdom
/**
 * Step 8.5 M6: the mechanism step editor draws the DRAFT step live under its electron movements (like the reaction editor's preview): it
 * updates as a movement is added, says why when it cannot draw, leaves a movement that is not complete out and says so; and the bond choices
 * list the pairs that ARE bonded in the step's structures first (the bonds the structure tool reports), then the rest.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ParseOutcome } from '@/chem/contracts';
import { editorRig, renderWithToasts } from '@/test-support/editor-kit';
import { utcTime } from '@/test-support/editing-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort } from './check-contracts';
import { EditorHost } from './editor-host';
import type { StructurePort } from './structure-contracts';

beforeAll(stubDialog);
afterEach(cleanup);

const SN2 = 'mec_sn2-haloalkane';
const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};
const parse: StructurePort['parse'] = async (structure): Promise<ParseOutcome> => ({
  ok: true,
  facts: { atomMaps: [...structure.value.matchAll(/:(\d+)\]/g)].map((m) => Number(m[1])).sort((a, b) => a - b), warnings: [] },
});
/** A structure tool that places the atoms of a structure on a line, in the order its map numbers are written, and bonds 2-3 (the C-Br bond) when both are in it. */
function drawing() {
  const port = {
    calls: 0,
    keyOf: () => 'k',
    cancel: () => undefined,
    depict: async (structure: { value: string }) => {
      port.calls += 1;
      const maps = [...structure.value.matchAll(/:(\d+)\]/g)].map((m) => Number(m[1]));
      return { ok: true as const, svg: '<svg/>', width: 120, height: 70, atoms: maps.map((map, i) => ({ map, x: 20 + 35 * i, y: 35, rx: 9, ry: 9 })), bonds: maps.includes(2) && maps.includes(3) ? [{ a: 2, b: 3 }] : [] };
    },
    createUrl: () => 'blob:x',
    revokeUrl: () => undefined,
  };
  return port;
}

function show(target: string, depictions: ReturnType<typeof drawing> | undefined) {
  const rig = editorRig();
  const opened = rig.drafts.open({ kind: 'mechanism', id: target });
  if (!opened.ok) throw new Error(opened.message);
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet, structure: { parse, ...(depictions === undefined ? {} : { depictions }) } }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit variant 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit step 1' }));
  return rig;
}
const optionValues = (label: string): string[] => within(screen.getByLabelText(label)).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
/** The 400 ms the preview, the structure panel and the live checks wait (manual timers in the rig). */
const settle = (rig: ReturnType<typeof show>): void => {
  act(() => {
    while (rig.ui.fireAfter(400)) continue;
  });
};
const preview = () => document.querySelector('[data-step-preview]') as HTMLElement;

describe('the live preview of a step', () => {
  it('draws the draft step under its movements: the picture, and one curved arrow per complete movement', async () => {
    show(SN2, drawing());
    const img = await within(preview()).findByRole('img', { name: 'Drawing of step 1; the details are below.' });
    expect(img).toBeTruthy();
    expect(preview().querySelectorAll('[data-arrow]').length).toBe(2);
    const group = screen.getByRole('group', { name: 'Bonds and electron movements of step 1' });
    expect(group.contains(preview())).toBe(true);
  });

  it('updates as a movement is added: a new empty movement is not drawn and the quiet line says so; once complete it is drawn', async () => {
    const rig = show(SN2, drawing());
    await within(preview()).findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Add electron movement' }));
    settle(rig);
    expect(await within(preview()).findByText('1 electron movement is not complete yet, so its arrow is not drawn.')).toBeTruthy();
    change('From of movement 3', 'atom:1');
    change('To of movement 3', 'atom:2');
    change('Electrons of movement 3', '2');
    settle(rig);
    await waitFor(() => expect(preview().querySelectorAll('[data-arrow]').length).toBe(3));
    expect(within(preview()).queryByText(/not complete yet/)).toBeNull();
  });

  it('a movement removed from the draft is gone from the picture', async () => {
    const rig = show(SN2, drawing());
    await within(preview()).findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Remove movement 2' }));
    settle(rig);
    await waitFor(() => expect(preview().querySelectorAll('[data-arrow]').length).toBe(1));
  });

  it('with no structure tool port there is no preview (the rows are all there is, as before)', async () => {
    show(SN2, undefined);
    await screen.findByLabelText('From of movement 1');
    expect(preview()).toBeNull();
  });
});

describe('the bond choices list the pairs that are bonded in the step first', () => {
  it('a bond: the bonded pair (2-3, from the structure tool) before the rest', async () => {
    show(SN2, drawing());
    await waitFor(() => expect(optionValues('Atoms of bond formed 1')).toEqual(['2-3', '1-2', '1-3']));
  });

  it('a movement\'s bond sites follow the same order; atom, lone pair and radical sites are unchanged', async () => {
    show(SN2, drawing());
    await waitFor(() => expect(optionValues('From of movement 1').slice(-3)).toEqual(['bond:2-3', 'bond:1-2', 'bond:1-3']));
    expect(optionValues('From of movement 1').slice(0, 3)).toEqual(['atom:1', 'lone_pair:1', 'radical:1']);
  });

  it('without bonds from the tool the order is the old one (ascending pairs)', async () => {
    show(SN2, undefined);
    await waitFor(() => expect(optionValues('Atoms of bond formed 1')).toEqual(['1-2', '1-3', '2-3']));
  });
});
