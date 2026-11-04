// @vitest-environment jsdom
/** "See those compounds" (step 8.2a, D5, Studio only): the compounds or classes in no family and how many reactions lead to each; a row opens in the inspector. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { navigatorRig } from '@/test-support/navigator-kit';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { documentToState } from '@/core/dataset';
import { stubDialog } from '@/test-support/window-kit';
import { MapCompoundsContext } from './compounds-context';
import { NavigatorProvider } from './navigator-context';
import { UnclassifiedDialog } from './unclassified-dialog';

beforeAll(stubDialog);
afterEach(cleanup);

const parsed = documentToState(JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/map-layout/map-layout.orn.json'), 'utf8')));
if (!parsed.ok) throw new Error('fixture');
const fixtureState = parsed.state;

function show(open = true) {
  const rig = navigatorRig(createCanonicalStore({ initial: fixtureState, validateInitial: false }));
  const opened = vi.fn();
  const onClose = vi.fn();
  render(
    <NavigatorProvider ports={rig.ports} active={false}>
      <MapCompoundsContext.Provider value={{ open: opened }}>
        <UnclassifiedDialog open={open} onClose={onClose} />
      </MapCompoundsContext.Provider>
    </NavigatorProvider>,
  );
  return { opened, onClose };
}

describe('UnclassifiedDialog', () => {
  it('lists each compound that is in no family with the number of reactions that lead to it, most first', () => {
    show();
    const list = screen.getByRole('list', { name: 'Compounds in no family' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.length).toBe(3);
    const counts = rows.map((row) => Number(/(\d+) reactions?/.exec(row.textContent ?? '')?.[1]));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(6); // the fixture has 6 reactions into no family
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(rows[0]?.textContent).toMatch(/Orphan compound/);
  });

  it('a row opens that record in the inspector and closes the list', () => {
    const { opened, onClose } = show();
    fireEvent.click(within(screen.getByRole('list', { name: 'Compounds in no family' })).getAllByRole('button')[0] as HTMLElement);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened.mock.calls[0]?.[0]).toMatchObject({ kind: 'class' });
    expect(onClose).toHaveBeenCalled();
  });

  it('draws nothing while closed', () => {
    show(false);
    expect(screen.queryByRole('list', { name: 'Compounds in no family' })).toBeNull();
  });
});
