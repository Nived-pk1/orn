// @vitest-environment jsdom
/** The class editor's "Map family" section (step 6.6c part 4, M4): says whether the class is one, offers to make it or to edit it. */
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';

beforeAll(stubDialog);
afterEach(cleanup);

describe('Map family (class editor)', () => {
  it('a class that is not one says so and "Make this a map family" keeps the draft and opens a NEW one with the class filled in', () => {
    const shown = showKnowledge('class', { target: 'cls_acyl-halides' });
    expect(screen.getByText('This class is not a map family.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Make this a map family' }));
    expect(shown.start).toHaveBeenCalledWith('navigator_anchor', { target: { kind: 'class', id: 'cls_acyl-halides' } });
  });
  it('a class that is one says so and "Edit map family" opens the family\'s editor', () => {
    const shown = showKnowledge('class', { target: 'cls_alcohols' });
    expect(screen.getByText('This class is a map family.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make this a map family' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit map family' }));
    expect(shown.editRecord).toHaveBeenCalledWith({ kind: 'navigator_anchor', id: 'anc_alcohols' });
  });
  it('a class not saved yet cannot be made one: the button says to save it first', () => {
    showKnowledge('class', { blank: true });
    expect(screen.getByRole('button', { name: 'Make this a map family', description: /save the class first/i }).getAttribute('aria-disabled')).toBe('true');
  });
});
