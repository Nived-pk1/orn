// @vitest-environment jsdom
/**
 * The injected card host and examples (7.3a C1, C2, C5): handed the ids of a general reaction's examples it draws the closed
 * "Examples (n)" disclosure with each example's card; handed `exampleOf` it draws "Example of <general>"; an outside example has the
 * outside words. Written first (seen red).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { demoState } from '@/test-support/app-boot-kit';
import { navigatorRig } from '@/test-support/navigator-kit';
import { NavigatorProvider } from './navigator-context';
import { ReactionCardHost, type ReactionCardHostProps } from './reaction-card-host';

afterEach(cleanup);
const state = demoState();
const G = 'rxn_alcohol1-to-aldehyde-pcc';
const E = 'rxn_ethanol-to-ethanal-pcc';

function show(props: Partial<ReactionCardHostProps> & { reactionId: string }) {
  const rig = navigatorRig(createCanonicalStore({ initial: state, validateInitial: false }));
  const onSelect = vi.fn();
  render(
    <NavigatorProvider ports={rig.ports} active={false}>
      <ReactionCardHost selected={false} onSelect={onSelect} fallback={(reason) => <p>{reason}</p>} {...props} />
    </NavigatorProvider>,
  );
  return { onSelect };
}

describe('a general reaction with examples', () => {
  it('has a closed "Examples (1)" disclosure holding the example\'s card; its name selects it', () => {
    const { onSelect } = show({ reactionId: G, examples: [E] });
    const details = screen.getByText('Examples (1)').closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(within(details).getByRole('button', { name: 'Ethanol → ethanal (PCC)' }));
    expect(onSelect).toHaveBeenCalledWith(E);
  });

  it('an outside example has the outside words inside the disclosure', () => {
    show({ reactionId: G, examples: [E], outsideOf: (id) => (id === E ? 'outside JEE Main' : undefined) });
    const details = screen.getByText('Examples (1)').closest('details') as HTMLDetailsElement;
    expect(within(details).getByText('outside JEE Main')).toBeTruthy();
  });

  it('without examples there is no disclosure', () => {
    show({ reactionId: G });
    expect(screen.queryByText(/^Examples \(/)).toBeNull();
  });
});

describe('an example whose general reaction is not in the list', () => {
  it('says "Example of <general>", a link that selects the general reaction', () => {
    const { onSelect } = show({ reactionId: E, exampleOf: { id: G, name: '1° alcohol → aldehyde (PCC)' } });
    fireEvent.click(screen.getByRole('button', { name: '1° alcohol → aldehyde (PCC)' }));
    expect(onSelect).toHaveBeenCalledWith(G);
  });
});
