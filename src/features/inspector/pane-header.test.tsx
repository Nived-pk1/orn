// @vitest-environment jsdom
/**
 * Step 8.4e, Part B1 (design reference section 9): every pane has ONE header that stays while the body scrolls: the kind chip on the left, the
 * review mark on the right, the title, and ONE summary line. The arrow and bucket panes and their go-next lists are list rows, never pill buttons.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, render, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { STUDIO_CHROME, StudyChromeProvider, studyChrome } from '@/ui/study-chrome';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout, inspectorRig, preloadViews } from '@/test-support/inspector-kit';
import { Inspector } from './inspector';

beforeAll(async () => {
  fakeLayout();
  await preloadViews();
});
afterEach(cleanup);

const REACTION = { kind: 'reaction', id: 'rxn_alcohol1-to-aldehyde-pcc' } as RecordRef;

function checking(): CanonicalState {
  const state = structuredClone(demoState()) as CanonicalState;
  const record = state.records.reaction[REACTION.id] as { review: { status: string } };
  record.review = { ...record.review, status: 'review_required' };
  return state;
}

async function show(state: CanonicalState, studyView: boolean): Promise<void> {
  const rig = inspectorRig(state, { studyView });
  const chrome = studyView ? studyChrome('study', { ownData: false } as never) : STUDIO_CHROME;
  render(
    <StudyChromeProvider value={chrome}>
      <Inspector ports={rig.ports} host={rig.host} />
    </StudyChromeProvider>,
  );
  act(() => rig.inspector.getState().open(REACTION));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('the pane header', () => {
  it('names the kind on the left, the review mark on the right (Study: the dot), then the title and one summary line', async () => {
    await show(checking(), true);
    const header = document.querySelector('header') as HTMLElement;
    const aside = header.querySelector('[data-head-aside]') as HTMLElement;
    expect(aside, 'the right side of the chip row').not.toBeNull();
    expect(within(aside).getByRole('img', { name: /./ }).getAttribute('data-review-mark')).toBe('dot');
    expect(header.querySelector('[data-pane-summary]')?.textContent, 'one summary line: the ends of the (general) reaction').toBe('Primary alcohols → Aldehydes');
    expect(header.querySelectorAll('[data-pane-summary]')).toHaveLength(1);
  });
  it('Studio draws its own mark (the pill with words) in the same place', async () => {
    await show(checking(), false);
    const aside = document.querySelector('header [data-head-aside]') as HTMLElement;
    expect(aside.querySelector('[data-review-mark="pill"]')).not.toBeNull();
  });
  it('the header sticks while the body scrolls (CSS)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/features/inspector/study-inspector.module.css'), 'utf8');
    expect(css).toMatch(/\.head \{[^}]*position: sticky/);
  });
  it('the title is 20 px at weight 600 (CSS)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/features/inspector/study-inspector.module.css'), 'utf8');
    expect(css).toMatch(/\.titleText \{[^}]*font-size: var\(--text-20\)[^}]*font-weight: 600/);
  });
});

describe('the pane motion (CSS; transform and opacity only, none under reduced motion)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/ui/shell/shell.module.css'), 'utf8');
  it('opens with a 260 ms slide and fade, only for people who have not asked for less motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{[^@]*\.inspector:not\(\[hidden\]\)[^}]*animation: [^;]*260ms/);
    const keyframes = /@keyframes paneIn \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(keyframes).toMatch(/transform/);
    expect(keyframes).toMatch(/opacity/);
    expect(keyframes).not.toMatch(/width/);
  });
});
