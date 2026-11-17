// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { StructureFactsPort } from './contracts';
import { useFactsInput } from './use-facts';

afterEach(cleanup);

const STRUCTURE = { format: 'smiles', value: 'CCO' } as const;

function Probe(props: { readonly port: StructureFactsPort }) {
  return <p data-testid="state">{useFactsInput(props.port, STRUCTURE, true).state}</p>;
}

describe('the chem facts of a term (step 8.4m2, B3)', () => {
  it('a term made again for a structure the port already answered is ready at once, with no second question', async () => {
    let asked = 0;
    const port = { factsOf: () => (asked += 1, Promise.resolve({ ok: true, heavyAtomCount: 3, carbonCount: 2 })) } as unknown as StructureFactsPort;
    const first = render(<Probe port={port} />);
    expect(screen.getByTestId('state').textContent).toBe('pending');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('state').textContent).toBe('ready');
    first.unmount();
    render(<Probe port={port} />);
    expect(screen.getByTestId('state').textContent).toBe('ready');
    expect(asked).toBe(1);
  });
});
