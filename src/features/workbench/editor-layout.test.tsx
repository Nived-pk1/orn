// @vitest-environment jsdom
/**
 * The editor's layout and kind line (step 6.6c part A, L1 and L2): in EVERY editor kind the side column's first region is Findings (the
 * Relationships section lives in the main form column, after the shared fields), and the kind line under the title is plain words.
 */
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { RecordKind } from '@/core/schema';

beforeAll(stubDialog);
afterEach(cleanup);

const KINDS: readonly [RecordKind, string][] = [
  ['species', 'species'],
  ['class', 'class'],
  ['reagent', 'reagent'],
  ['reaction', 'reaction'],
  ['mechanism', 'mechanism'],
  ['reference', 'source'],
  ['concept', 'concept'],
  ['named_reaction', 'named reaction'],
  ['transformation', 'transformation'],
  ['relationship', 'relationship'],
  ['caveat', 'caveat'],
  ['topic', 'topic'],
  ['topic_mapping', 'topic mapping'],
  ['exam_relevance', 'exam relevance'],
];

/** Kinds that cannot be an end of a relationship. */
const NO_RELATIONSHIPS: readonly RecordKind[] = ['relationship', 'reference', 'topic', 'topic_mapping', 'exam_relevance'];

describe.each(KINDS)('the %s editor', (kind, words) => {
  it('has the form and the side column as the only two columns, Findings first in the side column', () => {
    const { dialog } = showKnowledge(kind, { blank: true });
    const aside = dialog.querySelector('[data-editor-aside]') as HTMLElement;
    expect(aside).not.toBeNull();
    const body = aside.parentElement as HTMLElement;
    expect(body.children).toHaveLength(2);
    expect(body.children[0]?.hasAttribute('data-editor-form')).toBe(true);
    const regions = within(aside).getAllByRole('region');
    expect(regions[0]?.getAttribute('aria-label')).toBe('Findings');
  });
  it('puts Relationships (when the kind has it) in the form column, after the shared fields', () => {
    const { dialog } = showKnowledge(kind, { blank: true });
    const form = dialog.querySelector('[data-editor-form]') as HTMLElement;
    const labels = Array.from(form.querySelectorAll('section[data-section]')).map((s) => s.getAttribute('aria-label') ?? '');
    const at = labels.indexOf('Relationships');
    if (NO_RELATIONSHIPS.includes(kind)) return expect(at).toBe(-1);
    expect(at).toBeGreaterThan(-1);
    const shared = labels.findIndex((l) => /tags and citations/.test(l));
    expect(at).toBeGreaterThan(shared);
    expect(screen.queryAllByRole('region', { name: 'Relationships' })).toHaveLength(1);
  });
  it('says the kind in plain words, never a raw enum', () => {
    const { dialog } = showKnowledge(kind, { blank: true });
    const line = dialog.querySelector('[data-editor-kind]') as HTMLElement;
    expect(line.textContent).toBe(words);
    expect(line.textContent).not.toMatch(/_/);
  });
});
