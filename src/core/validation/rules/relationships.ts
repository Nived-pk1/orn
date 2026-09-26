/**
 * L3 relationship rules REL-001…REL-006. Type-specific behaviour (allowed endpoint kinds, symmetry,
 * acyclicity) comes from RELATIONSHIP_TYPE_SPECS, never from code that names a type. Relationships that
 * share an endpoint or a chain are each other's peers for incremental validation.
 */
import { closure } from '../../indexes/hierarchy';
import { RELATIONSHIP_TYPE_SPECS, type RecordKind, type RecordRef, type Relationship } from '../../schema';
import type { RuleContext, ValidationRule } from '../contracts';
import { MAX_RELATED, MAX_WALK_NODES, allOfKinds, asRefs, rule } from './helpers';

const REL = ['relationship'] as const;

/** Relationships of `ctx` that have `id` as an endpoint. */
function relationshipsAt(id: string, ctx: RuleContext): Relationship[] {
  const found = new Map<string, Relationship>();
  for (const r of ctx.indexes.referrersOf(id)) {
    if (r.owner.kind !== 'relationship' || (r.path !== 'from' && r.path !== 'to')) continue;
    const record = ctx.indexes.get(r.owner.id);
    if (record?.kind === 'relationship') found.set(record.id, record);
  }
  return [...found.values()];
}

/** Relationships of the same type as `start`, connected to it through shared endpoints. */
function component(start: Relationship, ctx: RuleContext): { readonly members: Relationship[]; readonly truncated: boolean } {
  const members = new Map<string, Relationship>();
  let visited = 0;
  closure(start.from.id, (node) => {
    visited += 1;
    if (visited > MAX_WALK_NODES) return [];
    const same = relationshipsAt(node, ctx).filter((r) => r.type === start.type);
    for (const r of same) members.set(r.id, r);
    return same.map((r) => (r.from.id === node ? r.to.id : r.from.id));
  });
  return { members: [...members.values()], truncated: visited > MAX_WALK_NODES };
}

/** True if a chain of same-type relationships leads from `from` to `to` (directed). */
function reaches(from: string, to: string, type: string, ctx: RuleContext): { readonly found: boolean; readonly truncated: boolean } {
  let visited = 0;
  let found = false;
  closure(from, (node) => {
    visited += 1;
    if (visited > MAX_WALK_NODES || found) return [];
    const next = relationshipsAt(node, ctx)
      .filter((r) => r.type === type && r.from.id === node && r.to.id !== node)
      .map((r) => r.to.id);
    if (next.includes(to)) found = true;
    return next;
  });
  return { found, truncated: visited > MAX_WALK_NODES && !found };
}

const sameEnds = (a: Relationship, b: Relationship, symmetric: boolean): boolean =>
  (a.from.id === b.from.id && a.to.id === b.to.id) || (symmetric && a.from.id === b.to.id && a.to.id === b.from.id);

export const RELATIONSHIP_RULES: readonly ValidationRule[] = [
  rule({
    id: 'REL-001',
    level: 3,
    kinds: REL,
    defaultSeverity: 'error',
    scope: 'record',
    description: 'Endpoint kind not allowed for the relationship type',
    *check(rel) {
      const allowed: readonly RecordKind[] = RELATIONSHIP_TYPE_SPECS[rel.type].endpointKinds;
      const label = RELATIONSHIP_TYPE_SPECS[rel.type].label;
      for (const end of ['from', 'to'] as const) {
        if (allowed.includes(rel[end].kind)) continue;
        yield { path: end, message: `A ${rel[end].kind} cannot be an endpoint of "${label}". Allowed: ${allowed.join(', ')}.` };
      }
    },
  }),

  rule({
    id: 'REL-002',
    level: 3,
    kinds: REL,
    defaultSeverity: 'error',
    scope: 'record',
    description: 'from equals to',
    *check(rel) {
      if (rel.from.id !== rel.to.id) return;
      yield { path: 'to', message: 'A record cannot be related to itself.' };
    },
  }),

  rule({
    id: 'REL-003',
    level: 3,
    kinds: REL,
    defaultSeverity: 'warning',
    scope: 'global',
    description: 'Duplicate relationship (same type and endpoints; unordered for symmetric types)',
    peers: (rel, ctx) =>
      rel.kind === 'relationship' ? [...relationshipsAt(rel.from.id, ctx), ...relationshipsAt(rel.to.id, ctx)].map((r): RecordRef => ({ kind: 'relationship', id: r.id })) : [],
    *check(rel, ctx) {
      const symmetric = RELATIONSHIP_TYPE_SPECS[rel.type].symmetric;
      const twins = relationshipsAt(rel.from.id, ctx).filter((o) => o.id !== rel.id && o.type === rel.type && sameEnds(rel, o, symmetric));
      if (twins.length === 0) return;
      yield {
        path: 'type',
        message: `${twins.length} other relationship${twins.length === 1 ? '' : 's'} of the same type link${twins.length === 1 ? 's' : ''} the same records.`,
        related: asRefs(twins),
        data: { count: twins.length },
      };
    },
  }),

  rule({
    id: 'REL-004',
    level: 3,
    kinds: REL,
    defaultSeverity: 'error',
    scope: 'record',
    description: 'reverseKind missing on reverse_of, or present on another type',
    *check(rel) {
      if (rel.type === 'reverse_of' && rel.reverseKind === undefined) {
        yield { path: 'reverseKind', message: 'A "reverse of" relationship must say what kind of reverse it is (microscopic, synthetic or conceptual).' };
      } else if (rel.type !== 'reverse_of' && rel.reverseKind !== undefined) {
        yield { path: 'reverseKind', message: `Only "reverse of" relationships have a reverse kind; this one is "${RELATIONSHIP_TYPE_SPECS[rel.type].label}".` };
      }
    },
  }),

  rule({
    id: 'REL-005',
    level: 3,
    kinds: REL,
    defaultSeverity: 'error',
    scope: 'global',
    description: 'Cycle in an acyclic relationship type',
    peers: (rel, ctx) => {
      if (rel.kind !== 'relationship') return [];
      const { members, truncated } = component(rel, ctx);
      return truncated ? allOfKinds(ctx, ['relationship']) : members.map((r): RecordRef => ({ kind: 'relationship', id: r.id }));
    },
    *check(rel, ctx) {
      if (!RELATIONSHIP_TYPE_SPECS[rel.type].acyclic || rel.from.id === rel.to.id) return;
      const { found, truncated } = reaches(rel.to.id, rel.from.id, rel.type, ctx);
      if (found) {
        yield { path: 'type', message: `This "${RELATIONSHIP_TYPE_SPECS[rel.type].label}" link closes a cycle: the target already leads back to the source.` };
      } else if (truncated) {
        yield { path: 'type', severity: 'info', message: 'The cycle check stopped early because the chain of relationships is very large.', data: { truncated: true } };
      }
    },
  }),

  rule({
    id: 'REL-006',
    level: 3,
    kinds: REL,
    defaultSeverity: 'warning',
    scope: 'neighbourhood',
    description: 'reverse_of microscopic while either reaction is marked irreversible',
    *check(rel, ctx) {
      if (rel.type !== 'reverse_of' || rel.reverseKind !== 'microscopic') return;
      const irreversible = [rel.from, rel.to]
        .map((end) => ctx.indexes.get(end.id))
        .filter((r) => r?.kind === 'reaction' && r.reversibility.kind === 'irreversible');
      if (irreversible.length === 0) return;
      yield {
        path: 'reverseKind',
        message: 'This is a microscopic reverse, but a reaction it links is marked irreversible.',
        related: irreversible.slice(0, MAX_RELATED).flatMap((r) => (r === undefined ? [] : [{ kind: r.kind, id: r.id }])),
      };
    },
  }),
];
