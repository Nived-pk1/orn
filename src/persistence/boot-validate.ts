/**
 * Boot's L1-L3 pass (docs/PERSISTENCE.md §4 step 5, step 4.2d, Phase 4 contract decision Q4): the findings of the loaded state
 * come from the injected validation port when there is one (the compute worker: it validates its replica, and `open()` builds
 * NO indexes), otherwise from this thread (`validateAll` over a fresh index build, as before). What the port answers is
 * checked with the store's own `checkPrecomputed` rules; a port that fails or answers wrongly never blocks boot: the data is
 * validated in this thread instead, and the boot report says where validation ran and why (nothing is silent).
 */
import { checkPrecomputed, precomputedFor, type PrecomputedFindings } from '@/core/commands';
import { coreIndexEngine } from '@/core/indexes/engine';
import type { CanonicalState } from '@/core/schema';
import { validator } from '@/core/validation';
import type { BootPorts } from './boot-ports';
import type { BootReport } from './contracts';
import { describeError } from './events';

export interface BootValidation {
  readonly precomputed: PrecomputedFindings;
  readonly report: NonNullable<BootReport['validation']>;
}

/** L1-L3 findings of `state` (revision `revision`) computed in this thread: one index build and one `validateAll`. */
export function validateInProcess(state: CanonicalState, revision: number): PrecomputedFindings {
  return precomputedFor(state, revision, validator.validateAll(state, coreIndexEngine.build(state, revision)));
}

export async function validateForBoot(ports: Pick<BootPorts, 'validate'>, state: CanonicalState, revision: number): Promise<BootValidation> {
  if (ports.validate === undefined) {
    return { precomputed: validateInProcess(state, revision), report: { where: 'main', reason: 'no validation port was given; validated in this thread' } };
  }
  let why: string;
  try {
    const answer = await ports.validate(state, revision);
    const problem = checkPrecomputed(state, revision, answer);
    if (problem === undefined) return { precomputed: answer, report: { where: 'worker', reason: 'validated by the injected validation port (the compute worker)' } };
    why = `the validation port's findings were refused (${problem.message})`;
  } catch (error) {
    why = `the validation port could not validate (${describeError(error)})`;
  }
  return { precomputed: validateInProcess(state, revision), report: { where: 'main', reason: `${why}; validated in this thread instead` } };
}
