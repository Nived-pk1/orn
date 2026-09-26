/**
 * The rule list. Adding a rule means adding one object to one list; no rule edits another (§4).
 * Step 1.8 appends the L3 catalogue here.
 */
import type { ValidationRule } from '../contracts';
import { assertUniqueRuleIds } from '../runner';
import { REFERENCE_RULES } from './references';

export const RULES: readonly ValidationRule[] = [...REFERENCE_RULES];

assertUniqueRuleIds(RULES);
