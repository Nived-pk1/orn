/**
 * The finding badges of a record (step 5.6a; UI_ARCHITECTURE §9 L1, DOMAIN_MODEL §7): counts per severity in words, and what the L4
 * chemistry checks say about it. Findings are derived and never change the record (INV-24); nothing here is a verdict about chemistry.
 */
import type { Finding, Severity } from '@/core/validation';
import type { SubjectStatus } from '@/workers/chem';

const SEVERITY_WORD: Readonly<Record<Severity, readonly [string, string]>> = {
  error: ['error', 'errors'],
  warning: ['warning', 'warnings'],
  review_required: ['review required', 'review required'],
  info: ['note', 'notes'],
};
export const SEVERITY_ORDER: readonly Severity[] = ['error', 'warning', 'review_required', 'info'];

export interface Badge {
  readonly severity: Severity | 'l4';
  readonly text: string;
}

export function severityBadges(findings: readonly Finding[]): Badge[] {
  const badges: Badge[] = [];
  for (const severity of SEVERITY_ORDER) {
    const count = findings.filter((finding) => finding.severity === severity).length;
    if (count === 0) continue;
    const [one, many] = SEVERITY_WORD[severity];
    badges.push({ severity, text: severity === 'review_required' ? `${count} review required` : `${count} ${count === 1 ? one : many}` });
  }
  return badges;
}

/** The L4 status in words, or undefined when the record is not a subject of the chemistry checks. */
export function l4Words(status: SubjectStatus): string | undefined {
  switch (status.state) {
    case 'none':
      return undefined;
    case 'pending':
      return 'Chemistry checks: waiting to run';
    case 'checked':
      return status.notCompared.length === 0 ? 'Chemistry checks: done' : `Chemistry checks: done, ${status.notCompared.length} ${status.notCompared.length === 1 ? 'comparison' : 'comparisons'} not made`;
    case 'not_checked':
      return `Chemistry checks: not done (${status.message})`;
  }
}

export const REVIEW_WORD: Readonly<Record<string, string>> = {
  verified: 'Verified',
  review_required: 'Review required',
  unreviewed: 'Not yet reviewed',
};
