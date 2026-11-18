// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastProvider, ToastRegion } from '@/ui/primitives';
import { createMyRecords } from './my-records';
import { STAR_LIMIT } from './my-records-rule';
import { StarKey } from './star-key';

afterEach(cleanup);
const a = { kind: 'reaction', id: 'rxn_a' } as const;

function view(selected: typeof a | null, uiState: Record<string, unknown> = {}) {
  const mine = createMyRecords({ bootReport: { uiState } } as never);
  render(
    <ToastProvider>
      <input aria-label="field" />
      <StarKey mine={mine} selected={() => selected} />
      <ToastRegion />
    </ToastProvider>,
  );
  return mine;
}

describe('StarKey (step 8.4g Part B, G2)', () => {
  it('S stars the selected record, S again takes the star away, and says so', async () => {
    const mine = view(a);
    fireEvent.keyDown(document.body, { key: 's' });
    expect(mine.isStarred(a)).toBe(true);
    expect((await screen.findAllByText('Starred')).length).toBeGreaterThan(0);
    fireEvent.keyDown(document.body, { key: 'S' });
    expect(mine.isStarred(a)).toBe(false);
  });

  it('does nothing without a selected record, inside a text field, with a modifier, or while a dialog is open', () => {
    const none = view(null);
    fireEvent.keyDown(document.body, { key: 's' });
    expect(none.starred()).toEqual([]);
    cleanup();
    const mine = view(a);
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 's' });
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 's', metaKey: true });
    fireEvent.keyDown(document.body, { key: 's', altKey: true });
    expect(mine.starred()).toEqual([]);
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    fireEvent.keyDown(document.body, { key: 's' });
    expect(mine.starred()).toEqual([]);
    dialog.remove();
  });

  it('the 501st star says "You can star up to 500 records"', async () => {
    const mine = view(a, { starred: Array.from({ length: STAR_LIMIT }, (_, n) => ({ kind: 'species', id: `s${n}` })) });
    fireEvent.keyDown(document.body, { key: 's' });
    expect(mine.isStarred(a)).toBe(false);
    expect((await screen.findAllByText('You can star up to 500 records')).length).toBeGreaterThan(0);
  });
});
