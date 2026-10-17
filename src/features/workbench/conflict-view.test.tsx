// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FieldComparison } from '@/core/editing';
import { ConflictView, fieldWords } from './conflict-view';
import { namesFieldLabel } from './names-section';

afterEach(cleanup);

const field = (path: string, status: FieldComparison['status']): FieldComparison => ({ path, status, base: 'a', theirs: 'b', mine: 'c' }) as FieldComparison;

describe('the field labels of the conflict table', () => {
  it('the Names section gives its labels; an unlabelled path shows its words', () => {
    expect(namesFieldLabel('names.canonical')).toBe('Canonical name');
    expect(namesFieldLabel('names.aliases')).toBe('Aliases');
    expect(namesFieldLabel('names.common')).toBe('Common names');
    expect(namesFieldLabel('notes')).toBeUndefined();
    expect(fieldWords('names.canonical')).toBe('names, canonical');
    expect(fieldWords('names.common[2]')).toBe('names, common, 2');
    expect(fieldWords('notes')).toBe('notes');
  });

  it('the table and the choice groups use labels, never raw paths', () => {
    render(
      <ConflictView
        comparisons={[field('names.canonical', 'both'), field('names.aliases', 'theirsOnly'), field('notes', 'mineOnly'), field('names.zzz', 'theirsOnly')]}
        choices={{}}
        onChoose={() => undefined}
        onSave={() => undefined}
        onBack={() => undefined}
        saving={false}
        labelOf={namesFieldLabel}
      />,
    );
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('rowheader')[0]?.textContent)).toEqual(['Canonical name', 'Aliases', 'notes', 'names, zzz']);
    expect(screen.getByRole('group', { name: 'Choice for Canonical name' })).toBeTruthy();
    expect(screen.queryByText('names.canonical')).toBeNull();
  });
});
