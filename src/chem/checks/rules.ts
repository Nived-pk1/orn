/**
 * The L4 rule catalogue (docs/VALIDATION_RULES.md §3, "L4 - chemistry"): ID, default severity, who raises it. The core registry
 * only lists the IDs as external rules (`EXTERNAL_RULES`); a test proves the two agree. L4 rule IDs are NOT part of `RULE_SET_ID`
 * (that identifies the L1-L3 rules the compute worker and the store agree on).
 */
import { makeFinding } from '@/core/validation';
import type { Finding, FindingDraft, Severity } from '@/core/validation/contracts';
import type { RecordRef } from '@/core/schema';

export type L4Owner = 'worker' | 'service';

export interface L4Rule {
  readonly id: string;
  readonly defaultSeverity: Severity;
  /** `worker`: raised from the answers of the chem worker; `service`: raised on the main thread from a derived map. */
  readonly owner: L4Owner;
  /** False: defined in the catalogue but not built yet (see `reason`); it never raises a finding. */
  readonly implemented: boolean;
  readonly reason?: string;
  readonly description: string;
}

export const L4_RULES: readonly L4Rule[] = [
  { id: 'CHEM-001', defaultSeverity: 'warning', owner: 'worker', implemented: true, description: 'Structure cannot be parsed' },
  { id: 'CHEM-002', defaultSeverity: 'warning', owner: 'worker', implemented: true, description: 'Valence or sanitisation problem' },
  { id: 'CHEM-003', defaultSeverity: 'warning', owner: 'worker', implemented: true, description: 'Entered formula differs from derived formula' },
  { id: 'CHEM-004', defaultSeverity: 'warning', owner: 'worker', implemented: true, description: 'Entered charge differs from structure charge' },
  {
    id: 'CHEM-005',
    defaultSeverity: 'info',
    owner: 'worker',
    implemented: true,
    description: 'Atom imbalance (only when every atom-contributing participant and every product is a species with structure and coefficient)',
  },
  {
    id: 'CHEM-006',
    defaultSeverity: 'warning',
    owner: 'worker',
    implemented: false,
    reason: 'the rule does not say how a free-text descriptor ("2R", "Z", "cis") is compared with a structure; needs the reviewer (step 4.3b)',
    description: 'Stereo descriptors disagree with the structure',
  },
  {
    id: 'CHEM-007',
    defaultSeverity: 'info',
    owner: 'worker',
    implemented: true,
    description: 'Class SMARTS membership disagrees with stated classIds (both directions, as suggestions)',
  },
  {
    id: 'CHEM-008',
    defaultSeverity: 'warning',
    owner: 'worker',
    implemented: true,
    description: 'Mechanism bond change or electron movement uses an atom map absent from the step structures',
  },
  { id: 'CHEM-009', defaultSeverity: 'warning', owner: 'service', implemented: true, description: 'Two species have identical canonical structures' },
];

export const L4_RULE_IDS: readonly string[] = L4_RULES.map((rule) => rule.id);

const BY_ID: ReadonlyMap<string, L4Rule> = new Map(L4_RULES.map((rule) => [rule.id, rule] as const));

/** A finding of level 4 for `subject`: the ID is core's stable hash of (rule, subject, path). An unknown rule ID is a programmer error. */
export function toFinding(ruleId: string, subject: RecordRef, draft: FindingDraft): Finding {
  const rule = BY_ID.get(ruleId);
  if (rule === undefined) throw new RangeError(`${ruleId} is not an L4 rule`);
  return makeFinding({ id: rule.id, level: 4, severity: rule.defaultSeverity }, subject, draft);
}
