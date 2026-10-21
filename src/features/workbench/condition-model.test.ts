/**
 * The condition recipes and the summary line (step 6.4a part 2, D1 and D2): values are kept exactly as entered, a new field starts empty,
 * every edit of a parsed field confirms it, and the summary is the arrow's own builder over the fields that already satisfy the schema.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import type { DraftRecipe } from '@/core/editing';
import { addQualifier, clearField, confirmField, moveQualifier, NO_CONDITIONS, parametersOf, removeQualifier, setAnhydrous, setChoice, setConditionText, setListMember, setMeasureChoice, setMeasureKind, setMeasureNumber, setQualifier, stageLoc, summaryOf, variantLoc, caveatLoc, paramsPath } from './condition-model';

const empty = () => ({ solventCharacter: [], activation: [], other: [], parsedFields: [] });
const draftOf = (parameters: Record<string, unknown> = empty()) => ({ stages: [{ id: 'stg_a', kind: 'reaction', participantIds: [], parameters }], conditionVariants: [{ id: 'cvr_a', label: 'x', parameters: empty(), participantIds: [] }] });
const run = <T,>(draft: T, ...recipes: DraftRecipe[]): T => produce(draft, (d) => { for (const recipe of recipes) recipe(d as never); });
const stage = (draft: unknown) => parametersOf(draft, stageLoc(0));

describe('the condition recipes', () => {
  it('a new measure stores only its kind; the number, unit and word come after, exactly as entered', () => {
    let d = run(draftOf(), setMeasureKind(stageLoc(0), 'temperature', 'value'));
    expect(stage(d).temperature).toEqual({ kind: 'value' });
    d = run(d, setMeasureNumber(stageLoc(0), 'temperature', 'value', 25.5), setMeasureChoice(stageLoc(0), 'temperature', 'unit', 'C'));
    expect(stage(d).temperature).toEqual({ kind: 'value', value: 25.5, unit: 'C' });
  });

  it('a value becomes a range keeping its unit (no conversion); a word drops the unit; "Not stated" removes the field', () => {
    let d = run(draftOf(), setMeasureKind(stageLoc(0), 'temperature', 'value'), setMeasureChoice(stageLoc(0), 'temperature', 'unit', 'K'), setMeasureNumber(stageLoc(0), 'temperature', 'value', 443));
    d = run(d, setMeasureKind(stageLoc(0), 'temperature', 'range'));
    expect(stage(d).temperature).toEqual({ kind: 'range', unit: 'K' });
    d = run(d, setMeasureKind(stageLoc(0), 'temperature', 'qualitative'), setMeasureChoice(stageLoc(0), 'temperature', 'value', 'reflux'));
    expect(stage(d).temperature).toEqual({ kind: 'qualitative', value: 'reflux' });
    d = run(d, setMeasureKind(stageLoc(0), 'temperature', ''));
    expect('temperature' in stage(d)).toBe(false);
  });

  it('an emptied number box removes the number (never NaN or 0)', () => {
    let d = run(draftOf(), setMeasureKind(stageLoc(0), 'pressure', 'value'), setMeasureNumber(stageLoc(0), 'pressure', 'value', 2));
    d = run(d, setMeasureNumber(stageLoc(0), 'pressure', 'value', undefined));
    expect(stage(d).pressure).toEqual({ kind: 'value' });
  });

  it('choices, anhydrous (no is a stated value), list members (never twice), the free text and the qualifiers', () => {
    let d = run(draftOf(), setChoice(stageLoc(0), 'medium', 'acidic'), setAnhydrous(stageLoc(0), 'no'), setListMember(stageLoc(0), 'solventCharacter', 'aqueous', true), setListMember(stageLoc(0), 'solventCharacter', 'aqueous', true), setConditionText(stageLoc(0), 'sealed tube'));
    expect(stage(d)).toMatchObject({ medium: 'acidic', anhydrous: false, solventCharacter: ['aqueous'], text: 'sealed tube' });
    d = run(d, setAnhydrous(stageLoc(0), ''), setChoice(stageLoc(0), 'medium', ''), setListMember(stageLoc(0), 'solventCharacter', 'aqueous', false), setConditionText(stageLoc(0), ''));
    expect(stage(d)).toEqual(empty());
    d = run(d, addQualifier(stageLoc(0)), setQualifier(stageLoc(0), 0, 'sealed tube'), addQualifier(stageLoc(0)), setQualifier(stageLoc(0), 1, 'dark'), moveQualifier(stageLoc(0), 1, -1));
    expect(stage(d).other).toEqual(['dark', 'sealed tube']);
    d = run(d, removeQualifier(stageLoc(0), 0));
    expect(stage(d).other).toEqual(['sealed tube']);
  });

  it('works on a condition variant the same way and leaves the stage alone', () => {
    const d = run(draftOf(), setMeasureKind(variantLoc(0), 'time', 'qualitative'), setMeasureChoice(variantLoc(0), 'time', 'value', 'brief'));
    expect(parametersOf(d, variantLoc(0)).time).toEqual({ kind: 'qualitative', value: 'brief' });
    expect(stage(d)).toEqual(empty());
  });

  it('a recipe for a row that is not there changes nothing', () => {
    const d = draftOf();
    expect(run(d, setChoice(stageLoc(5), 'medium', 'acidic'))).toEqual(d);
  });
});

describe('parsed fields (RXN-015)', () => {
  const parsed = () => draftOf({ ...empty(), temperature: { kind: 'value', value: 443, unit: 'K' }, medium: 'acidic', parsedFields: ['temperature', 'medium'] });

  it('Confirm removes only that field and leaves its value', () => {
    const d = run(parsed(), confirmField(stageLoc(0), 'temperature'));
    expect(stage(d)).toMatchObject({ temperature: { kind: 'value', value: 443, unit: 'K' }, medium: 'acidic', parsedFields: ['medium'] });
  });

  it('editing a field confirms it; so does taking its value away', () => {
    let d = run(parsed(), setMeasureNumber(stageLoc(0), 'temperature', 'value', 453));
    expect(stage(d).parsedFields).toEqual(['medium']);
    d = run(d, setChoice(stageLoc(0), 'medium', ''));
    expect(stage(d).parsedFields).toEqual([]);
  });

  it('editing another field leaves the parsed one parsed', () => {
    const d = run(parsed(), setAnhydrous(stageLoc(0), 'yes'));
    expect(stage(d).parsedFields).toEqual(['temperature', 'medium']);
  });

  it('clearField takes a list or a value out', () => {
    const d = run(draftOf({ ...empty(), solventCharacter: ['aqueous'], text: 'x', medium: 'basic' }), clearField(stageLoc(0), 'solventCharacter'), clearField(stageLoc(0), 'text'), clearField(stageLoc(0), 'medium'));
    expect(stage(d)).toEqual(empty());
  });
});

describe('the summary line', () => {
  it('is the arrow builder joined by " · " (temperature, pressure, light, medium, time, ... other)', () => {
    const params = { ...empty(), temperature: { kind: 'range', min: 0, max: 5, unit: 'C' }, medium: 'acidic', other: ['sealed tube'] };
    expect(summaryOf(params)).toBe('0–5 °C · acidic medium · sealed tube');
    expect(summaryOf({ ...empty(), temperature: { kind: 'qualitative', value: 'reflux' } })).toBe('reflux');
  });

  it('leaves out a half-typed field instead of writing nonsense; says so when nothing is left', () => {
    expect(summaryOf({ ...empty(), temperature: { kind: 'value', value: 25 } })).toBe(NO_CONDITIONS);
    expect(summaryOf({ ...empty(), temperature: { kind: 'value', value: 25 }, medium: 'basic' })).toBe('basic medium');
    expect(summaryOf(empty())).toBe(NO_CONDITIONS);
  });

  it('a solvent character alone is not on the arrow, so it is not in the line', () => {
    expect(summaryOf({ ...empty(), solventCharacter: ['aqueous'] })).toBe(NO_CONDITIONS);
  });
});

describe('a caveat\'s trigger conditions (step 6.6b part 5): the same recipes at the top level', () => {
  it('the path is triggerConditions; reading never creates the block; an edit creates it with the schema\'s lists', () => {
    expect(paramsPath(caveatLoc)).toBe('triggerConditions');
    const draft = { id: 'cav_x' };
    expect(parametersOf(draft, caveatLoc)).toEqual({});
    expect(draft).toEqual({ id: 'cav_x' });
    const next = run(draft as Record<string, unknown>, setChoice(caveatLoc, 'medium', 'acidic'));
    expect(next.triggerConditions).toEqual({ solventCharacter: [], activation: [], other: [], parsedFields: [], medium: 'acidic' });
    expect(summaryOf(parametersOf(next, caveatLoc))).toBe('acidic medium');
  });
  it('a stage and a caveat do not interfere', () => {
    const next = run({ ...draftOf(), id: 'c' } as Record<string, unknown>, setChoice(caveatLoc, 'light', 'uv'));
    expect(stage(next)).toEqual(empty());
  });
});
