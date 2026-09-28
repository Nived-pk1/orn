/**
 * Incremental validation ≡ full validation. After every random edit, the finding store maintained by
 * `scopeOf` + `validateTouched` + `commitFindings` must equal a fresh `validateAll` (the finding-level
 * analogue of INV-18). The edits aim at every rule family: names, hierarchies, references, nested IDs,
 * relationships, routes, duplicates, lifecycle and rich-text links, including deletes and re-creations.
 */
import { describe, expect, it } from 'vitest';
import { coreIndexEngine } from '../indexes/engine';
import type { CanonicalState, RecordKind, RecordRef } from '../schema';
import { commit, loadFixtureState, must, remove, type Tables } from '../../test-support/state-fixture';
import type { Finding } from './contracts';
import { createFindingStore } from './store';
import { commitFindings, commitTouched, validator } from './validator';

/** Deep copy that also works on Immer drafts. */
const dup = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type Loose = Record<string, unknown>;
type Recipe = (t: Tables) => void;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canon = (findings: readonly Finding[]): string[] => findings.map((f) => JSON.stringify(f)).sort();
const base = loadFixtureState('maximal-valid');
const REVIEWED: readonly RecordKind[] = ['species', 'class', 'reaction', 'reagent', 'concept', 'route', 'relationship', 'caveat', 'exam_version', 'topic', 'mechanism', 'named_reaction', 'transformation', 'reference', 'asset', 'topic_mapping', 'exam_relevance'];

class Walk {
  readonly graveyard: { readonly kind: RecordKind; readonly record: unknown }[] = [];
  private counter = 0;
  constructor(private snapshot: CanonicalState, readonly rng: () => number) {}

  get current(): CanonicalState {
    return this.snapshot;
  }
  set current(next: CanonicalState) {
    this.snapshot = next;
  }
  /** The state the mutation being planned will run against. */
  state(): CanonicalState {
    return this.snapshot;
  }
  int(n: number): number {
    return Math.floor(this.rng() * n);
  }
  pick<T>(items: readonly T[]): T | undefined {
    return items.length === 0 ? undefined : items[this.int(items.length)];
  }
  subset<T>(items: readonly T[], max: number): T[] {
    return Array.from({ length: this.int(max + 1) }, () => this.pick(items)).filter((x): x is T => x !== undefined);
  }
  ids(kind: RecordKind): string[] {
    return Object.keys(this.snapshot.records[kind]);
  }
  fresh(prefix: string): string {
    this.counter += 1;
    return `${prefix}_gen-${this.counter}`;
  }
  ref(kind: RecordKind): { kind: RecordKind; id: string } | undefined {
    const id = this.pick(this.ids(kind));
    return id === undefined ? undefined : { kind, id };
  }
}

const rec = (t: Tables, kind: RecordKind, id: string): Loose => t[kind][id] as Loose;
const list = (value: unknown): Loose[] => (Array.isArray(value) ? (value as Loose[]) : []);

const setRole = (w: Walk): Recipe | undefined => {
    const id = w.pick(w.ids('reaction'));
    if (id === undefined) return undefined;
    const role = w.pick(['reactant', 'reagent', 'catalyst', 'solvent', 'spectator', 'workup_reagent'] as const);
    const flags = w.pick([undefined, { contributesAtoms: true }, { consumed: true }, { contributesAtoms: true }]);
    const role2 = w.rng() < 0.4 ? 'spectator' : role;
    return (t) => {
      const p = list(rec(t, 'reaction', id)['participants'])[0];
      if (p === undefined) return;
      p['role'] = role2;
      if (flags === undefined) delete p['flags'];
      else p['flags'] = flags;
    };
  };
const addRelationship = (w: Walk): Recipe | undefined => {
    const type = w.pick(['prerequisite_of', 'prerequisite_of', 'prerequisite_of', 'reverse_of', 'follows', 'related_to', 'alternative_to'] as const);
    const kinds = type === 'prerequisite_of' ? (['concept'] as const) : (['reaction'] as const);
    const from = w.ref(kinds[0]);
    const to = w.rng() < 0.1 ? from : w.ref(kinds[0]);
    if (type === undefined || from === undefined || to === undefined) return undefined;
    const id = w.fresh('rel');
    const source = must(base.records.relationship['rel_max-dehydration-hydration'], 'the fixture relationship');
    return (t) => {
      const copy = dup(source) as unknown as Loose;
      Object.assign(copy, { id, type, from, to });
      if (type === 'reverse_of') copy['reverseKind'] = w.pick(['microscopic', 'synthetic']);
      else delete copy['reverseKind'];
      t.relationship[id] = copy;
    };
  };
/** Two prerequisite links between two concepts in one commit: a cycle, or half of one. */
const addPrerequisitePair = (w: Walk): Recipe | undefined => {
  const [a, b] = [w.ref('concept'), w.ref('concept')];
  if (a === undefined || b === undefined) return undefined;
  const ids = [w.fresh('rel'), w.fresh('rel')];
  const source = must(base.records.relationship['rel_max-dehydration-hydration'], 'the fixture relationship');
  return (t) => {
    [[a, b], [b, a]].forEach(([from, to], i) => {
      const copy = dup(source) as unknown as Loose;
      Object.assign(copy, { id: ids[i], type: 'prerequisite_of', from, to });
      delete copy['reverseKind'];
      if (i === 0 || w.rng() < 0.8) t.relationship[ids[i] as string] = copy;
    });
  };
};
const setComponents = (w: Walk): Recipe | undefined => {
    const id = w.pick(w.ids('reagent'));
    if (id === undefined) return undefined;
    const comps = w.subset(w.ids('reagent'), 1).concat(w.subset(w.ids('reagent'), 1)).map((rid) => ({ ref: { kind: 'reagent', id: rid }, role: 'active' }));
    return (t) => { rec(t, 'reagent', id)['components'] = comps; };
  };
const addOutcome = (w: Walk): Recipe | undefined => {
  const id = w.pick(w.ids('reaction'));
  if (id === undefined) return undefined;
  const n = w.fresh('out');
  const selectivity = w.pick(['exclusive', 'major', 'minor']);
  const variants = w.rng() < 0.5 ? [] : list((w.state().records.reaction[id] as unknown as Loose)['conditionVariants']).map((v) => v['id']);
  return (t) => {
    const outcomes = list(rec(t, 'reaction', id)['outcomes']);
    const first = outcomes[0];
    if (first === undefined) return;
    const copy = dup(first);
    Object.assign(copy, { id: n, selectivity, conditionVariantIds: variants });
    list(copy['products']).forEach((p, i) => { p['id'] = `pdt_${n.slice(4)}-${i}`; });
    outcomes.push(copy);
  };
};

/** Each mutation returns a recipe, or undefined when it does not apply to the current state. */
const MUTATIONS: readonly ((w: Walk) => Recipe | undefined)[] = [
  (w) => {
    const [a, b] = [w.pick(w.ids('species')), w.pick(w.ids('species'))];
    if (a === undefined || b === undefined) return undefined;
    const name = (w.state().records.species[b] as { names: { canonical: string } }).names.canonical;
    return (t) => { (rec(t, 'species', a)['names'] as Loose)['canonical'] = w.rng() < 0.7 ? name : `Renamed ${w.int(3)}`; };
  },
  (w) => {
    const id = w.pick(w.ids('species'));
    if (id === undefined) return undefined;
    const classes = [...w.subset(w.ids('class'), 3), ...(w.rng() < 0.03 ? ['cls_ghost'] : [])];
    return (t) => { rec(t, 'species', id)['classIds'] = classes; };
  },
  (w) => {
    const id = w.pick(w.ids('class'));
    if (id === undefined) return undefined;
    const parents = w.subset(w.ids('class'), 2);
    return (t) => { rec(t, 'class', id)['parentIds'] = parents; };
  },
  (w) => {
    const id = w.pick(w.ids('class'));
    if (id === undefined) return undefined;
    const examples = w.subset(w.ids('species'), 2);
    return (t) => { rec(t, 'class', id)['exampleSpeciesIds'] = examples; };
  },
  (w) => {
    if (w.rng() < 0.6) return undefined; // deletes create L2 errors that hide L3 rules: keep them rarer
    const kind = w.pick(['species', 'class', 'reaction', 'relationship', 'concept', 'reagent', 'topic', 'entity_display', 'route', 'asset', 'reaction_scheme'] as const);
    const id = kind === undefined ? undefined : w.pick(w.ids(kind));
    if (kind === undefined || id === undefined) return undefined;
    w.graveyard.push({ kind, record: w.state().records[kind][id] });
    return (t) => remove(t, kind, id);
  },
  (w) => {
    const dead = w.pick(w.graveyard);
    if (dead === undefined) return undefined;
    const id = (dead.record as { id: string }).id;
    if (w.state().records[dead.kind][id] !== undefined) return undefined;
    return (t) => { t[dead.kind][id] = dup(dead.record); };
  },
  (w) => {
    const id = w.pick(w.ids('reaction'));
    if (id === undefined) return undefined;
    const selectivity = w.pick(['exclusive', 'major', 'minor', 'trace', 'unspecified']);
    const variants = w.rng() < 0.5 ? [] : list((w.state().records.reaction[id] as unknown as Loose)['conditionVariants']).map((v) => v['id']);
    return (t) => {
      const o = list(rec(t, 'reaction', id)['outcomes'])[0];
      if (o === undefined) return;
      o['selectivity'] = selectivity;
      o['conditionVariantIds'] = variants;
    };
  },
  (w) => {
    const id = w.pick(w.ids('reaction'));
    if (id === undefined) return undefined;
    const other = w.pick(w.ids('reaction'));
    const scope = w.pick(['generic', 'specific']);
    return (t) => {
      const r = rec(t, 'reaction', id);
      r['scope'] = scope;
      if (other !== undefined && w.rng() < 0.6) r['instanceOfId'] = other;
      else delete r['instanceOfId'];
    };
  },
  (w) => {
    const id = w.pick(w.ids('reaction'));
    if (id === undefined) return undefined;
    const kind = w.pick(['equilibrium', 'irreversible', 'unknown']);
    return (t) => { rec(t, 'reaction', id)['reversibility'] = { kind }; };
  },
  (w) => {
    const kind = w.pick(REVIEWED);
    const id = kind === undefined ? undefined : w.pick(w.ids(kind));
    if (kind === undefined || id === undefined) return undefined;
    const lifecycle = w.pick(['draft', 'published']);
    const status = w.pick(['unreviewed', 'review_required', 'verified']);
    return (t) => { Object.assign(rec(t, kind, id)['review'] as Loose, { lifecycle, status, reasons: status === 'review_required' ? ['why'] : [] }); };
  },
  (w) => {
    const id = w.pick(w.ids('relationship'));
    if (id === undefined) return undefined;
    const to = w.ref('concept');
    return (t) => {
      const r = rec(t, 'relationship', id);
      if (to !== undefined && w.rng() < 0.5) r['to'] = to;
      else r['type'] = w.pick(['prerequisite_of', 'related_to']);
    };
  },
  (w) => {
    const id = w.pick(w.ids('route'));
    if (id === undefined) return undefined;
    const reaction = w.pick(w.ids('reaction'));
    const target = w.rng() < 0.5 ? w.ref('species') : w.ref('class');
    const inputs = w.subset(list((w.state().records.route[id] as unknown as Loose)['steps']).map((s) => s['id']), 2);
    return (t) => {
      const r = rec(t, 'route', id);
      const step = list(r['steps'])[w.int(2)];
      if (step !== undefined) {
        step['inputFromStepIds'] = inputs;
        if (reaction !== undefined && w.rng() < 0.5) {
          step['reactionId'] = reaction;
          delete step['outcomeId'];
          delete step['conditionVariantId'];
        }
      }
      if (target !== undefined) r['target'] = target;
    };
  },
  (w) => {
    const kind = w.pick(['species', 'class', 'concept', 'reaction'] as const);
    const id = kind === undefined ? undefined : w.pick(w.ids(kind));
    const links = [w.pick(w.ids('species')), w.pick(w.ids('class')), 'spc_ghost'].filter((x): x is string => x !== undefined);
    if (kind === undefined || id === undefined) return undefined;
    const text = w.rng() < 0.2 ? 'plain text' : `See ${w.subset(links, 2).map((l) => `[[${l}]]`).join(' and ')}.`;
    return (t) => { rec(t, kind, id)['notes'] = text; };
  },
  (w) => {
    const kind = w.pick(['entity_display', 'navigator_anchor', 'topic_mapping', 'exam_relevance'] as const);
    const id = kind === undefined ? undefined : w.pick(w.ids(kind));
    if (kind === undefined || id === undefined) return undefined;
    const prefix = { entity_display: 'edp', navigator_anchor: 'anc', topic_mapping: 'tmp', exam_relevance: 'erl' }[kind];
    const copyId = w.rng() < 0.5 ? w.fresh(prefix) : `${w.fresh(prefix)}z`;
    return (t) => { t[kind][copyId] = { ...dup(t[kind][id]) as Loose, id: copyId, ...(w.rng() < 0.3 ? { scope: 'outside' } : {}) }; };
  },
  (w) => {
    const id = w.pick(w.ids('topic'));
    if (id === undefined) return undefined;
    const parent = w.pick(w.ids('topic'));
    const topicKind = w.pick(['subject', 'chapter', 'section', 'topic', 'subtopic']);
    return (t) => {
      const topic = rec(t, 'topic', id);
      topic['topicKind'] = topicKind;
      if (parent !== undefined && w.rng() < 0.7) topic['parentId'] = parent;
      else delete topic['parentId'];
    };
  },
  (w) => {
    const [a, b] = [w.pick(w.ids('reaction')), w.pick(w.ids('reaction'))];
    if (a === undefined || b === undefined) return undefined;
    const donor = list((w.state().records.reaction[b] as unknown as Loose)['participants'])[0];
    if (donor === undefined) return undefined;
    const shared = donor['id'];
    return (t) => {
      const p = list(rec(t, 'reaction', a)['participants'])[0];
      if (p !== undefined) p['id'] = shared;
    };
  },
  (w) => {
    const id = w.pick(w.ids('reaction'));
    const ref = w.rng() < 0.5 ? w.ref('species') : w.ref('class');
    if (id === undefined || ref === undefined) return undefined;
    const product = w.rng() < 0.5;
    return (t) => {
      const r = rec(t, 'reaction', id);
      const target = product ? list(list(r['outcomes'])[0]?.['products'])[0] : list(r['participants'])[0];
      if (target !== undefined) target['ref'] = ref;
    };
  },
  (w) => {
    const id = w.pick(w.ids('exam_version'));
    if (id === undefined) return undefined;
    const status = w.pick(['official', 'provisional', 'draft']);
    const from = w.pick(['2026-01-01', '2027-01-01']);
    const to = w.pick(['2026-06-01', '2025-06-01']);
    return (t) => { Object.assign(rec(t, 'exam_version', id), { status, effectiveFrom: from, effectiveTo: to }); };
  },
  (w) => {
    const id = w.pick(w.ids('mechanism'));
    if (id === undefined) return undefined;
    return (t) => {
      for (const variant of list(rec(t, 'mechanism', id)['variants'])) for (const step of list(variant['steps'])) step['isRateDetermining'] = w.rng() < 0.7;
    };
  },
  setRole,
  addRelationship,
  addPrerequisitePair,
  setComponents,
  addOutcome,
];

/** Extra weight for the mutations that rarely produce cycles or overlaps by chance. */
const PICKS = [...MUTATIONS, setRole, setRole, addRelationship, addPrerequisitePair, addPrerequisitePair, setComponents, setComponents, addOutcome, addOutcome];

/** `byRule`: the command store's path (ADR-032); otherwise whole subjects only (`scopeOf` + `validateTouched`). */
function walk(seed: number, steps: number, byRule = true): { readonly rules: Set<string> } {
  const w = new Walk(base, mulberry32(seed));
  let indexes = coreIndexEngine.build(w.current);
  const store = createFindingStore();
  const everyone = (state: CanonicalState): RecordRef[] =>
    (Object.keys(state.records) as RecordKind[]).flatMap((kind) => Object.keys(state.records[kind]).map((id) => ({ kind, id })));
  commitFindings(store, everyone(w.current), validator.validateAll(w.current, indexes));
  const seenRules = new Set<string>();
  for (let i = 0; i < steps; i += 1) {
    const mutation = w.pick(PICKS);
    const recipe = mutation?.(w);
    if (recipe === undefined) continue;
    const before = w.current;
    const { after, changes } = commit(before, indexes.revision + 1, recipe);
    indexes = coreIndexEngine.apply(indexes, changes, after);
    const touched = [...changes.created, ...changes.updated, ...changes.deleted];
    if (byRule) {
      commitTouched(store, validator.validateTouchedByRule(after, indexes, touched, before, store));
    } else {
      commitFindings(store, validator.scopeOf(after, indexes, touched, before), validator.validateTouched(after, indexes, touched, before));
    }
    w.current = after;
    const full = validator.validateAll(after, coreIndexEngine.build(after, indexes.revision));
    expect(canon(store.all()), `seed ${seed} step ${i}`).toEqual(canon(full));
    for (const f of full) seenRules.add(f.ruleId);
  }
  return { rules: seenRules };
}

describe.each([
  ['per rule for referrers and peers (ADR-032)', true],
  ['whole records only', false],
])('incremental validation equals full validation: %s', (_name, byRule) => {
  it.each([1, 2, 3, 4, 5, 6])('seed %i: 100 random edits, compared after every step', (seed) => {
    const { rules } = walk(seed, 100, byRule);
    expect(rules.size).toBeGreaterThan(5);
  }, 60_000);

  it('the seeds together exercise a broad set of rules', () => {
    const all = new Set<string>();
    for (const seed of [11, 12, 13, 14]) for (const rule of walk(seed, 100, byRule).rules) all.add(rule);
    const needed = ['REF-001', 'REF-006', 'REF-008', 'SPC-001', 'SPC-006', 'CLS-001', 'HIER-001', 'HIER-003', 'RXN-004', 'RXN-008', 'RXN-013', 'REL-005', 'RTE-002', 'PRS-001', 'RVW-001'];
    expect(needed.filter((rule) => !all.has(rule)), `seen: ${[...all].sort().join(' ')}`).toEqual([]);
  }, 120_000);
});
