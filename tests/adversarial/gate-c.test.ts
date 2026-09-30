/**
 * Gate C completeness (docs/TEST_STRATEGY.md §5-§6, Gate column "C"; docs/IMPLEMENTATION_PLAN.md step 3.12). The
 * rows are covered close to the code they exercise (named by ID in those tests); this file checks that none is
 * missing. An ID counts only when it appears in a test title (see gate-matrix.ts). The real-browser halves of
 * ADV-038 and ADV-039 are Gate E rows (Phase 3 note 5); their integration halves are named here.
 */
import { describeGateCompleteness } from './gate-matrix';

describeGateCompleteness('C', 11, ['INV-19', 'INV-20', 'INV-21', 'INV-23', 'INV-28', 'P-01', 'P-02', 'P-03']);
