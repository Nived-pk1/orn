/** The classification recipes and words (step 6.6a, decision C3): `{ conceptId, certainty }`, certainty with NO default. */
import { describe, expect, it } from 'vitest';
import { addClassification, CERTAINTY_WORDS, classificationLine, classificationsOf, removeClassification, setCertainty } from './classification-model';

const run = (draft: Record<string, unknown>, ...recipes: ((d: Record<string, unknown>) => void)[]) => {
  const copy = structuredClone(draft);
  for (const recipe of recipes) recipe(copy);
  return copy;
};

describe('classification model', () => {
  it('adding a concept leaves the certainty ABSENT (no default); the same concept is not added twice', () => {
    const d = run({ reactionTypes: [] }, addClassification('reactionTypes', 'cpt_a'), addClassification('reactionTypes', 'cpt_a'));
    expect(d.reactionTypes).toEqual([{ conceptId: 'cpt_a' }]);
  });
  it('sets the certainty from the schema list; empty removes it', () => {
    expect(run({ mechanismClasses: [{ conceptId: 'c' }] }, setCertainty('mechanismClasses', 0, 'probable')).mechanismClasses).toEqual([{ conceptId: 'c', certainty: 'probable' }]);
    expect(run({ mechanismClasses: [{ conceptId: 'c', certainty: 'definite' }] }, setCertainty('mechanismClasses', 0, '')).mechanismClasses).toEqual([{ conceptId: 'c' }]);
  });
  it('removes by position', () => {
    expect(run({ reactionTypes: [{ conceptId: 'a' }, { conceptId: 'b' }] }, removeClassification('reactionTypes', 0)).reactionTypes).toEqual([{ conceptId: 'b' }]);
  });
  it('the view reads what is there; certainty is "" when absent', () => {
    expect(classificationsOf({ reactionTypes: [{ conceptId: 'a', certainty: 'possible' }, { conceptId: 'b' }, 5] }, 'reactionTypes')).toEqual([{ conceptId: 'a', certainty: 'possible' }, { conceptId: 'b', certainty: '' }]);
  });
  it('the summary line is "SN2 (definite)", or says the certainty is not chosen', () => {
    expect(classificationLine('SN2', 'definite')).toBe('SN2 (definite)');
    expect(classificationLine('SN2', '')).toBe('SN2 (certainty not chosen)');
    expect(Object.keys(CERTAINTY_WORDS)).toEqual(['definite', 'probable', 'possible']);
  });
});
