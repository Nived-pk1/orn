/**
 * Examples fold under their general reaction on a family page (7.3a C1 to C3): per group, the example is not a card of its own, the
 * general card carries it, the counts are cards with the folded examples counted apart, and an example whose general reaction is in
 * another group stays a card that says what it is an example of. Tests written first (seen red: the fields did not exist).
 */
import { describe, expect, it } from 'vitest';
import { familyStudy, type FamilyStudy } from '..';
import { demoState } from '@/test-support/app-boot-kit';
import { anchorOn, chemClass, cl, contextOf, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import type { AnyRecord, RecordRef } from '../../schema';

describe('the demo: the PCC oxidation and its example', () => {
  const study = familyStudy(contextOf(demoState()), 'cls_alcohols') as FamilyStudy;
  const aldehydes = study.reactionsOf.groups.find((g) => g.name === 'Aldehydes');

  it('the general oxidation carries the ethanol example; the example is not a card', () => {
    const general = aldehydes?.cards.find((c) => (c.examples ?? []).length > 0);
    expect(general?.reactionId).toBe('rxn_alcohol1-to-aldehyde-pcc');
    expect(general?.examples?.map((c) => c.reactionId)).toEqual(['rxn_ethanol-to-ethanal-pcc']);
    expect(aldehydes?.cards.map((c) => c.reactionId)).not.toContain('rxn_ethanol-to-ethanal-pcc');
    expect(aldehydes?.exampleCount).toBe(1);
  });

  it('counts are cards, the example is counted apart', () => {
    expect(study.reactionsOf.exampleCount).toBe(1);
    expect(study.counts.examples).toBe(1);
  });
});

describe('small states', () => {
  const rec = (r: { kind: RecordRef['kind']; id: string }): RecordRef => ({ kind: r.kind, id: r.id });
  const classes = ['hub-a', 'hub-b'].flatMap((h) => [chemClass(h, h, 'compound_class'), anchorOn(rec(cl(h)), h)]) as AnyRecord[];
  const members = ['hub-a', 'hub-b'].flatMap((h) => [1, 2].map((n) => species(`${h}-${n}`, `${h}-${n}`, { classes: [h] }))) as AnyRecord[];
  const rx = (slug: string, name: string, scope: 'generic' | 'specific', to: string, instanceOf?: string): AnyRecord =>
    reaction({ slug, name, scope, ...(instanceOf === undefined ? {} : { instanceOf }), participants: [{ ref: sp('hub-a-1'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp(`${to}-2`) }] }] });
  const ctx = contextOf(
    stateOf(...classes, ...members, rx('gen', 'General', 'generic', 'hub-b'), rx('ex-one', 'Example one', 'specific', 'hub-b', 'gen'), rx('ex-two', 'Example two', 'specific', 'hub-b', 'gen'), rx('ex-else', 'Example elsewhere', 'specific', 'hub-a', 'gen')),
  );
  const s = familyStudy(ctx, 'cls_hub-a') as FamilyStudy;
  const toB = s.reactionsOf.groups.find((g) => g.hubId === 'cls_hub-b');
  const toA = s.reactionsOf.groups.find((g) => g.hubId === 'cls_hub-a');

  it('C1: in the group that shows the general card, the examples fold under it in folded-name order', () => {
    expect(toB?.cards.map((c) => c.name)).toEqual(['General']);
    expect(toB?.cards[0]?.examples?.map((c) => c.name)).toEqual(['Example one', 'Example two']);
    expect(toB?.exampleCount).toBe(2);
  });

  it('C2: an example whose general card is in another group is a card of its own and says what it is an example of', () => {
    expect(toA?.cards.map((c) => c.name)).toEqual(['Example elsewhere']);
    expect(toA?.cards[0]?.exampleOf).toEqual({ reactionId: 'rxn_gen', name: 'General' });
    expect(toA?.cards[0]?.examples).toBeUndefined();
  });

  it('C3: counts are distinct cards; examples counted apart; nothing is lost', () => {
    expect(s.reactionsOf.reactionCount).toBe(2); // General, Example elsewhere
    expect(s.reactionsOf.exampleCount).toBe(2); // Example one, Example two
    expect(s.counts).toMatchObject({ reactionsOf: 2, total: 2, examples: 2 });
  });
});
