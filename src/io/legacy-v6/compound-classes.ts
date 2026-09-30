/**
 * Class membership of the mapped compounds (docs/MIGRATION.md §4.4): `fgId` / `functionalGroups[]` name the hub class with the same
 * `fgId` if one exists, else a `functional_group` class created from the legacy functional-group registry label; a `compoundClass`
 * text names the class with that folded name, else a class is created. Every created class is a review item. All functional groups
 * of the whole document are settled BEFORE any `compoundClass` text, so the outcome does not depend on the order of the records.
 * Only compounds that become SPECIES have memberships: for a hub decided as class these fields describe the hub itself and are kept
 * in `provenance.legacy.unmapped` by the mapper (a class is not a member of its own class).
 */
import { LIMITS, NameTextSchema } from '@/core/schema';
import { fold } from '@/core/text';
import { idKey, type LegacyDocumentIds } from './id-collect';
import { LEGACY_FG } from './fg-registry';
import { excerpt } from './compound-scope';
import { arr, type LegacyObject } from './text';

export interface CreatedClass {
  readonly id: string;
  readonly classKind: 'functional_group' | 'compound_class';
  readonly name: string;
  /** Why the class exists: its review reason. */
  readonly reason: string;
  /** Where it came from, for the provenance trace: `functionalGroup:<id>` / `compoundClass:<text>`. */
  readonly origin: string;
}

/** What one species compound's membership fields came to. */
export interface Membership {
  readonly classIds: string[];
  /** Legacy fields (paths under the compound) that became memberships. */
  readonly consumed: { readonly path: readonly (string | number)[]; readonly value: unknown }[];
  /** Legacy values that could not become a membership: kept in `unmapped`. */
  readonly kept: { readonly path: readonly string[]; readonly value: unknown }[];
  readonly reasons: string[];
}

export interface ClassPlan {
  readonly membership: ReadonlyMap<number, Membership>;
  /** Classes created for functional groups and `compoundClass` texts, in first-use order. */
  readonly created: readonly CreatedClass[];
  /** Functional-group id → the class that stands for it (a hub class or a created one). */
  readonly functionalGroupClass: ReadonlyMap<string, string>;
}

export interface HubClass {
  readonly key: string;
  readonly legacyId: string;
  readonly id: string;
  readonly name: string;
  readonly fgId: string;
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/**
 * `hubs`: the compounds decided as CLASS, in legacy order. `speciesIndexes`: indexes of the compounds that become species.
 */
export function planClasses(compounds: readonly LegacyObject[], speciesIndexes: readonly number[], hubs: readonly HubClass[], ids: LegacyDocumentIds): ClassPlan {
  const hubsByFg = new Map<string, HubClass[]>();
  const byFoldedName = new Map<string, string[]>();
  for (const hub of hubs) {
    if (hub.fgId !== '') hubsByFg.set(hub.fgId, [...(hubsByFg.get(hub.fgId) ?? []), hub]);
    const folded = fold(hub.name);
    byFoldedName.set(folded, [...(byFoldedName.get(folded) ?? []), hub.id]);
  }
  const created: CreatedClass[] = [];
  const createdByFg = new Map<string, string | null>();
  const functionalGroupClass = new Map<string, string>();
  const membership = new Map<number, Membership>();
  for (const index of speciesIndexes) membership.set(index, { classIds: [], consumed: [], kept: [], reasons: [] });

  const classOfFunctionalGroup = (fg: string, reasons: string[]): string | undefined => {
    const hubsOf = hubsByFg.get(fg);
    if (hubsOf !== undefined) {
      const first = hubsOf[0] as HubClass;
      if (hubsOf.length > 1) reasons.push(`functional group ${excerpt(fg)} matches several hubs (${hubsOf.map((hub) => hub.legacyId).join(', ')}); the first (${first.legacyId}) was used`);
      functionalGroupClass.set(fg, first.id);
      return first.id;
    }
    if (createdByFg.has(fg)) return createdByFg.get(fg) ?? undefined;
    const entry = LEGACY_FG.find((candidate) => candidate.id === fg);
    const name = entry?.label ?? fg;
    if (!NameTextSchema.safeParse(name).success) {
      createdByFg.set(fg, null);
      return undefined;
    }
    const id = ids.ids.functionalGroupClassId(fg);
    const reason =
      entry === undefined
        ? `functional group ${excerpt(fg)} is not in the legacy registry and no hub carries it; class created from that text`
        : `no hub carries fgId ${excerpt(fg)}; functional-group class created from the legacy registry label ${excerpt(name)}`;
    created.push({ id, classKind: 'functional_group', name, reason, origin: `functionalGroup:${fg}` });
    createdByFg.set(fg, id);
    functionalGroupClass.set(fg, id);
    const folded = fold(name);
    byFoldedName.set(folded, [...(byFoldedName.get(folded) ?? []), id]);
    return id;
  };

  // Pass 1: functional groups of every species compound.
  for (const index of speciesIndexes) {
    const compound = compounds[index] as LegacyObject;
    const result = membership.get(index) as Membership;
    const entries: { path: (string | number)[]; value: unknown }[] = [{ path: ['fgId'], value: compound.fgId }];
    arr(compound.functionalGroups).forEach((value, at) => entries.push({ path: ['functionalGroups', at], value }));
    if (!Array.isArray(compound.functionalGroups) && compound.functionalGroups !== undefined) entries.push({ path: ['functionalGroups'], value: compound.functionalGroups });
    for (const entry of entries) {
      if (entry.value === undefined || entry.value === '' || entry.value === null) {
        if (entry.value !== undefined) result.consumed.push(entry);
        continue;
      }
      const path = entry.path as readonly string[];
      if (!isText(entry.value)) {
        result.kept.push({ path, value: entry.value });
        result.reasons.push(`${path.join('.')} is not text (${excerpt(entry.value)}); kept in legacy.unmapped`);
        continue;
      }
      if (result.classIds.length >= LIMITS.idList) {
        result.kept.push({ path, value: entry.value });
        result.reasons.push(`more than ${LIMITS.idList} classes; ${path.join('.')} kept in legacy.unmapped`);
        continue;
      }
      const classId = classOfFunctionalGroup(entry.value, result.reasons);
      if (classId === undefined) {
        result.kept.push({ path, value: entry.value });
        result.reasons.push(`functional group ${excerpt(entry.value)} cannot be a class name; kept in legacy.unmapped`);
        continue;
      }
      result.consumed.push(entry);
      if (!result.classIds.includes(classId)) result.classIds.push(classId);
    }
  }

  // Pass 2: `compoundClass` texts, matched by folded name against hub classes and every class created above.
  for (const index of speciesIndexes) {
    const compound = compounds[index] as LegacyObject;
    const result = membership.get(index) as Membership;
    const value = compound.compoundClass;
    if (value === undefined) continue;
    if (value === '' || value === null) {
      result.consumed.push({ path: ['compoundClass'], value });
      continue;
    }
    if (!isText(value)) {
      result.kept.push({ path: ['compoundClass'], value });
      result.reasons.push(`compoundClass is not text (${excerpt(value)}); kept in legacy.unmapped`);
      continue;
    }
    if (result.classIds.length >= LIMITS.idList) {
      result.kept.push({ path: ['compoundClass'], value });
      result.reasons.push(`more than ${LIMITS.idList} classes; compoundClass kept in legacy.unmapped`);
      continue;
    }
    const folded = fold(value);
    const matches = byFoldedName.get(folded);
    let classId: string | undefined = matches?.[0];
    if (matches !== undefined && matches.length > 1) result.reasons.push(`compoundClass ${excerpt(value)} matches several classes by folded name; the first was used`);
    if (classId === undefined) {
      if (!NameTextSchema.safeParse(value).success) {
        result.kept.push({ path: ['compoundClass'], value });
        result.reasons.push(`compoundClass ${excerpt(value)} cannot be a class name; kept in legacy.unmapped`);
        continue;
      }
      classId = ids.ids.classFromTextId(value);
      created.push({ id: classId, classKind: 'compound_class', name: value, reason: `no class has the folded name of compoundClass ${excerpt(value)}; class created from that text`, origin: `compoundClass:${value}` });
      byFoldedName.set(folded, [classId]);
    }
    result.consumed.push({ path: ['compoundClass'], value });
    if (!result.classIds.includes(classId)) result.classIds.push(classId);
  }
  return { membership, created, functionalGroupClass };
}

/** The legacy ID of a compound as a plain string (see `idKey`). */
export const legacyIdOf = (compound: LegacyObject): string => idKey(compound.id);
