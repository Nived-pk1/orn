// @vitest-environment jsdom
/**
 * Where the Pictures section sits in each form (step 7.1a, ADR-038 addendum Q4): every PICTURE_KINDS form has ONE "Pictures" section,
 * directly after the section that holds the record's summary or description, or after Identity when the form has neither; no other form has
 * one; the mechanism form keeps its place. A phone starts the new sections collapsed, like the other long sections.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { blankDraft, PICTURE_KINDS } from '@/core/editing';
import { RECORD_KINDS, type RecordKind } from '@/core/schema';
import { fakePictures } from '@/test-support/pictures-kit';
import { stubDialog } from '@/test-support/window-kit';
import { RecordForm } from './record-form';

beforeAll(stubDialog);
afterEach(cleanup);

/** The section that holds the summary or description of each kind (its shared texts), or 'identity' when the kind has neither. */
const AFTER: Readonly<Record<string, string>> = {
  species: 'identity',
  class: 'shared',
  reagent: 'shared',
  reaction: 'identity',
  transformation: 'shared',
  named_reaction: 'shared',
  concept: 'shared',
  caveat: 'statement',
  route: 'description',
  mechanism: 'summary',
};

let n = 0;
const ctx = { newId: (prefix: string) => `${prefix}_t${++n}`, now: () => '2026-10-24T10:00:00.000Z' };

function sectionsOf(kind: RecordKind, over: { phone?: boolean; withPictures?: boolean } = {}): { ids: string[]; open: Record<string, boolean> } {
  const draft = blankDraft(kind, ctx as never);
  if (draft === undefined) return { ids: [], open: {} };
  const fake = fakePictures([]);
  const { container } = render(
    <RecordForm
      kind={kind}
      draft={draft}
      onEdit={() => undefined}
      structure={undefined}
      timers={{ after: () => () => undefined }}
      newId={ctx.newId}
      suggestions={[]}
      {...(over.withPictures === false ? {} : { pictures: fake.port, saved: true })}
      {...(over.phone === true ? { phone: true } : {})}
    />,
  );
  const sections = Array.from(container.querySelectorAll('[data-editor-sections] > section[data-section]'));
  const open = Object.fromEntries(sections.map((one) => [one.getAttribute('data-section') as string, one.querySelector('button[data-section-toggle]')?.getAttribute('aria-expanded') === 'true']));
  return { ids: sections.map((one) => one.getAttribute('data-section') as string), open };
}

describe('the Pictures section of each form', () => {
  it.each([...PICTURE_KINDS])('%s has ONE Pictures section, directly after its summary or description section', (kind) => {
    const { ids } = sectionsOf(kind);
    expect(ids.filter((id) => id === 'pictures')).toHaveLength(1);
    expect(ids[ids.indexOf('pictures') - 1]).toBe(AFTER[kind]);
  });

  it('no other kind has one', () => {
    for (const kind of RECORD_KINDS.filter((one) => !(PICTURE_KINDS as readonly string[]).includes(one))) {
      cleanup();
      expect(sectionsOf(kind).ids, kind).not.toContain('pictures');
    }
  });

  it('a form without a pictures port has no Pictures section', () => {
    for (const kind of PICTURE_KINDS) {
      cleanup();
      expect(sectionsOf(kind, { withPictures: false }).ids, kind).not.toContain('pictures');
    }
  });

  it('on a phone the new sections start closed; the mechanism keeps its place and stays open', () => {
    for (const kind of PICTURE_KINDS.filter((one) => one !== 'mechanism')) {
      cleanup();
      expect(sectionsOf(kind, { phone: true }).open.pictures, kind).toBe(false);
    }
    cleanup();
    expect(sectionsOf('mechanism', { phone: true }).open.pictures).toBe(true);
  });
});
