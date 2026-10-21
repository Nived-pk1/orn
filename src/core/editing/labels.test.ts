/** The words for a relationship in a history label and a title (step 6.6c part A, L3): both ends, in the schema's own words, names cut past 40 characters. */
import { describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { composedName, relationshipWords, shortName, NAME_WORDS_MAX } from './labels';
import type { AnyRecord } from '../schema';

describe('shortName', () => {
  it('keeps a name of 40 characters or fewer and cuts a longer one to 40 characters and "..."', () => {
    expect(NAME_WORDS_MAX).toBe(40);
    expect(shortName('x'.repeat(40))).toBe('x'.repeat(40));
    expect(shortName('y'.repeat(41))).toBe(`${'y'.repeat(40)}...`);
  });
});

describe('relationshipWords', () => {
  it('names both ends around the type\'s label, from first to second', () => {
    expect(relationshipWords('commonly_confused_with', 'Aldol', 'Cannizzaro')).toBe('Aldol commonly confused with Cannizzaro');
    expect(relationshipWords('prerequisite_of', 'Inductive effect', "Markovnikov's rule")).toBe("Inductive effect prerequisite of Markovnikov's rule");
  });
  it('cuts each long name, not the whole line', () => {
    const long = 'a'.repeat(50);
    expect(relationshipWords('related_to', long, 'B')).toBe(`${'a'.repeat(40)}... related to B`);
  });
  it('an unknown type is said with its raw words, never dropped', () => {
    expect(relationshipWords('odd_type', 'A', 'B')).toBe('A odd type B');
  });
});

describe('composedName', () => {
  const state = demoState();
  it('names a topic mapping by its record and topic', () => {
    const mapping = state.records.topic_mapping['tmp_alcohol1-to-aldehyde-pcc-alcohol-oxidation-dehydration' as never] as AnyRecord;
    expect(composedName(state, mapping)).toBe('1° alcohol → aldehyde (PCC) in Oxidation and dehydration of alcohols');
  });
  it('names an exam relevance by its record and exam', () => {
    const relevance = state.records.exam_relevance['erl_beckmann-advanced' as never] as AnyRecord;
    expect(composedName(state, relevance)).toMatch(/ for JEE Advanced$/);
  });
  it('names a map family by its label, else its class; any other kind has none', () => {
    const anchor = state.records.navigator_anchor['anc_alcohols' as never] as AnyRecord;
    expect(composedName(state, anchor)).toBe('Alcohols');
    expect(composedName(state, { ...anchor, label: 'Alcohol family' } as AnyRecord)).toBe('Alcohol family');
    expect(composedName(state, state.records.species[Object.keys(state.records.species)[0] as never] as AnyRecord)).toBeUndefined();
  });
});
