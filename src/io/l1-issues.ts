import type { Finding } from '@/core/validation/contracts';

/** One-line rendering of an L1 finding, for a quarantine's `issues` list. Mirrors src/persistence/boot-load.ts's own (io must not import persistence). */
export const issueOf = (finding: Finding): string => `${finding.path ?? '(record)'}: ${finding.message}`;
