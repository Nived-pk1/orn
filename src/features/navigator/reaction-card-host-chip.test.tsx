// @vitest-environment jsdom
/** The scope chips on every reaction card, not only on the family page (step 8.4d, E4): "Extra" for enrichment, "Background" for prerequisite. */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import type { Reaction } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { navigatorRig } from '@/test-support/navigator-kit';
import { NavigatorProvider } from './navigator-context';
import { ReactionCardHost } from './reaction-card-host';

const lens = vi.hoisted(() => ({ scopes: new Map<string, string>() }));
vi.mock('./scope-lens', () => ({
  unscoped: () => 'unmapped',
  scopeLens: () => (ref: { id: string }) => lens.scopes.get(ref.id) ?? 'official',
  scopeNameOf: () => 'JEE Main',
  outsideNoteOf: () => 'outside JEE Main',
}));

const state = demoState();
const withCard = (Object.values(state.records.reaction) as Reaction[]).filter((r) => r.outcomes.some((o) => o.products.some((p) => p.role === 'main')));
const [first, second, third] = withCard as [Reaction, Reaction, Reaction];

afterEach(() => {
  cleanup();
  lens.scopes.clear();
});

function show(reaction: Reaction, exam: boolean): HTMLElement {
  const rig = navigatorRig(createCanonicalStore({ initial: state, validateInitial: false }));
  if (exam) rig.ports.ui.exam.getState().setActive({ examId: "exm_x", examVersionId: "exv_x" } as never);
  render(
    <NavigatorProvider ports={rig.ports} active={false}>
      <ReactionCardHost reactionId={reaction.id} selected={false} onSelect={() => undefined} fallback={(reason) => <p>{reason}</p>} />
    </NavigatorProvider>,
  );
  return screen.getAllByRole('article')[0] as HTMLElement;
}

describe('ReactionCardHost scope chips', () => {
  it('under a chosen exam an enrichment reaction says "Extra" and a prerequisite one "Background"', () => {
    lens.scopes.set(first.id, 'enrichment');
    lens.scopes.set(second.id, 'prerequisite');
    expect(within(show(first, true)).getByText('Extra')).toBeTruthy();
    cleanup();
    expect(within(show(second, true)).getByText('Background')).toBeTruthy();
  });

  it('an official reaction has no chip, and with no exam chosen nothing has one', () => {
    expect(within(show(third, true)).queryByText('Extra')).toBeNull();
    expect(within(show(third, true)).queryByText('Background')).toBeNull();
    cleanup();
    lens.scopes.set(first.id, 'enrichment');
    expect(within(show(first, false)).queryByText('Extra')).toBeNull();
  });
});
