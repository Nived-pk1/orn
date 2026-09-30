/**
 * The INV-23 checker of the legacy mappers (steps 3.11b/3.11c): enumerates every scalar leaf of the v5 data with its OWN walker and says
 * which ones are neither consumed (union of the three mappers' traces), kept in the `unmapped` of their own record, nor counted by
 * default. Shared by the whole-JSON completeness test and the ADV-043 test. Test-only.
 */
import type { AnyRecord } from '@/core/schema';
import type { HubDecision } from '@/io/legacy-v6';
import type { ClassifiedAll } from './legacy-classify-kit';

export type Scalar = string | number | boolean | null;
type Segment = string | number;
export interface Leaf {
  readonly segments: readonly Segment[];
  readonly path: string;
  readonly value: Scalar;
}

const spell = (segments: readonly Segment[]): string =>
  segments.reduce<string>((text, s) => (typeof s === 'number' ? `${text}[${s}]` : /^[A-Za-z_$][\w$]*$/.test(s) ? `${text}${text ? '.' : ''}${s}` : `${text}[${JSON.stringify(s)}]`), '');

/** Every scalar leaf of a JSON value (iterative; an empty array or object holds none). */
export function leavesOf(root: unknown): Leaf[] {
  const out: Leaf[] = [];
  const stack: { segments: Segment[]; value: unknown }[] = [{ segments: [], value: root }];
  while (stack.length > 0) {
    const { segments, value } = stack.pop() as { segments: Segment[]; value: unknown };
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) out.push({ segments, path: spell(segments), value: value as Scalar });
    else if (Array.isArray(value)) for (let i = value.length - 1; i >= 0; i -= 1) stack.push({ segments: [...segments, i], value: value[i] });
    else if (typeof value === 'object') {
      const keys = Object.keys(value);
      for (let i = keys.length - 1; i >= 0; i -= 1) stack.push({ segments: [...segments, keys[i] as string], value: (value as Record<string, unknown>)[keys[i] as string] });
    }
  }
  return out;
}

export const scalarsOf = (value: unknown): Scalar[] => leavesOf(value).map((leaf) => leaf.value);
const isEmptyValue = (value: Scalar): boolean => value === '' || value === null;
export const generalize = (path: string): string => path.replace(/\[\d+\]/g, '[*]');

export interface Setup {
  readonly raw?: unknown;
  readonly decisions?: ReadonlyMap<string, HubDecision>;
}

function ownerOfCompound(run: ClassifiedAll, index: number, decisions: ReadonlyMap<string, HubDecision> | undefined): AnyRecord | undefined {
  const compound = run.data.compounds[index] as { id?: unknown; nodeType?: unknown };
  const key = run.ids.compoundKeys[index] as string;
  const asClass = compound.nodeType === 'major' && (decisions?.get(key) ?? 'class') === 'class';
  const id = asClass ? run.ids.ids.classId(key) : run.ids.ids.speciesId(key);
  return [...run.compounds.records.species, ...run.compounds.records.class].find((record) => record.id === id);
}

export const unmappedOf = (record: AnyRecord | undefined): unknown => (record?.provenance as { legacy?: { unmapped?: unknown } } | undefined)?.legacy?.unmapped;

/** The leaves of the v5 data and of the port's dropped list that are neither consumed, kept in their record, nor counted by default. */
export function unaccounted(run: ClassifiedAll, setup: Setup, consumed: ReadonlySet<string>): string[] {
  const missing: string[] = [];
  const pools = new Map<string, Scalar[]>();
  const poolOf = (key: string, unmapped: unknown): Scalar[] => {
    let pool = pools.get(key);
    if (pool === undefined) {
      pool = scalarsOf(unmapped);
      pools.set(key, pool);
    }
    return pool;
  };
  const ownerPool = (segments: readonly Segment[]): Scalar[] | undefined => {
    const [top, index] = segments;
    if (top === 'compounds' && typeof index === 'number') return poolOf(`c${index}`, unmappedOf(ownerOfCompound(run, index, setup.decisions)));
    if (top === 'reactions' && typeof index === 'number') return poolOf(`r${index}`, unmappedOf(run.classification.records.reaction[index]));
    return undefined;
  };
  const take = (pool: Scalar[] | undefined, value: Scalar): boolean => {
    const at = pool?.findIndex((candidate) => candidate === value) ?? -1;
    if (at < 0) return false;
    pool?.splice(at, 1); // a kept value covers ONE leaf
    return true;
  };

  const documentPool = scalarsOf(run.classification.documentUnmapped);
  for (const leaf of leavesOf(run.data)) {
    if (consumed.has(leaf.path)) continue;
    const owner = ownerPool(leaf.segments);
    const ok = owner !== undefined ? take(owner, leaf.value) : take(documentPool, leaf.value);
    if (!ok) missing.push(`${leaf.path} = ${JSON.stringify(leaf.value)}`);
  }

  // dropped leaves of the v4 → v5 port (raw input paths)
  const emptyByPath = new Map<string, number>();
  for (const leaf of run.normalized.dropped) {
    if (isEmptyValue(leaf.value)) {
      emptyByPath.set(generalize(leaf.path), (emptyByPath.get(generalize(leaf.path)) ?? 0) + 1);
      continue;
    }
    const match = /^(compounds|reactions)\[(\d+)\]\.?(.*)$/s.exec(leaf.path);
    const sub = match?.[3] ?? '';
    if (match === null || sub === '') {
      if (!take(documentPool, leaf.value)) missing.push(`dropped ${leaf.path} = ${JSON.stringify(leaf.value)}`);
      continue;
    }
    const record = match[1] === 'compounds' ? ownerOfCompound(run, Number(match[2]), setup.decisions) : run.classification.records.reaction[Number(match[2])];
    // a reaction with an unknown legacy field that is itself called `dropped` keeps it there; the port's dropped leaves are then under `dropped#3.11b`
    const kept = unmappedOf(record) as Record<string, Record<string, unknown> | undefined> | undefined;
    const dropped = [kept?.dropped, kept?.['dropped#3.11b']].find((group) => group !== undefined && typeof group === 'object' && Object.hasOwn(group, sub));
    if (dropped === undefined || dropped[sub] !== leaf.value) missing.push(`dropped ${leaf.path} = ${JSON.stringify(leaf.value)}`);
  }
  const counted = run.report.build().consumedByDefault;
  for (const [path, count] of emptyByPath) if (counted[path] !== count) missing.push(`consumedByDefault ${path}: expected ${count}, report says ${String(counted[path])}`);
  for (const path of Object.keys(counted)) if (!emptyByPath.has(path)) missing.push(`consumedByDefault ${path} counts something the port did not drop`);
  return missing;
}


export const allConsumed = (run: ClassifiedAll): Set<string> => new Set([...run.compounds.consumed, ...run.reactions.consumed, ...run.classification.consumed]);
