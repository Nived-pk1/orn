/**
 * The in-process import pipeline (the same Phase 3 code the compute worker runs), as its own chunk: `import-service.ts` loads it
 * the first time a preview or revise runs on this thread (step 5.7, lazy loading).
 */
import { createImportSession, parseImportSource, type ImportSession, type ImportSessionDeps } from '@/io';

export interface InProcessImport {
  readonly session: ImportSession;
  readonly parseImportSource: typeof parseImportSource;
}

export function createInProcessImport(deps: ImportSessionDeps): InProcessImport {
  return { session: createImportSession(deps), parseImportSource };
}
