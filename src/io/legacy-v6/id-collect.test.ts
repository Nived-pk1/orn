/**
 * Step 3.10: every legacy value is registered with the ID space BEFORE mapping (compound IDs including the ones only reactions refer to,
 * label remainders, concept / named-reaction / topic texts, related pairs, functional-group and `compoundClass` texts), and the two
 * class-ID rows added to §4.2 (`cls_v6-fg-<part>`, `cls_v6-l-<slug>-<hash6>`).
 */
import { describe, expect, it } from 'vitest';
import { hash64 } from '@/core/hash';
import { ClassIdSchema } from '@/core/schema';
import { legacyFixture, legacyTestFixture } from '@/test-support/legacy-kit';
import { createDocumentIds } from './id-collect';
import { createLegacyIdSpace } from './id-space';
import { normalizeLegacyData } from './index';

const h6 = (text: string): string => hash64(text).slice(0, 6);
const document = (compounds: unknown[], reactions: unknown[] = []) => {
  const n = normalizeLegacyData({ schemaVersion: 5, compounds, reactions });
  if (!n.ok) throw new Error(n.message);
  return createDocumentIds(n.data);
};

describe('the class-ID rows added in step 3.10 (docs/MIGRATION.md §4.2)', () => {
  const space = createLegacyIdSpace({ functionalGroups: ['1-alcohol', 'alkene', 'Mystery Group'], classTexts: ['Long-Chain Fatty Acid', 'long chain fatty acid', 'other class'] });

  it('a functional-group class is cls_v6-fg-<part>: the id itself when v6 already wrote it in [0-9a-z-], else sanitised with a hash', () => {
    expect(space.functionalGroupClassId('1-alcohol')).toBe('cls_v6-fg-1-alcohol');
    expect(space.functionalGroupClassId('alkene')).toBe('cls_v6-fg-alkene');
    expect(space.functionalGroupClassId('Mystery Group')).toBe(`cls_v6-fg-mystery-group-${h6('Mystery Group')}`);
  });

  it('a class made from a compoundClass text is cls_v6-l-<slug>-<hash6> of the FOLDED text, one per folded text', () => {
    const id = space.classFromTextId('Long-Chain Fatty Acid');
    expect(id).toBe(`cls_v6-l-long-chain-fatty-acid-${h6('long chain fatty acid')}`);
    expect(space.classFromTextId('long chain fatty acid')).toBe(id);
    expect(space.classFromTextId('other class')).not.toBe(id);
  });

  it('both kinds are valid class IDs; asking for an unregistered value is a programmer error', () => {
    for (const id of [space.functionalGroupClassId('alkene'), space.functionalGroupClassId('Mystery Group'), space.classFromTextId('other class')]) expect(ClassIdSchema.safeParse(id).success, id).toBe(true);
    expect(() => space.functionalGroupClassId('never registered')).toThrow(/was not registered/);
    expect(() => space.classFromTextId('never registered')).toThrow(/was not registered/);
  });
});

describe('createDocumentIds registers every value first', () => {
  const reactions = [
    {
      id: 'r1',
      participants: [
        { ref: 'c1', role: 'substrate' },
        { ref: 'c404', role: 'reactant' }, // only a reaction refers to it (dangling)
        { ref: '', label: 'aq. KOH', role: 'reagent' },
        { ref: '', label: '443 K', role: 'reagent' }, // a temperature: never a participant
        { ref: '', label: 'dil. HCl', role: 'reagent' },
      ],
      reactionType: 'addition',
      reactionFamily: 'Family',
      mechanism: { type: 'E2', summary: '' },
      jee: { prerequisites: ['Acidity'], concepts: ['addition', 'Carbocation'] },
      namedReaction: 'Wurtz reaction',
      chapter: 'Hydrocarbons',
      relatedReactions: ['r2', 'r1', 'r9'],
    },
    { id: 'r2', participants: [], chapter: 'Uncategorised', relatedReactions: ['r1'] },
  ];
  const documentIds = document([{ id: 'c1', name: 'A', fgId: 'alkene', compoundClass: 'Some class' }], reactions);
  const { ids } = documentIds;

  it('compound IDs, including a compound only reactions refer to', () => {
    expect(ids.speciesId('c1')).toBe('spc_v6-c1');
    expect(ids.speciesId('c404')).toBe('spc_v6-c404');
    expect(ids.classId('c404')).toBe('cls_v6-c404');
    expect(() => ids.speciesId('c405')).toThrow(/was not registered/);
  });

  it('label remainders of label-only participants (tokens taken out); a temperature label is not a label', () => {
    expect(ids.reagentFromLabelId('KOH')).toBe(`rgt_v6-l-koh-${h6('koh')}`);
    expect(ids.speciesFromLabelId('HCl')).toBe(`spc_v6-l-hcl-${h6('hcl')}`);
    expect(() => ids.reagentFromLabelId('443 K')).toThrow();
    expect(() => ids.reagentFromLabelId('aq. KOH')).toThrow(); // registered as the remainder, not the whole label
  });

  it('concept, named-reaction and topic texts; "Uncategorised" gets no topic', () => {
    for (const [text, kind] of [['addition', 'reaction_type'], ['Family', 'reaction_family'], ['E2', 'mechanism_class'], ['Acidity', undefined], ['Carbocation', undefined], ['addition', undefined]] as const) expect(() => ids.conceptId(text, kind), text).not.toThrow();
    expect(ids.conceptId('ADDITION', 'reaction_type')).toBe(ids.conceptId('addition', 'reaction_type'));
    expect(ids.conceptId('addition', 'reaction_type')).not.toBe(ids.conceptId('addition')); // kind-qualified key (step 3.11b review)
    expect(() => ids.conceptId('E2')).toThrow(); // registered under its kind only
    expect(ids.namedReactionId('Wurtz reaction')).toMatch(/^nrx_v6-wurtz-reaction-/);
    expect(ids.topicId('Hydrocarbons')).toMatch(/^top_v6-hydrocarbons-/);
    expect(() => ids.topicId('Uncategorised')).toThrow();
  });

  it('related pairs of reactions that exist, one per unordered pair; a pair naming a missing reaction is not registered', () => {
    expect(ids.relatedReactionId('r1', 'r2')).toBe('rel_v6-r1-r2');
    expect(ids.relatedReactionId('r2', 'r1')).toBe('rel_v6-r1-r2');
    expect(() => ids.relatedReactionId('r1', 'r9')).toThrow();
  });

  it('functional-group ids and compoundClass texts that may become classes', () => {
    expect(ids.functionalGroupClassId('alkene')).toBe('cls_v6-fg-alkene');
    expect(ids.classFromTextId('Some class')).toMatch(/^cls_v6-l-some-class-/);
  });

  it('a repeated compound id gets its own key and is never merged; non-text ids are keyed by their JSON', () => {
    const repeated = document([{ id: 'c1', name: 'A' }, { id: 'c1', name: 'B' }, { id: 7, name: 'C' }, { id: '7', name: 'D' }]);
    expect(repeated.compoundKeys).toEqual(['c1', 'c1\u00002', '7', '7\u00002']);
    expect(new Set(repeated.compoundKeys.map((key) => repeated.ids.speciesId(key))).size).toBe(4);
    expect(repeated.compoundKeyOfId.get('c1')).toBe('c1');
  });

  it('is independent of the order of the compounds (same values, same IDs)', () => {
    const a = document([{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }, { id: 'c3', name: 'C' }]);
    const b = document([{ id: 'c3', name: 'C' }, { id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }]);
    for (const id of ['c1', 'c2', 'c3']) expect(a.ids.speciesId(id)).toBe(b.ids.speciesId(id));
  });
});

describe('over the real fixtures: nothing the mapper will ask for is unregistered', () => {
  it.each([
    ['v6-demo-export.json', () => legacyFixture('v6-demo-export.json')],
    ['v4-sample.json', () => legacyFixture('v4-sample.json')],
    ['quirks.json', () => legacyTestFixture('quirks.json')],
  ])('%s', (_name, input) => {
    const n = normalizeLegacyData(structuredClone(input()));
    if (!n.ok) throw new Error(n.message);
    const documentIds = createDocumentIds(n.data);
    const { ids } = documentIds;
    n.data.compounds.forEach((_c, i) => {
      const key = documentIds.compoundKeys[i] as string;
      expect(() => [ids.speciesId(key), ids.classId(key), ids.anchorId(key), ids.displayId(key)]).not.toThrow();
    });
    n.data.reactions.forEach((reaction, i) => {
      expect(() => ids.reactionId(documentIds.reactionKeys[i] as string)).not.toThrow();
      for (const participant of (reaction.participants ?? []) as { ref?: string }[]) if (participant.ref) expect(() => ids.speciesId(typeof participant.ref === 'string' ? participant.ref : JSON.stringify(participant.ref))).not.toThrow();
    });
    expect(ids.collisions).toEqual([]);
  });
});
