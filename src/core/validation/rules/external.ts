/**
 * Catalogue rules (VALIDATION_RULES.md §3) that core cannot evaluate because they need something
 * outside the canonical state. They are raised by the layer that has the missing input, using the
 * same `Finding` shape and stable IDs; this list lets a test prove every catalogue ID has an owner.
 */
export const EXTERNAL_RULES: Readonly<Record<string, string>> = {
  'AST-002': 'Asset blob missing from storage — persistence boot integrity check (phase 3)',
  'AST-003': 'Asset bytes do not match sha256 — import pipeline, quarantines the asset (phase 3)',
  'CHEM-001': 'L4, chem worker (phase 4)',
  'CHEM-002': 'L4, chem worker (phase 4)',
  'CHEM-003': 'L4, chem worker (phase 4)',
  'CHEM-004': 'L4, chem worker (phase 4)',
  'CHEM-005': 'L4, chem worker (phase 4)',
  'CHEM-006': 'L4, chem worker (phase 4)',
  'CHEM-007': 'L4, chem worker (phase 4)',
  'CHEM-008': 'L4, chem worker (phase 4)',
  'CHEM-009': 'L4, chem worker (phase 4)',
};
