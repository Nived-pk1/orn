/**
 * The live panel's checks beyond the schema (step 6.2a, part 2): 500 ms after the last edit the draft is sent to the compute worker
 * (L1-L3 as if committed) and, for a species, its structure to the chem worker (L4). Every ask carries the draft VERSION; an answer
 * for any version but the newest is dropped, so a slow answer never shows over a newer draft. A worker that cannot answer is said in
 * words. This is advice: Save runs the store's own gate. No chemistry and no rules here: the workers decide, the hook keeps order.
 */
import { useEffect, useRef, useState } from 'react';
import type { RecordKind } from '@/core/schema';
import type { Finding } from '@/core/validation';
import type { ClassSuggestion, DraftChecksPort } from './check-contracts';
import type { EditorPort } from './editor-contracts';

export const DRY_RUN_DEBOUNCE_MS = 500;

export type CheckPhase = 'off' | 'checking' | 'checked' | 'unavailable';

export interface LiveChecks {
  /** L2-L3 of the draft against the other records (compute worker). */
  readonly dry: { readonly phase: CheckPhase; readonly findings: readonly Finding[]; readonly message?: string };
  /** L4 of the draft's structure (chem worker). `off`: no structure, nothing to check. */
  readonly structure: { readonly phase: CheckPhase; readonly findings: readonly Finding[]; readonly suggestions: readonly ClassSuggestion[]; readonly notCompared: readonly string[]; readonly message?: string };
}

const OFF: LiveChecks = {
  dry: { phase: 'off', findings: [] },
  structure: { phase: 'off', findings: [], suggestions: [], notCompared: [] },
};

/**
 * `hasSchemaError`: the draft fails L1, so the dry run (which would only repeat L1) is not asked. `draft` changes identity with every
 * edit (Immer), which is what versions it.
 */
export function useLiveChecks(kind: RecordKind, draft: unknown, hasSchemaError: boolean, port: Pick<EditorPort, 'checks' | 'timers'>): LiveChecks {
  const checks: DraftChecksPort | undefined = port.checks;
  const [state, setState] = useState<LiveChecks>(OFF);
  const version = useRef(0);
  const first = useRef(true);
  const { timers } = port;

  useEffect(() => {
    if (checks === undefined) return undefined;
    version.current += 1;
    const mine = version.current;
    const current = (v: number): boolean => v === version.current;
    const run = (): void => {
      if (hasSchemaError) setState((was) => ({ ...was, dry: { phase: 'off', findings: [] } }));
      else {
        setState((was) => ({ ...was, dry: { ...was.dry, phase: 'checking' } }));
        void checks.dryRun(kind, draft, mine).then((answer) => {
          if (!current(answer.version)) return; // an answer for an older draft is dropped
          setState((was) => ({ ...was, dry: answer.state === 'checked' ? { phase: 'checked', findings: answer.findings } : { phase: 'unavailable', findings: [], message: answer.message } }));
        });
      }
      setState((was) => ({ ...was, structure: { ...was.structure, phase: 'checking' } }));
      void checks.structure(kind, draft, mine).then((answer) => {
        if (!current(answer.version)) return;
        setState((was) => ({
          ...was,
          structure:
            answer.state === 'checked'
              ? { phase: 'checked', findings: answer.findings, suggestions: answer.suggestions, notCompared: answer.notCompared }
              : answer.state === 'none'
                ? { phase: 'off', findings: [], suggestions: [], notCompared: [] }
                : { phase: 'unavailable', findings: [], suggestions: [], notCompared: [], message: answer.message },
        }));
      });
    };
    if (first.current) {
      first.current = false;
      run();
      return undefined;
    }
    return timers.after(DRY_RUN_DEBOUNCE_MS, run);
  }, [checks, draft, hasSchemaError, kind, timers]);

  return checks === undefined ? OFF : state;
}
