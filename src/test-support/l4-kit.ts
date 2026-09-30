/**
 * Test kit for the L4 service (step 4.3b): a scripted chem worker, a mutable minimal state, manual scheduling. The fake worker
 * answers like the real checks in SHAPE (every params and every answer passes `structuredClone`, as they would over a port) with a
 * trivial chemistry so that orchestration can be counted: a structure starting with `BAD` is unreadable (CHEM-001), `TRAP...`
 * makes the toolkit answer `unavailable` for that item, `HANG...` makes a call that contains it time out, a leading `~` is
 * stripped to make a canonical structure (so `~CCO` and `CCO` are the same structure). No RDKit.
 */
import type { CheckCall, L4Ports } from '@/workers/chem';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState, RecordRef, Species } from '@/core/schema';
import { createFindingStore } from '@/core/validation/store';
import type { FindingStore } from '@/core/validation/contracts';
import type { SmartsOutcome } from '@/chem';
import type { BalanceAnswer, BalanceRequest, BalanceResult, SpeciesChecksAnswer, SpeciesCheckResult, StepCheckRequest, StepCheckResult, StepChecksAnswer } from '@/chem/checks/contracts';

export interface FakeChem {
  readonly port: L4Ports['chem'];
  /** Every call, in order: the method and how many items it carried. */
  readonly log: { readonly method: string; readonly items: number; readonly ids: readonly string[] }[];
  version: string;
  /** While set, every call waits for it before answering (to change the state while the worker is busy). */
  gate: Promise<void> | undefined;
  /** While true, every call answers as a worker that is down. */
  down: boolean;
}

const toolkit = (fake: { version: string }) => ({ name: 'fake', version: fake.version });
const valueOf = (structure: { value: string }): string => structure.value;
export const canonicalOf = (value: string): string => value.replace(/^~/, '');

export function createFakeChem(): FakeChem {
  const fake: FakeChem = { port: undefined as unknown as L4Ports['chem'], log: [], version: 'v1', gate: undefined, down: false };
  async function answer<T>(method: string, params: { items: number; ids: readonly string[] }, values: readonly string[], build: () => T): Promise<CheckCall<T>> {
    fake.log.push({ method, items: params.items, ids: params.ids });
    if (fake.gate !== undefined) await fake.gate;
    if (fake.down) return { ok: false, reason: 'unavailable', error: 'the worker is down' };
    if (values.some((value) => value.startsWith('HANG'))) return { ok: false, reason: 'timeout', error: 'the structure toolkit did not answer within 2000 ms; it was restarted' };
    return { ok: true, value: structuredClone(build()) };
  }
  const species = (request: { id: string; structure: { value: string }; formula?: string }): SpeciesCheckResult => {
    const value = valueOf(request.structure);
    if (value.startsWith('TRAP')) return { id: request.id, status: { state: 'not_checked', reason: 'unavailable', message: 'the toolkit crashed on this input' }, drafts: [] };
    if (value.startsWith('BAD')) return { id: request.id, status: { state: 'checked', notCompared: [] }, drafts: [{ ruleId: 'CHEM-001', path: 'structure', message: 'cannot be read' }] };
    const notCompared = request.formula === '??' ? [{ ruleId: 'CHEM-003', reason: 'the entered formula was not compared' }] : [];
    return { id: request.id, status: { state: 'checked', notCompared }, drafts: [], canonicalSmiles: canonicalOf(value) };
  };
  const balance = (request: BalanceRequest): BalanceResult => {
    const sum = (list: readonly { coefficient: number }[]): number => list.reduce((total, side) => total + side.coefficient, 0);
    const off = sum(request.reactants) !== sum(request.products);
    return { path: request.path, status: { state: 'checked', notCompared: [] }, drafts: off ? [{ ruleId: 'CHEM-005', path: request.path, message: 'does not balance' }] : [] };
  };
  const step = (request: StepCheckRequest): StepCheckResult => ({
    path: request.path,
    status: { state: 'checked', notCompared: [] },
    drafts: request.uses.filter((use) => use.maps.includes(99)).map((use) => ({ ruleId: 'CHEM-008', path: use.path, message: 'map 99 is absent' })),
  });
  const port: L4Ports['chem'] = {
    checkSpecies: (species_) => {
      const requests = structuredClone(species_);
      return answer<SpeciesChecksAnswer>('checkSpecies', { items: requests.length, ids: requests.map((r) => r.id) }, requests.map((r) => valueOf(r.structure)), () => ({ toolkit: toolkit(fake), results: requests.map(species) }));
    },
    checkReaction: (outcomes) => {
      const requests = structuredClone(outcomes);
      return answer<BalanceAnswer>('checkReaction', { items: requests.length, ids: requests.map((r) => r.path) }, [], () => ({ toolkit: toolkit(fake), results: requests.map(balance) }));
    },
    checkMechanism: (steps) => {
      const requests = structuredClone(steps);
      return answer<StepChecksAnswer>('checkMechanism', { items: requests.length, ids: requests.map((r) => r.path) }, requests.flatMap((r) => r.structures.map(valueOf)), () => ({ toolkit: toolkit(fake), results: requests.map(step) }));
    },
    matches: (probes) => {
      const requests = structuredClone(probes);
      return answer('matches', { items: requests.length, ids: requests.map((r) => r.smarts) }, [], () => ({
        toolkit: toolkit(fake),
        outcomes: requests.map((probe): SmartsOutcome => (probe.smarts === '[[[' ? { ok: false, reason: 'invalid_smarts', error: 'no' } : { ok: true, matches: valueOf(probe.structure).includes(probe.smarts) })),
      }));
    },
  };
  (fake as { port: L4Ports['chem'] }).port = port;
  return fake;
}

// ---- a mutable minimal state -----------------------------------------------------------------------------------------------

export const speciesRecord = (id: string, structure: string | undefined, extra: Partial<Species> = {}): Species =>
  ({ id, kind: 'species', names: { canonical: id, common: [], aliases: [] }, classIds: [], ...(structure === undefined ? {} : { structure: { format: 'smiles', value: structure } }), ...extra }) as unknown as Species;

export interface Tables {
  species?: Record<string, unknown>;
  reaction?: Record<string, unknown>;
  mechanism?: Record<string, unknown>;
  class?: Record<string, unknown>;
}

export interface L4Rig {
  readonly state: { current: CanonicalState };
  readonly findings: FindingStore;
  /** Every `replaceForRules` call: the rule IDs and the subjects it named. */
  readonly merges: { readonly ruleIds: readonly string[]; readonly subjects: readonly string[] }[];
  readonly scheduled: (() => void)[];
  readonly errors: unknown[];
  readonly ports: L4Ports;
  /** Replaces the tables (what a commit did) and returns the ChangeSet that says which records moved. */
  commit(tables: Tables, moved: { created?: RecordRef[]; updated?: RecordRef[]; deleted?: RecordRef[] }): ChangeSet;
}

export const ref = (kind: RecordRef['kind'], id: string): RecordRef => ({ kind, id }) as RecordRef;

export function createL4Rig(fake: FakeChem, initial: Tables = {}): L4Rig {
  const empty = (): Record<string, unknown> => ({});
  const tables = { species: initial.species ?? empty(), reaction: initial.reaction ?? empty(), mechanism: initial.mechanism ?? empty(), class: initial.class ?? empty() };
  const state = { current: { meta: {}, records: { ...tables } } as unknown as CanonicalState };
  const findings = createFindingStore();
  const merges: L4Rig['merges'][number][] = [];
  const scheduled: (() => void)[] = [];
  const spying: FindingStore = {
    ...findings,
    replaceForRules(subjects, ruleIds, list) {
      merges.push({ ruleIds: [...ruleIds], subjects: subjects.map((s) => s.id).sort() });
      findings.replaceForRules(subjects, ruleIds, list);
    },
  };
  const ports: L4Ports = { state: () => state.current, findings: spying, chem: fake.port, schedule: (run) => void scheduled.push(run) };
  return {
    state,
    findings,
    merges,
    scheduled,
    errors: [],
    ports,
    commit(next, moved) {
      const records = { ...(state.current.records as unknown as Record<string, unknown>) };
      for (const [kind, table] of Object.entries(next)) records[kind] = table;
      state.current = { ...state.current, records } as unknown as CanonicalState;
      return { revision: 1, label: 'test', cause: 'command', created: moved.created ?? [], updated: moved.updated ?? [], deleted: moved.deleted ?? [], patches: [], inversePatches: [] };
    },
  };
}
