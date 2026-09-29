/**
 * Legacy `normPart`, `normCompound`, `normReaction` and `normalizeData` (v6 script lines 1-294): the v4 → v5 conversion and
 * the v5 normalisation are one idempotent-looking pass in v6, and this is that pass as pure TypeScript, quirks included.
 * Unknown fields survive on compounds, reactions, `conditions`, `transformation`, `mechanism` and `jee` (they are copied
 * with `Object.assign` semantics); a participant is REBUILT from its six known fields, so an unknown field on a participant
 * does not survive (`findDroppedLeaves` reports it). Nested unknown values are shared with the input, never mutated.
 *
 * Departures from v6, all deliberate and reported, never silent:
 * - a record without an `id` gets a deterministic placeholder (`c-missing-<n>` / `r-missing-<n>`) instead of `Math.random`
 *   (INV determinism); the placeholder is listed in `assignedIds`;
 * - where v6 would throw a TypeError or build garbage from a non-object (a compound that is `null`, a participant that is a
 *   string, a compound with no text `name` that a reagent name must be matched against), the port refuses with a value.
 */
import { autofillConditionFlags } from './conditions';
import { fgId } from './fg-registry';
import { conditionTextOf, createCompoundNameLookup, LEGACY_REACTION_KEYS, migrateLegacy, type CompoundNameLookup } from './migrate';
import { arr, assignOwn, field, isObj, lines, list, LegacyRefusal, or, type LegacyObject } from './text';

export const LEGACY_V5_SCHEMA_VERSION = 5;

const ROLE_IDS = ['substrate', 'reactant', 'reagent', 'catalyst', 'solvent', 'workup', 'product', 'byproduct', 'intermediate', 'spectator'] as const;
/** A plain object on purpose: v6 asks `ROLE_ORDER[role] !== undefined`, so inherited keys such as `toString` count as roles. */
const ROLE_ORDER: Record<string, number> = Object.fromEntries(ROLE_IDS.map((id, index) => [id, index]));
const NODE_TYPES: readonly unknown[] = ['auto', 'major', 'branched', 'sub'];

const asObject = (value: unknown, path: string): LegacyObject => {
  if (!isObj(value) || Array.isArray(value)) {
    throw new LegacyRefusal('INVALID_RECORD', `${path} is not an object (v6 would throw or build garbage from it); nothing was converted`, path);
  }
  return value;
};

/** Legacy `normPart`. */
function normPart(p: LegacyObject): LegacyObject {
  return {
    ref: or(p.ref, ''),
    label: or(p.label, ''),
    role: Reflect.get(ROLE_ORDER, String(p.role)) !== undefined ? p.role : 'reagent',
    major: Boolean(p.major),
    note: or(p.note, ''),
    image: or(p.image, ''),
  };
}

/** Legacy `normCompound`; `idFor` supplies the placeholder when the compound has no (or a falsy) id. */
function normCompound(c: LegacyObject, idFor: () => string): LegacyObject {
  const base: LegacyObject = {
    tags: [], image: '', smiles: '', formula: '', properties: '', node: true, functionalGroups: [], compoundClass: '', acidBase: '', aromaticity: '', stereo: '',
    nodeType: 'auto', genericFormula: '', fgId: '',
  };
  const out = assignOwn(base, c);
  out.id = out.id ? out.id : idFor();
  out.tags = list(out.tags);
  out.functionalGroups = list(out.functionalGroups).map((group) => fgId(group));
  out.node = c.node !== false;
  out.nodeType = NODE_TYPES.includes(out.nodeType) ? out.nodeType : 'auto';
  out.genericFormula = or(out.genericFormula, '');
  out.fgId = out.fgId ? fgId(out.fgId) : '';
  out.jee = assignOwn({ level: '', notes: '' }, isObj(c.jee) ? c.jee : {});
  return out;
}

/** Legacy `normReaction`. */
function normReaction(r: LegacyObject, lookup: CompoundNameLookup, idFor: () => string, path: string): LegacyObject {
  const legacy = !Array.isArray(r.participants);
  let participants: LegacyObject[];
  let conditionText: unknown;
  if (!legacy) {
    participants = (r.participants as unknown[]).map((p, index) => normPart(asObject(p, `${path}.participants[${index}]`)));
    conditionText = conditionTextOf(r);
  } else {
    const migrated = migrateLegacy(r, lookup);
    participants = migrated.participants;
    conditionText = migrated.conditionText;
  }
  const rest = assignOwn<LegacyObject>({}, r);
  for (const key of LEGACY_REACTION_KEYS) Reflect.deleteProperty(rest, key);

  let tf: unknown = isObj(r.transformation) ? r.transformation : null;
  if (!tf) {
    const parts = String(or(r.pattern, '')).split('→');
    tf = { from: (parts[0] ?? '').trim(), to: parts.slice(1).join('→').trim() };
  }
  const jee = isObj(r.jee) ? r.jee : {};
  const conditionBase: LegacyObject = { text: '', temperature: '', medium: '', phase: '', strength: '', heat: false, light: false, pressure: '', atmosphere: '', anhydrous: false };
  const conditionRaw = assignOwn(conditionBase, isObj(r.conditions) ? r.conditions : {}, { text: conditionText });

  const out = assignOwn(rest, {
    id: r.id ? r.id : idFor(),
    name: or(r.name, 'Untitled reaction'),
    namedReaction: or(r.namedReaction, ''),
    image: or(r.image, ''),
    participants,
    conditions: autofillConditionFlags(conditionRaw),
    transformation: assignOwn(assignOwn({}, tf), {
      from: or(field(tf, 'from'), ''),
      to: or(field(tf, 'to'), ''),
      fgFrom: list(field(tf, 'fgFrom')).map((group) => fgId(group)),
      fgTo: list(field(tf, 'fgTo')).map((group) => fgId(group)),
      bondChanges: or(field(tf, 'bondChanges'), ''),
    }),
    mechanism: assignOwn(assignOwn({}, isObj(r.mechanism) ? r.mechanism : {}), {
      type: or(field(r.mechanism, 'type'), ''),
      summary: or(field(r.mechanism, 'summary'), or(r.mech, '')),
    }),
    reactionType: or(r.reactionType, ''),
    reactionFamily: or(r.reactionFamily, ''),
    reagentFamily: or(r.reagentFamily, or(r.family, '')),
    chapter: or(r.chapter, 'Uncategorised'),
    tags: list(r.tags),
    jee: assignOwn(assignOwn({}, jee), {
      relevance: or(jee.relevance, ''),
      difficulty: Number(jee.difficulty) || 0,
      traps: lines(jee.traps),
      prerequisites: list(jee.prerequisites),
      concepts: list(jee.concepts),
    }),
    relatedReactions: arr(r.relatedReactions),
    collapseIntermediates: r.collapseIntermediates !== undefined ? Boolean(r.collapseIntermediates) : r.collapse !== false,
  });
  // The audit trail of the original text, kept for v4 reactions only.
  if (legacy) out._v4 = { reagent: or(r.reagent, ''), extra: or(r.extra, ''), condition: or(r.condition, '') };
  const products = participants.filter((p) => p.role === 'product');
  const firstProduct = products[0];
  if (firstProduct !== undefined && !products.some((p) => p.major)) firstProduct.major = true;
  return out;
}

export interface NormalizedLegacy {
  readonly data: LegacyObject & { readonly compounds: readonly LegacyObject[]; readonly reactions: readonly LegacyObject[] };
  /** Where an `id` was missing and a deterministic placeholder was assigned (v6 used `Math.random`). */
  readonly assignedIds: readonly { readonly path: string; readonly id: string }[];
}

/** A placeholder that no record of that kind already uses: `<prefix>-missing-<position>`, bumped until free. */
function placeholderIds(prefix: string, records: readonly LegacyObject[]): (index: number) => string {
  const used = new Set(records.filter((record) => record.id).map((record) => String(record.id)));
  return (index) => {
    let n = index + 1;
    while (used.has(`${prefix}-missing-${n}`)) n += 1;
    const id = `${prefix}-missing-${n}`;
    used.add(id);
    return id;
  };
}

/** Legacy `normalizeData(raw)`. Throws `LegacyRefusal` (caught by `normalizeLegacyData`) where v6 would throw or misread. */
export function normalizeData(raw: LegacyObject): NormalizedLegacy {
  const assignedIds: { path: string; id: string }[] = [];
  const rawCompounds = arr(raw.compounds).map((c, index) => asObject(c, `compounds[${index}]`));
  const compoundId = placeholderIds('c', rawCompounds);
  const compounds = rawCompounds.map((c, index) =>
    normCompound(c, () => {
      const id = compoundId(index);
      assignedIds.push({ path: `compounds[${index}].id`, id });
      return id;
    }),
  );
  const lookup = createCompoundNameLookup(compounds);
  const rawReactions = arr(raw.reactions).map((r, index) => asObject(r, `reactions[${index}]`));
  const reactionId = placeholderIds('r', rawReactions);
  const reactions = rawReactions.map((r, index) =>
    normReaction(
      r,
      lookup,
      () => {
        const id = reactionId(index);
        assignedIds.push({ path: `reactions[${index}].id`, id });
        return id;
      },
      `reactions[${index}]`,
    ),
  );
  const data = assignOwn({}, raw, { schemaVersion: LEGACY_V5_SCHEMA_VERSION, compounds, reactions }) as NormalizedLegacy['data'];
  return { data, assignedIds };
}
