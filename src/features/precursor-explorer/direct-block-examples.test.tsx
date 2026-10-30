// @vitest-environment jsdom
/**
 * "Made directly from" folds examples (7.3a C1 to C3): inside one starting material's block, an example is not a card of its own, the
 * general reaction's card is handed its example ids, the block's count says "(+ n examples)", and Compact folds the same way.
 * Written first (seen red).
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { directPrecursors } from '@/core/graph';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf, reaction, sp } from '@/test-support/graph-state';
import { withRecords } from '@/test-support/search-state';
import type { AnyRecord } from '@/core/schema';
import type { CardArgs } from './contracts';
import { DirectBlock } from './direct-block';

afterEach(cleanup);
const rx = (slug: string, name: string, scope: 'generic' | 'specific', instanceOf?: string): AnyRecord =>
  reaction({ slug, name, scope, ...(instanceOf === undefined ? {} : { instanceOf }), participants: [{ ref: sp('ethanol'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('ethanal') }] }] });
const state = withRecords(demoState(), [rx('zz-gen', 'Zz general', 'generic'), rx('zz-one', 'Zz example one', 'specific', 'zz-gen'), rx('zz-two', 'Zz example two', 'specific', 'zz-gen')]);
const ctx = contextOf(state);
const direct = directPrecursors(ctx, { kind: 'species', id: 'spc_ethanal' }, () => 'unmapped');
const fromEthanol = direct.groups.find((g) => g.reactions.some((r) => r.reactionId === 'rxn_zz-gen'));
const others = (fromEthanol?.reactions.length ?? 0) - 3;

function show(view: 'cards' | 'compact') {
  const asked: CardArgs[] = [];
  render(
    <DirectBlock
      ports={{ select: vi.fn(), showReactionsMaking: vi.fn(), renderCard: (args) => (asked.push(args), <article data-reaction-id={args.reactionId}>{args.reactionId}</article>) }}
      ctx={ctx}
      direct={direct}
      targetName="Ethanal"
      view={view}
      selected={null}
      outsideNote={undefined}
    />,
  );
  return asked;
}

describe('Cards', () => {
  it('the examples fold under the general reaction; the other reaction stays a card; the count says the examples in words', () => {
    const asked = show('cards');
    expect(asked.map((a) => a.reactionId)).not.toContain('rxn_zz-one');
    expect(asked.map((a) => a.reactionId)).not.toContain('rxn_zz-two');
    expect(asked).toHaveLength(others + 1);
    expect(asked.find((a) => a.reactionId === 'rxn_zz-gen')?.examples).toEqual(['rxn_zz-one', 'rxn_zz-two']);
    expect(screen.getByRole('heading', { name: `From Ethanol, ${others + 1} reactions (+ 2 examples)` })).toBeTruthy();
  });
});

describe('Compact', () => {
  it('the general reaction\'s row says "2 examples" and holds their rows; they have no row of their own', () => {
    show('compact');
    const rows = Array.from(document.querySelectorAll<HTMLElement>('li[data-reaction-id]'));
    const general = rows.find((row) => row.dataset.reactionId === 'rxn_zz-gen') as HTMLElement;
    expect(within(general).getByText('2 examples')).toBeTruthy();
    expect(rows.filter((row) => row.parentElement?.closest('li[data-reaction-id]') === null).map((row) => row.dataset.reactionId)).not.toContain('rxn_zz-one');
  });
});
