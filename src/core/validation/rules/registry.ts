/**
 * The rule list. Adding a rule means adding one object to one list; no rule edits another (§4).
 * Catalogue IDs handled elsewhere are listed in ./external.ts.
 */
import type { ValidationRule } from '../contracts';
import { assertUniqueRuleIds } from '../runner';
import { ARRANGEMENT_RULES } from './arrangement';
import { CONDITION_RULES } from './conditions';
import { CURRICULUM_RULES } from './curriculum';
import { MECHANISM_RULES } from './mechanisms';
import { REACTION_MORE_RULES } from './reactions-more';
import { REACTION_RULES } from './reactions';
import { REFERENCE_RULES } from './references';
import { RELATIONSHIP_RULES } from './relationships';
import { ROUTE_RULES } from './routes';
import { SUBSTANCE_RULES } from './substances';

export const L2_RULES: readonly ValidationRule[] = REFERENCE_RULES;

export const L3_RULES: readonly ValidationRule[] = [
  ...REACTION_RULES,
  ...REACTION_MORE_RULES,
  ...CONDITION_RULES,
  ...SUBSTANCE_RULES,
  ...MECHANISM_RULES,
  ...RELATIONSHIP_RULES,
  ...ROUTE_RULES,
  ...CURRICULUM_RULES,
  ...ARRANGEMENT_RULES,
];

export const RULES: readonly ValidationRule[] = [...L2_RULES, ...L3_RULES];

assertUniqueRuleIds(RULES);
