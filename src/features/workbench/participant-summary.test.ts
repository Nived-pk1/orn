import { describe, expect, it } from 'vitest';
import { summaryLineOf } from './participant-summary';
import type { ParticipantView } from './participant-model';

const view = (change: Partial<ParticipantView> = {}): ParticipantView => ({
  id: 'prt_a',
  substance: { kind: 'species', id: 'spc_a' },
  role: 'reactant',
  coefficient: undefined,
  phase: '',
  strength: '',
  dry: false,
  equivalents: undefined,
  qualifier: '',
  quantityText: '',
  profileId: '',
  flags: { contributesAtoms: 'default', consumed: 'default', catalytic: 'default' },
  primary: false,
  originalText: '',
  stageIndex: -1,
  ...change,
});

describe('the summary line of a participant', () => {
  it('writes every stated part, in order, with middle dots', () => {
    expect(summaryLineOf(2, 'Ethanol', view({ coefficient: 2, phase: 'aq', strength: 'concentrated' }))).toBe('2. Ethanol · Reactant · ×2 · aq · Concentrated');
  });

  it('leaves out a part that is not stated, never "Not stated"', () => {
    expect(summaryLineOf(1, 'Ethanol', view())).toBe('1. Ethanol · Reactant');
    expect(summaryLineOf(1, 'Ethanol', view({ coefficient: 1.5 }))).toBe('1. Ethanol · Reactant · ×1.5');
    expect(summaryLineOf(1, 'Ethanol', view({ phase: 'l' }))).toBe('1. Ethanol · Reactant · l');
    expect(summaryLineOf(1, 'Ethanol', view({ strength: 'dilute' }))).toBe('1. Ethanol · Reactant · Dilute');
    expect(summaryLineOf(1, 'Ethanol', view({ coefficient: 3, strength: 'glacial' }))).toBe('1. Ethanol · Reactant · ×3 · Glacial');
  });

  it('writes a role with an underscore in words, and leaves out a role that is not chosen yet', () => {
    expect(summaryLineOf(3, 'HCl', view({ role: 'workup_reagent' }))).toBe('3. HCl · Workup reagent');
    expect(summaryLineOf(3, 'HCl', view({ role: '' }))).toBe('3. HCl');
  });

  it('a participant with no substance says so', () => {
    expect(summaryLineOf(1, undefined, view({ substance: undefined }))).toBe('1. No substance · Reactant');
  });
});
