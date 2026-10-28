/**
 * The words of route search (step 7.2a C2): what each engine warning and each truncation means, in plain text for a student. Pure.
 * Nothing the engine wrote reaches the user: an unknown warning is said in general words, never shown raw.
 */
import type { Truncation } from '../contracts';
import { CLASS_LEVEL_MATCH_WARNING } from './moves';

/** Every warning text the engine can put on a step (a new one must be added here with its words). */
export const KNOWN_ROUTE_WARNINGS: readonly string[] = [CLASS_LEVEL_MATCH_WARNING];

const WARNING_WORDS: Readonly<Record<string, string>> = {
  [CLASS_LEVEL_MATCH_WARNING]: 'Matched through a class: check that this compound fits.',
};

const UNKNOWN_WARNING_WORDS = 'Check this step before relying on it.';

export function stepWarningWords(warning: string): string {
  return WARNING_WORDS[warning] ?? UNKNOWN_WARNING_WORDS;
}

const steps = (n: number): string => (n === 1 ? '1 step' : `${n} steps`);

/** Why a search may have missed routes, and what to do about it. */
export function truncationWords(truncation: Truncation, maxSteps: number): string {
  switch (truncation.reason) {
    case 'max_depth':
      return `Longer routes than ${steps(maxSteps)} exist but were not searched. Allow more steps to see them.`;
    case 'time_budget':
      return 'The search ran out of time, so some routes may be missing. Choose a starting material or allow fewer steps.';
    case 'aborted':
      return 'The search was stopped, so the routes may be incomplete.';
    case 'max_nodes':
    case 'max_edges':
      return 'The search looked at as many possibilities as it is allowed to, so some routes may be missing. Choose a starting material or allow fewer steps.';
  }
}

export const routeCountWords = (n: number): string => (n === 1 ? '1 route found' : `${n} routes found`);

export const noRouteWords = (targetName: string, maxSteps: number): string => `No route to ${targetName} within ${steps(maxSteps)}.`;

/** "3 steps from Ethanol" (the first substance of the route), or just "3 steps". */
export const routeSizeWords = (stepCount: number, startName: string | undefined): string => (startName === undefined ? steps(stepCount) : `${steps(stepCount)} from ${startName}`);
