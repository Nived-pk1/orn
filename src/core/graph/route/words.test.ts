/** Step 7.2a C2: the words for route search's warnings and truncations; no code and no raw engine text reaches the user. */
import { describe, expect, it } from 'vitest';
import type { Truncation } from '../contracts';
import { CLASS_LEVEL_MATCH_WARNING } from './moves';
import { KNOWN_ROUTE_WARNINGS, noRouteWords, routeCountWords, routeSizeWords, stepWarningWords, truncationWords } from './words';

const TRUNCATION_REASONS: readonly Truncation['reason'][] = ['max_nodes', 'max_edges', 'max_depth', 'time_budget', 'aborted'];
const looksLikeCode = (text: string): boolean => /[a-z]+_[a-z]+|_|[A-Z]{4,}|\bid\b/.test(text);

describe('stepWarningWords', () => {
  it('the class-level match has its plain words', () => {
    expect(stepWarningWords(CLASS_LEVEL_MATCH_WARNING)).toBe('Matched through a class: check that this compound fits.');
  });
  it('every warning the engine can give has words of its own (not the fallback)', () => {
    const fallback = stepWarningWords('something nobody wrote words for');
    expect(KNOWN_ROUTE_WARNINGS).toContain(CLASS_LEVEL_MATCH_WARNING);
    for (const warning of KNOWN_ROUTE_WARNINGS) {
      const words = stepWarningWords(warning);
      expect(words).not.toBe(fallback);
      expect(words).not.toContain(warning);
      expect(looksLikeCode(words)).toBe(false);
    }
  });
  it('an unknown warning is said in general words and never shown raw', () => {
    const words = stepWarningWords('weird_new_code: details');
    expect(words).toBe('Check this step before relying on it.');
    expect(words).not.toContain('weird');
  });
});

describe('truncationWords', () => {
  it('every reason has words, none is the raw reason', () => {
    for (const reason of TRUNCATION_REASONS) {
      const words = truncationWords({ reason, hiddenNodeEstimate: 0 }, 5);
      expect(words.length).toBeGreaterThan(10);
      expect(words).not.toContain(reason);
      expect(looksLikeCode(words)).toBe(false);
    }
  });
  it('says what to do, and names the step limit when that is the cause', () => {
    expect(truncationWords({ reason: 'max_depth', hiddenNodeEstimate: 0 }, 3)).toBe('Longer routes than 3 steps exist but were not searched. Allow more steps to see them.');
    expect(truncationWords({ reason: 'aborted', hiddenNodeEstimate: 0 }, 3)).toBe('The search was stopped, so the routes may be incomplete.');
    expect(truncationWords({ reason: 'time_budget', hiddenNodeEstimate: 0 }, 3)).toMatch(/ran out of time/);
    expect(truncationWords({ reason: 'max_nodes', hiddenNodeEstimate: 0 }, 3)).toMatch(/Choose a starting material|fewer steps/);
  });
});

describe('the counts in words', () => {
  it('routeCountWords', () => {
    expect(routeCountWords(4)).toBe('4 routes found');
    expect(routeCountWords(1)).toBe('1 route found');
  });
  it('noRouteWords', () => {
    expect(noRouteWords('Phenol', 5)).toBe('No route to Phenol within 5 steps.');
    expect(noRouteWords('Phenol', 1)).toBe('No route to Phenol within 1 step.');
  });
  it('routeSizeWords', () => {
    expect(routeSizeWords(3, 'Ethanol')).toBe('3 steps from Ethanol');
    expect(routeSizeWords(1, 'Ethanol')).toBe('1 step from Ethanol');
    expect(routeSizeWords(2, undefined)).toBe('2 steps');
  });
});
