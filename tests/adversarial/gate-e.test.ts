/**
 * Gate E completeness (docs/TEST_STRATEGY.md §5-§6, Gate column "E"; docs/IMPLEMENTATION_PLAN.md step 5.10a). The rows are proved in a
 * browser (tests/e2e/*.spec.ts, named by ID in their titles; see gate-matrix.ts); this file checks that none is missing. The Gate E
 * criteria of §6 add the browser halves of ADV-038 and ADV-039 (their integration halves are Gate C) and INV-28 (one writer at a time).
 */
import { describeGateCompleteness } from './gate-matrix';

describeGateCompleteness('E', 3, ['ADV-038', 'ADV-039', 'INV-28']);
