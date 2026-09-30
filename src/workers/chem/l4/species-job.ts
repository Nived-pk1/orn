/**
 * The species checks (CHEM-001 to 004, CHEM-007, and CHEM-009 from the derived groups). One run takes the species that are due:
 * asks the worker in batches, asks the SMARTS probes of the ones that were read, and only then, in one synchronous step, drops
 * every result whose species changed while the worker was busy (its request signature no longer matches the record) and applies
 * the rest: statuses, the derived groups, and the findings, merged by rule. CHEM-009 refreshes exactly the old and the new group
 * of each species the run touched.
 */
import { duplicateDrafts } from '@/chem/checks/duplicates';
import { membershipPlan, readMembership, speciesRequest } from '@/chem/checks/plan-species';
import type { MembershipReading, MembershipPlan } from '@/chem/checks/plan-species';
import type { CheckDraft, NotCompared, SpeciesCheckRequest, SpeciesCheckResult } from '@/chem/checks/contracts';
import type { SmartsOutcome } from '@/chem/contracts';
import type { RecordRef, Species } from '@/core/schema';
import { MAX_CHECK_BATCH } from '@/chem/checks/contracts';
import { runBatches } from './batches';
import { L4_BATCH_SIZE } from './contracts';
import type { Entry, L4Context } from './context';
import { refKey } from './context';

export const SPECIES_RULES: readonly string[] = ['CHEM-001', 'CHEM-002', 'CHEM-003', 'CHEM-004', 'CHEM-007'];
const GROUP_RULES: readonly string[] = ['CHEM-009'];

const structureKey = (request: SpeciesCheckRequest): string => `${request.structure.format}\u0000${request.structure.value}`;
const speciesAt = (ctx: L4Context, id: string): Species | undefined => {
  const table = ctx.ports.state().records.species;
  return Object.hasOwn(table, id) ? table[id] : undefined;
};

/**
 * The signature of what a species check is about: what the worker is sent (structure, formula, charge) and the classes the species
 * lists (CHEM-007). Nothing else of the record changes an answer, so an edit that leaves it alone is not re-checked.
 */
export function speciesSignature(species: Species | undefined): string | undefined {
  const request = species === undefined ? undefined : speciesRequest(species);
  return request === undefined || species === undefined ? undefined : JSON.stringify([request, species.classIds]);
}

interface Candidate {
  readonly id: string;
  readonly ref: RecordRef;
  readonly request: SpeciesCheckRequest;
  readonly sig: string;
}

interface Read {
  readonly candidate: Candidate;
  readonly result: SpeciesCheckResult;
  plan?: MembershipPlan;
  membership?: MembershipReading;
}

/** Keeps track of which canonical structures a run moved species in or out of. */
function tracker(ctx: L4Context): { readonly set: (id: string, canonical: string | undefined) => void; readonly refresh: () => void } {
  const touched = new Map<string, Set<string>>();
  const note = (canonicals: readonly string[], id: string): void => {
    for (const canonical of canonicals) touched.set(canonical, (touched.get(canonical) ?? new Set()).add(id));
  };
  return {
    set: (id, canonical) => note(canonical === undefined ? ctx.groups.remove(id) : ctx.groups.set(id, canonical), id),
    refresh() {
      const subjects = new Map<string, RecordRef>();
      const entries: Entry[] = [];
      for (const [canonical, moved] of touched) {
        const members = ctx.groups.membersOf(canonical);
        for (const id of [...members, ...moved]) {
          if (speciesAt(ctx, id) !== undefined) subjects.set(id, { kind: 'species', id });
        }
        for (const [id, draft] of duplicateDrafts(members)) entries.push({ subject: { kind: 'species', id }, draft });
      }
      ctx.merge([...subjects.values()], GROUP_RULES, entries);
    },
  };
}

async function askMembership(ctx: L4Context, reads: readonly Read[]): Promise<void> {
  const state = ctx.ports.state();
  const probes = reads.flatMap((read) => {
    const species = speciesAt(ctx, read.candidate.id);
    if (species === undefined) return [];
    read.plan = membershipPlan(state, species);
    return read.plan.probes.map((probe) => ({ read, probe }));
  });
  if (probes.length === 0) return;
  const settled = await runBatches(
    probes,
    Math.min(L4_BATCH_SIZE, MAX_CHECK_BATCH),
    (chunk) => ctx.call('matches', chunk.length, () => ctx.ports.chem.matches(chunk.map((p) => p.probe))),
    (answer) => answer.outcomes,
    ctx.noteToolkit,
  );
  const outcomes = new Map<Read, { ok: boolean; outcomes: SmartsOutcome[]; failure?: { reason: 'timeout' | 'unavailable'; error: string } }>();
  for (const answer of settled) {
    const slot = outcomes.get(answer.item.read) ?? { ok: true, outcomes: [] };
    if (answer.ok) slot.outcomes.push(answer.result);
    else {
      slot.ok = false;
      slot.failure ??= { reason: answer.reason, error: answer.error };
    }
    outcomes.set(answer.item.read, slot);
  }
  for (const read of reads) {
    const species = speciesAt(ctx, read.candidate.id);
    const slot = outcomes.get(read);
    if (species === undefined || read.plan === undefined || slot === undefined) continue;
    read.membership = slot.ok
      ? readMembership(ctx.ports.state(), species, read.plan, slot.outcomes)
      : { drafts: [], notCompared: [], unanswered: { reason: slot.failure?.reason ?? 'unavailable', message: slot.failure?.error ?? 'no answer' } };
  }
}

export async function runSpeciesJob(ctx: L4Context, ids: readonly string[]): Promise<void> {
  const groups = tracker(ctx);
  const state = ctx.ports.state();
  const cleared: RecordRef[] = [];
  const due: Candidate[] = [];
  for (const id of ids) {
    const ref: RecordRef = { kind: 'species', id };
    const species = Object.hasOwn(state.records.species, id) ? state.records.species[id] : undefined;
    if (species === undefined) {
      ctx.forget(ref);
      groups.set(id, undefined);
      continue;
    }
    const request = speciesRequest(species);
    if (request === undefined) {
      ctx.sent.delete(refKey(ref));
      ctx.setStatus(ref, { state: 'checked', notCompared: [] });
      cleared.push(ref);
      groups.set(id, undefined);
      continue;
    }
    const sig = speciesSignature(species) as string;
    ctx.sent.set(refKey(ref), sig);
    const known = ctx.memory.get(structureKey(request), ctx.version());
    if (known !== undefined) {
      ctx.countRemembered();
      ctx.setStatus(ref, { state: 'not_checked', reason: known.reason, message: known.message, remembered: true });
      cleared.push(ref);
      groups.set(id, undefined);
      continue;
    }
    ctx.setStatus(ref, { state: 'pending' });
    due.push({ id, ref, request, sig });
  }
  ctx.merge(cleared, SPECIES_RULES, []);

  const settled = await runBatches(
    due,
    L4_BATCH_SIZE,
    (chunk) => ctx.call('checkSpecies', chunk.length, () => ctx.ports.chem.checkSpecies(chunk.map((c) => c.request))),
    (answer) => answer.results,
    ctx.noteToolkit,
  );
  if (ctx.disposed()) return;

  const reads: Read[] = [];
  const failed: { candidate: Candidate; reason: 'timeout' | 'unavailable'; message: string; unseen: boolean }[] = [];
  for (const answer of settled) {
    if (!answer.ok) failed.push({ candidate: answer.item, reason: answer.reason, message: answer.error, unseen: answer.reason !== 'timeout' });
    else if (answer.result.status.state === 'not_checked') failed.push({ candidate: answer.item, reason: answer.result.status.reason, message: answer.result.status.message, unseen: false });
    else reads.push({ candidate: answer.item, result: answer.result });
  }
  await askMembership(ctx, reads.filter((read) => read.result.canonicalSmiles !== undefined));
  if (ctx.disposed()) return;

  // From here on nothing is awaited: the results are checked against the records as they are NOW, then applied together.
  const current = (candidate: Candidate): boolean => {
    if (speciesSignature(speciesAt(ctx, candidate.id)) === candidate.sig) return true;
    ctx.countStale();
    return false;
  };
  const subjects: RecordRef[] = [];
  const entries: Entry[] = [];
  for (const { candidate, reason, message, unseen } of failed) {
    if (!current(candidate)) continue;
    // A worker that did not answer at all (down, crashed twice) says nothing about the structure: it is not remembered.
    const remember = !unseen && ctx.canRemember();
    if (remember) ctx.memory.add(structureKey(candidate.request), ctx.version(), { reason, message });
    ctx.setStatus(candidate.ref, { state: 'not_checked', reason, message, remembered: remember });
    subjects.push(candidate.ref);
    groups.set(candidate.id, undefined);
  }
  for (const read of reads) {
    if (!current(read.candidate)) continue;
    const membership = read.membership;
    if (membership?.unanswered !== undefined) {
      ctx.setStatus(read.candidate.ref, { state: 'not_checked', reason: membership.unanswered.reason, message: membership.unanswered.message, remembered: false });
    } else {
      const notCompared: NotCompared[] = [...(read.result.status.state === 'checked' ? read.result.status.notCompared : []), ...(membership?.notCompared ?? [])];
      ctx.setStatus(read.candidate.ref, { state: 'checked', notCompared });
    }
    subjects.push(read.candidate.ref);
    const drafts: readonly CheckDraft[] = membership?.unanswered === undefined ? [...read.result.drafts, ...(membership?.drafts ?? [])] : read.result.drafts;
    for (const draft of drafts) entries.push({ subject: read.candidate.ref, draft });
    groups.set(read.candidate.id, read.result.canonicalSmiles);
  }
  ctx.merge(subjects, SPECIES_RULES, entries);
  groups.refresh();
}

/** A species that was deleted: its status and groups go, and its old group is refreshed (its findings were cleared by the store). */
export function forgetSpecies(ctx: L4Context, id: string): void {
  ctx.forget({ kind: 'species', id });
  const tracked = tracker(ctx);
  tracked.set(id, undefined);
  tracked.refresh();
}
