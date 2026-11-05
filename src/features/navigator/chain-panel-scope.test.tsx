// @vitest-environment jsdom
/** The chain panel reads the active exam scope from the map's ports (step 8.2b-fix, E4): outside reactions are not steps; All exams keeps every one. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActiveExamStore } from '@/ui/state';
import { ChainPanelInScope } from './chain-panel';
import type { NavigatorPorts } from './contracts';

vi.mock('./scope-lens', () => ({
  scopeLens: () => (ref: { id: string }) => (ref.id === 'r1' ? 'outside' : 'official'),
  scopeNameOf: (_state: unknown, active: unknown) => (active === null ? undefined : 'JEE Main'),
}));
afterEach(cleanup);

const families = [{ id: 'a', name: 'Alkenes' }, { id: 'b', name: 'Alcohols' }];
const pairs = [{ from: 'a', to: 'b', candidates: [{ reactionId: 'r1' }] }];
const fakePorts = (active: boolean): NavigatorPorts => {
  const exam = createActiveExamStore(active ? ({ examId: 'exm_x', examVersionId: 'exv_x' } as never) : null);
  return { ui: { exam }, indexes: { current: () => ({}) }, store: { getState: () => ({}) } } as unknown as NavigatorPorts;
};
const show = (active: boolean) => {
  render(<ChainPanelInScope ports={fakePorts(active)} families={families} pairs={() => pairs} facts={() => undefined} onChain={() => undefined} onOpenStep={() => undefined} onClose={() => undefined} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'From' }), { target: { value: 'a' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'To' }), { target: { value: 'b' } });
};

describe('ChainPanelInScope', () => {
  it('under an exam scope the only chain is outside it: the words say so', () => {
    show(true);
    expect(screen.getByText('No chain within JEE Main in 3 steps or fewer.')).toBeTruthy();
  });
  it('with All exams every reaction counts', () => {
    show(false);
    expect(screen.getByRole('list', { name: 'Chains' })).toBeTruthy();
  });
});
