/**
 * The draft checks of the editor (step 6.2a, part 2): the live panel's two asks. `dryRun` is L1-L3 of the draft as if committed, in the
 * compute worker (the replica is never changed). `structure` is L4 for the draft's structure from the chem worker (CHEM-001 to CHEM-004
 * and CHEM-006 by `checkSpecies`, CHEM-007 by the class SMARTS probes). Both answer a value, never throw; a worker that cannot answer is
 * `unavailable` with its words. The advice is never the gate: Save runs the store's own validation.
 */
import { mechanismPlan } from '@/chem/checks/plan-mechanism';
import { membershipPlan, readMembership } from '@/chem/checks/plan-species';
import type { CheckDraft, NotCompared, SpeciesCheckRequest } from '@/chem/checks/contracts';
import { toFinding } from '@/chem/checks/rules';
import type { StoreHandle } from '@/core/commands';
import { StructureRepSchema, type Mechanism, type RecordRef, type Species } from '@/core/schema';
import { parseRecord } from '@/core/validation';
import type { ClassSuggestion, DraftChecksPort, StructureChecksAnswer } from '@/features/workbench';
import type { ChemService } from '@/workers/chem';
import type { ReplicaSync } from '@/workers/compute';

export interface DraftChecksOptions {
  readonly store: Pick<StoreHandle, 'getState' | 'getRevision'>;
  readonly sync: () => ReplicaSync | undefined;
  readonly chem: Pick<ChemService, 'checkSpecies' | 'matches'> & Partial<Pick<ChemService, 'checkMechanism'>>;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** The request for the chem worker from a draft that may still be invalid as a whole: each piece only when it is itself well-formed. */
export function requestOfDraft(draft: unknown): SpeciesCheckRequest | undefined {
  const fields = (typeof draft === 'object' && draft !== null ? draft : {}) as Record<string, unknown>;
  const id = text(fields['id']);
  const structure = StructureRepSchema.safeParse(fields['structure']);
  if (id === undefined || !structure.success) return undefined;
  const formula = text(fields['formula']);
  const charge = fields['charge'];
  const stereo = fields['stereo'] as { descriptors?: unknown } | undefined;
  const descriptors = Array.isArray(stereo?.descriptors) && stereo.descriptors.every((d) => typeof d === 'string') ? (stereo.descriptors as string[]) : [];
  return {
    id,
    structure: structure.data,
    ...(formula === undefined || formula.trim() === '' ? {} : { formula }),
    ...(typeof charge === 'number' && Number.isInteger(charge) ? { charge } : {}),
    ...(descriptors.length === 0 ? {} : { stereoDescriptors: descriptors }),
  };
}

export function createDraftChecks(options: DraftChecksOptions): DraftChecksPort {
  const { store, chem } = options;

  return {
    async dryRun(kind, draft, version) {
      const sync = options.sync();
      if (sync === undefined || sync.status().state === 'down') {
        return { version, state: 'unavailable', message: 'The checking worker is not running, so the references and names of this draft were not checked. Save still checks them.' };
      }
      const ask = () => sync.client.checkDraft({ revision: store.getRevision(), kind, draft });
      let answer = await ask();
      // The replica follows the store a moment behind an edit: wait for it once, then ask again.
      if (answer.ok && !answer.value.ok && answer.value.code === 'REPLICA_STALE') {
        await sync.settled();
        answer = await ask();
      }
      if (!answer.ok) return { version, state: 'unavailable', message: `The checking worker did not answer (${answer.error.code}). Save still checks the draft.` };
      if (!answer.value.ok) {
        const reason = answer.value.code === 'REPLICA_STALE' ? 'the checking worker is catching up with your last save' : answer.value.message;
        return { version, state: 'unavailable', message: `The draft was not checked against the other records: ${reason}. Save still checks it.` };
      }
      return { version, state: 'checked', findings: answer.value.findings };
    },

    async structure(kind, draft, version): Promise<StructureChecksAnswer> {
      if (kind === 'mechanism') return mechanismStructure(options, draft, version);
      if (kind !== 'species') return { version, state: 'none' };
      const request = requestOfDraft(draft);
      if (request === undefined) return { version, state: 'none' };
      const subject: RecordRef = { kind: 'species', id: request.id };
      const down = (message: string): StructureChecksAnswer => ({ version, state: 'unavailable', message: `The structure was not checked: ${message}` });
      const call = await chem.checkSpecies([request]);
      if (!call.ok) return down(call.error);
      const result = call.value.results[0];
      if (result === undefined) return down('the chemistry engine gave no answer');
      if (result.status.state === 'not_checked') return down(result.status.message);
      const drafts: CheckDraft[] = [...result.drafts];
      const notCompared: NotCompared[] = [...result.status.notCompared];
      const suggestions: ClassSuggestion[] = [];
      // CHEM-007 needs a whole species; a draft that is not one yet has no class advice (its other findings say why).
      const parsed = result.canonicalSmiles === undefined ? undefined : parseRecord('species', draft);
      if (parsed?.ok === true) {
        const species = parsed.record as Species;
        const state = store.getState();
        const plan = membershipPlan(state, species);
        notCompared.push(...plan.notCompared);
        if (plan.probes.length > 0) {
          const matched = await chem.matches(plan.probes);
          if (!matched.ok) return down(matched.error);
          const reading = readMembership(state, species, plan, matched.value.outcomes);
          if (reading.unanswered !== undefined) return down(reading.unanswered.message);
          drafts.push(...reading.drafts);
          notCompared.push(...reading.notCompared);
          for (const found of reading.drafts) {
            const data = found.data as { direction?: unknown; classId?: unknown } | undefined;
            if (data?.direction === 'suggest_add' && typeof data.classId === 'string') suggestions.push({ classId: data.classId });
          }
        }
      }
      return {
        version,
        state: 'checked',
        findings: drafts.map((found) => toFinding(found.ruleId, subject, found)),
        suggestions,
        notCompared: notCompared.map((item) => `${item.ruleId}: ${item.reason}`),
      };
    },
  };
}

/**
 * CHEM-008 for a mechanism draft (step 6.5a part 4): the same plan the stored-record check uses (`mechanismPlan`), asked of the chem worker for
 * the draft as it stands. Only a draft that already passes L1 is a mechanism the plan can read; any other is `none` (its L1 findings say what
 * is wrong). A step that uses atom maps but has no structure is listed as not compared, never as clean.
 */
async function mechanismStructure(options: DraftChecksOptions, draft: unknown, version: number): Promise<StructureChecksAnswer> {
  const parsed = parseRecord('mechanism', draft);
  if (!parsed.ok) return { version, state: 'none' };
  const mechanism = parsed.record as Mechanism;
  const plan = mechanismPlan(mechanism);
  if (plan.requests.length === 0 && plan.notCompared.length === 0) return { version, state: 'none' };
  const subject: RecordRef = { kind: 'mechanism', id: mechanism.id };
  const notCompared = plan.notCompared.map((item) => `${item.ruleId}: ${item.reason}`);
  if (plan.requests.length === 0) return { version, state: 'checked', findings: [], suggestions: [], notCompared };
  if (options.chem.checkMechanism === undefined) return { version, state: 'unavailable', message: 'The structure was not checked: the chemistry engine is not available here.' };
  const call = await options.chem.checkMechanism(plan.requests);
  if (!call.ok) return { version, state: 'unavailable', message: `The structure was not checked: ${call.error}` };
  const findings = [];
  for (const result of call.value.results) {
    if (result.status.state === 'not_checked') return { version, state: 'unavailable', message: `The structure was not checked: ${result.status.message}` };
    notCompared.push(...result.status.notCompared.map((item) => `${item.ruleId}: ${item.reason}`));
    findings.push(...result.drafts.map((found) => toFinding(found.ruleId, subject, found)));
  }
  return { version, state: 'checked', findings, suggestions: [], notCompared };
}
