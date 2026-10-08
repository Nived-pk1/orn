/**
 * The Scene's ports over one state snapshot (step 5.5a, item f): `describe` (name, formula, charge as plain text), `arrowTextOf`
 * through the core producer, `depictionKeyOf` (undefined until step 5.5a part 3). Everything is read from the state it is given;
 * the lookups that need a scan (schemes by reaction, records never drawn as nodes) are built once per snapshot, on first use.
 */
import { arrowTextOf } from '@/core/graph';
import type { CanonicalState, Reaction, ReactionScheme, RecordRef } from '@/core/schema';
import type { ScenePorts } from '@/render/scene';

type Loose = Readonly<Record<string, unknown>>;
type Described = NonNullable<ReturnType<ScenePorts['describe']>>;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

function nameOf(record: Loose): string {
  const names = record.names as Loose | undefined;
  return text(names?.display) ?? text(names?.canonical) ?? text(record.id) ?? '';
}

function formulaOf(record: Loose): string | undefined {
  const generic = record.generic as Loose | undefined;
  return text(record.formula) ?? text(record.formulaText) ?? text(generic?.formulaText) ?? text(generic?.generalFormula);
}

export function createScenePorts(state: CanonicalState): ScenePorts {
  const recordOf = (ref: RecordRef): Loose | undefined => (state.records[ref.kind] as Readonly<Record<string, Loose>>)[ref.id];
  const describe: ScenePorts['describe'] = (ref) => {
    const record = recordOf(ref);
    if (record === undefined) return undefined;
    const formula = formulaOf(record);
    const charge = typeof record.charge === 'number' ? record.charge : undefined;
    const described: Described = { name: nameOf(record), ...(formula === undefined ? {} : { formula }), ...(charge === undefined ? {} : { charge }) };
    return described;
  };
  let schemes: Map<string, ReactionScheme[]> | undefined;
  const schemesOf = (reactionId: string): readonly ReactionScheme[] => {
    if (schemes === undefined) {
      schemes = new Map();
      for (const scheme of Object.values(state.records.reaction_scheme)) {
        const list = schemes.get(scheme.reactionId);
        if (list === undefined) schemes.set(scheme.reactionId, [scheme]);
        else list.push(scheme);
      }
    }
    return schemes.get(reactionId) ?? [];
  };
  let never: Set<string> | undefined;
  const shownAsNode = (ref: RecordRef): boolean => {
    if (never === undefined) {
      never = new Set();
      for (const display of Object.values(state.records.entity_display)) if (display.showAsNode === 'never') never.add(`${display.target.kind}:${display.target.id}`);
    }
    return !never.has(`${ref.kind}:${ref.id}`);
  };
  return {
    describe,
    depictionKeyOf: () => undefined,
    arrowTextOf(edge) {
      if (edge.reactionId === undefined) return undefined;
      const reaction: Reaction | undefined = state.records.reaction[edge.reactionId];
      if (reaction === undefined) return undefined;
      return arrowTextOf(reaction, {
        schemes: schemesOf(reaction.id),
        conditionVariantIds: edge.conditionVariantIds,
        ...(edge.participantId === undefined ? {} : { carriedParticipantId: edge.participantId }),
        describe,
        shownAsNode,
      });
    },
  };
}
