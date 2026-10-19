/** The participant recipes (step 6.3a decision D2), over a real demo reaction with two stages. */
import { produce } from 'immer';
import { must } from '@/test-support/state-fixture';
import { describe, expect, it } from 'vitest';
import { reorderItems } from '@/core/commands/builders';
import type { DraftRecipe } from '@/core/editing';
import type { Reaction } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import {
  addParticipant,
  moveParticipant,
  participantsViewOf,
  removeParticipant,
  setCoefficient,
  setDry,
  setFlag,
  setParticipantRef,
  setParticipantStage,
  setPhase,
  setPrimary,
  setProfile,
  setQuantityPart,
  variantUsing,
} from './participant-model';

const state = demoState();
const GRIGNARD = state.records.reaction['rxn_methylmgbr-ethanal' as never] as Reaction;
const apply = (draft: Reaction, ...recipes: DraftRecipe[]): Reaction => produce(draft, (d) => void recipes.forEach((recipe) => recipe(d as never))) as Reaction;
const ids = (r: Reaction): string[] => r.participants.map((p) => p.id);

describe('participant recipes', () => {
  it('the Grignard demo has two stages and every participant in exactly one', () => {
    expect(GRIGNARD.stages).toHaveLength(2);
    const view = participantsViewOf(GRIGNARD);
    expect(view.every((p) => p.stageIndex >= 0)).toBe(true);
  });

  it('moving is an exact permutation, the same result as the reorder builder', () => {
    const moved = apply(GRIGNARD, moveParticipant(0, 1));
    const order = ids(moved);
    expect([...order].sort()).toEqual([...ids(GRIGNARD)].sort());
    const built = reorderItems(state, { ref: { kind: 'reaction', id: GRIGNARD.id }, field: 'participants', orderedIds: order });
    expect(built.ok).toBe(true);
    const update = built.ok ? built.envelope.commands[0] : undefined;
    expect(update?.type === 'record.update' && (update.record as Reaction).participants).toEqual(moved.participants);
    // the builder refuses what is not a permutation; the recipe cannot make one
    expect(reorderItems(state, { ref: { kind: 'reaction', id: GRIGNARD.id }, field: 'participants', orderedIds: order.slice(1) }).ok).toBe(false);
    // at an end it does nothing
    expect(ids(apply(GRIGNARD, moveParticipant(0, -1)))).toEqual(ids(GRIGNARD));
    expect(ids(apply(GRIGNARD, moveParticipant(GRIGNARD.participants.length - 1, 1)))).toEqual(ids(GRIGNARD));
    // reordering changes no stage list
    expect(apply(GRIGNARD, moveParticipant(0, 1)).stages).toEqual(GRIGNARD.stages);
  });

  it('a new participant starts with the chosen role, a fresh ID, and the FIRST stage when stages exist', () => {
    const next = apply(GRIGNARD, addParticipant('prt_new-one', { kind: 'species', id: 'spc_propanone' }, 'solvent'));
    const added = next.participants.at(-1);
    expect(added).toEqual({ id: 'prt_new-one', ref: { kind: 'species', id: 'spc_propanone' }, role: 'solvent' });
    expect(next.stages[0]?.participantIds).toContain('prt_new-one');
    expect(next.stages[1]?.participantIds).not.toContain('prt_new-one');
    const bare = apply({ ...GRIGNARD, stages: [] } as Reaction, addParticipant('prt_new-one', { kind: 'species', id: 'spc_propanone' }, 'reactant'));
    expect(bare.stages).toEqual([]);
  });

  it('removing a participant takes its ID out of every stage list', () => {
    const victim = must(GRIGNARD.participants[0]).id;
    const next = apply(GRIGNARD, removeParticipant(0));
    expect(ids(next)).not.toContain(victim);
    expect(next.stages.every((s) => !s.participantIds.includes(victim))).toBe(true);
  });

  it('a participant a condition variant names is NOT removed (the form says why)', () => {
    const victim = must(GRIGNARD.participants[0]).id;
    const withVariant = { ...GRIGNARD, conditionVariants: [{ id: 'cvr_x', label: '443 K', parameters: { solventCharacter: [], activation: [], other: [], parsedFields: [] }, participantIds: [victim] }] } as unknown as Reaction;
    expect(variantUsing(withVariant, victim)).toBe('443 K');
    expect(ids(apply(withVariant, removeParticipant(0)))).toEqual(ids(withVariant));
  });

  it('the stage setter moves the ID between lists: exactly one stage', () => {
    const p = must(GRIGNARD.participants[0]).id;
    const from = must(participantsViewOf(GRIGNARD)[0]).stageIndex;
    const to = from === 0 ? 1 : 0;
    const next = apply(GRIGNARD, setParticipantStage(p, to));
    expect(next.stages.filter((s) => s.participantIds.includes(p))).toHaveLength(1);
    expect(must(participantsViewOf(next)[0]).stageIndex).toBe(to);
    expect(apply(GRIGNARD, setParticipantStage(p, 9)).stages).toEqual(GRIGNARD.stages);
  });

  it('optional fields: an empty value removes the key; quantity and flags go when nothing is left', () => {
    const base = apply(GRIGNARD, setCoefficient(0, 2), setPhase(0, 'aq'), setDry(0, true), setPrimary(0, true), setQuantityPart(0, 'equivalents', 1.5), setQuantityPart(0, 'text', 'a little'), setFlag(0, 'consumed', 'no'));
    const p = must(base.participants[0]);
    expect(p).toMatchObject({ coefficient: 2, phase: 'aq', dry: true, isPrimarySubstrate: true, quantity: { equivalents: 1.5, text: 'a little' }, flags: { consumed: false } });
    const cleared = apply(base, setCoefficient(0, undefined), setPhase(0, ''), setDry(0, false), setQuantityPart(0, 'equivalents', undefined), setQuantityPart(0, 'text', ''), setFlag(0, 'consumed', 'default'));
    const q = must(cleared.participants[0]);
    for (const key of ['coefficient', 'phase', 'dry', 'quantity', 'flags']) expect(Object.hasOwn(q, key)).toBe(false);
    expect(must(participantsViewOf(base)[0]).flags).toEqual({ contributesAtoms: 'default', consumed: 'no', catalytic: 'default' });
  });

  it('changing the substance clears the reagent profile unless it is the same reagent', () => {
    const withProfile = apply(GRIGNARD, setParticipantRef(0, { kind: 'reagent', id: 'rgt_x' }), setProfile(0, 'rpf_one'));
    expect(must(withProfile.participants[0]).profileId).toBe('rpf_one');
    expect(apply(withProfile, setParticipantRef(0, { kind: 'reagent', id: 'rgt_x' })).participants[0]?.profileId).toBe('rpf_one');
    expect(Object.hasOwn(must(apply(withProfile, setParticipantRef(0, { kind: 'reagent', id: 'rgt_y' })).participants[0]), 'profileId')).toBe(false);
    expect(Object.hasOwn(must(apply(withProfile, setParticipantRef(0, { kind: 'species', id: 'spc_propanone' })).participants[0]), 'profileId')).toBe(false);
  });
});
