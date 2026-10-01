/**
 * What to ask the chem worker about a species, and how to read the answers (main side, pure, no toolkit). A species with no
 * structure has nothing to check. CHEM-007 compares the class SMARTS with the classes the species STATES: the classes it lists
 * and their ancestors (a species listed under "primary alcohol" states "alcohol" too); a class the species lists itself is the
 * only one whose non-match is reported (an inherited class that does not match is the listed class's business).
 */
import type { CanonicalState, ChemicalClass, RecordRef, Species } from '@/core/schema';
import type { SmartsOutcome } from '../contracts';
import type { CheckDraft, MatchProbe, NotCompared, SpeciesCheckRequest } from './contracts';

/** The most class SMARTS one species is probed against (a bound; more is reported as not compared). */
export const MAX_CLASS_PROBES = 100;
const MAX_ANCESTOR_WALK = 2_000;

export function speciesRequest(species: Species): SpeciesCheckRequest | undefined {
  if (species.structure === undefined) return undefined;
  return {
    id: species.id,
    structure: species.structure,
    ...(species.formula === undefined ? {} : { formula: species.formula }),
    ...(species.charge === undefined ? {} : { charge: species.charge }),
    ...(species.stereo === undefined || species.stereo.descriptors.length === 0 ? {} : { stereoDescriptors: species.stereo.descriptors }),
  };
}

/** The classes with a SMARTS, sorted by ID. */
export function smartsClasses(state: CanonicalState): readonly ChemicalClass[] {
  return Object.values(state.records.class)
    .filter((cls) => cls.generic?.smarts !== undefined && cls.generic.smarts.length > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The listed classes and every ancestor, walked iteratively over `parentIds` (a cycle or an absurd DAG cannot loop). */
export function statedClasses(state: CanonicalState, listed: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const queue = [...listed];
  for (let i = 0; i < queue.length && seen.size < MAX_ANCESTOR_WALK; i += 1) {
    const id = queue[i] as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const cls = Object.hasOwn(state.records.class, id) ? state.records.class[id] : undefined;
    if (cls !== undefined) queue.push(...cls.parentIds);
  }
  return seen;
}

export interface MembershipPlan {
  readonly probes: readonly MatchProbe[];
  /** The class each probe is for, in order. */
  readonly classIds: readonly string[];
  readonly notCompared: readonly NotCompared[];
}

export function membershipPlan(state: CanonicalState, species: Species): MembershipPlan {
  const classes = species.structure === undefined ? [] : smartsClasses(state);
  if (classes.length === 0 || species.structure === undefined) return { probes: [], classIds: [], notCompared: [] };
  const used = classes.slice(0, MAX_CLASS_PROBES);
  const notCompared =
    classes.length > used.length
      ? [{ ruleId: 'CHEM-007', reason: `only the first ${MAX_CLASS_PROBES} of ${classes.length} class SMARTS were tried` }]
      : [];
  return {
    probes: used.map((cls) => ({ structure: species.structure as MatchProbe['structure'], smarts: cls.generic?.smarts ?? '' })),
    classIds: used.map((cls) => cls.id),
    notCompared,
  };
}

export interface MembershipReading {
  readonly drafts: readonly CheckDraft[];
  readonly notCompared: readonly NotCompared[];
  /** Set when a probe got no answer from the toolkit (crash or timeout): nothing is concluded from the rest. */
  readonly unanswered?: { readonly reason: 'unavailable' | 'timeout'; readonly message: string };
}

export function readMembership(state: CanonicalState, species: Species, plan: MembershipPlan, outcomes: readonly SmartsOutcome[]): MembershipReading {
  const stated = statedClasses(state, species.classIds);
  const listed = new Set<string>(species.classIds);
  const drafts: CheckDraft[] = [];
  const notCompared: NotCompared[] = [...plan.notCompared];
  for (const [i, classId] of plan.classIds.entries()) {
    const outcome = outcomes[i];
    if (outcome === undefined) continue;
    const related: readonly RecordRef[] = [{ kind: 'class', id: classId }];
    if (!outcome.ok) {
      if (outcome.reason === 'unavailable' || outcome.reason === 'timeout') return { drafts: [], notCompared: [], unanswered: { reason: outcome.reason, message: outcome.error } };
      if (outcome.reason === 'invalid_smarts') notCompared.push({ ruleId: 'CHEM-007', reason: `the SMARTS of class ${classId} cannot be read, so it was not tried` });
      continue; // `invalid` structure: CHEM-001 or CHEM-002 says so
    }
    if (outcome.matches && !stated.has(classId)) {
      drafts.push({
        ruleId: 'CHEM-007',
        path: 'classIds',
        message: `The structure matches the SMARTS of class ${classId}, which this species does not list. Suggestion: consider adding it.`,
        related,
        data: { direction: 'suggest_add', classId },
      });
    } else if (!outcome.matches && listed.has(classId)) {
      drafts.push({
        ruleId: 'CHEM-007',
        path: 'classIds',
        message: `This species lists class ${classId}, but its structure does not match the SMARTS of that class. Suggestion: check the class or the structure.`,
        related,
        data: { direction: 'suggest_review', classId },
      });
    }
  }
  return { drafts, notCompared };
}
