/**
 * T1 (step 6.7b, part A): an empty slot never shows the schema's "Unknown field slotOfClassId" text. The finding for a slot row says
 * "Choose a species of <class> (participant <n>)" / "(product <n> of outcome <m>)" as one ERROR; other findings are untouched.
 */
import { describe, expect, it } from 'vitest';
import { SLOT_KEY } from '@/core/editing';
import { parseRecord } from '@/core/validation';
import { slotFindings } from './slot-findings';

const describeClass = (id: string): string | undefined => (id === 'cls_a' ? 'Primary alcohol' : undefined);

const reaction = {
  participants: [{ ref: { kind: 'species', id: 'spc_x' } }, { ref: { kind: 'class', id: 'cls_a' }, [SLOT_KEY]: 'cls_a' }],
  outcomes: [{ products: [{ ref: { kind: 'class', id: 'cls_a' }, [SLOT_KEY]: 'cls_a' }, { ref: { kind: 'class', id: 'cls_a' }, [SLOT_KEY]: 'cls_a' }] }],
};

const schemaFinding = (path: string, message: string) => ({ ...(parseRecord('reaction', {}) as unknown as { findings: object[] }).findings[0], id: `fnd_${path}`, path, message, severity: 'error' as const });

describe('slotFindings', () => {
  it('rewrites the participant and product slot findings in words', () => {
    const found = [
      schemaFinding('participants[1]', 'Unknown field "slotOfClassId": not part of the schema, so it cannot be stored'),
      schemaFinding('outcomes[0].products[1]', 'Unknown field "slotOfClassId": not part of the schema, so it cannot be stored'),
    ] as never;
    const out = slotFindings(found, reaction, describeClass);
    expect(out.map((f) => f.message)).toEqual(['Choose a species of Primary alcohol (participant 2)', 'Choose a species of Primary alcohol (product 2 of outcome 1)']);
    expect(out.every((f) => f.severity === 'error')).toBe(true);
    expect(JSON.stringify(out)).not.toContain('Unknown field');
  });
  it('keeps the finding id and path so it still moves the focus', () => {
    const found = [schemaFinding('participants[1]', 'Unknown field "slotOfClassId": x')] as never;
    const [one] = slotFindings(found, reaction, describeClass);
    expect(one?.id).toBe('fnd_participants[1]');
    expect(one?.path).toBe('participants[1]');
  });
  it('leaves findings of rows that are not slots, and other findings, alone', () => {
    const found = [schemaFinding('participants[0]', 'Unknown field "other": y'), schemaFinding('name', 'Required')] as never;
    expect(slotFindings(found, reaction, describeClass)).toEqual(found);
  });
  it('another problem on a slot row is kept next to the slot words, the marker text is not', () => {
    const found = [schemaFinding('participants[1]', 'Unknown field "slotOfClassId": x; Required')] as never;
    const [one] = slotFindings(found, reaction, describeClass);
    expect(one?.message).toBe('Choose a species of Primary alcohol (participant 2); Required');
  });
  it('falls back to the class id when the class is unknown, and never throws on odd drafts', () => {
    const found = [schemaFinding('participants[1]', 'Unknown field "slotOfClassId": x')] as never;
    expect(slotFindings(found, { participants: [null, { [SLOT_KEY]: 'cls_zz' }] }, describeClass)[0]?.message).toBe('Choose a species of cls_zz (participant 2)');
    expect(slotFindings(found, null, describeClass)).toEqual(found);
    expect(slotFindings(found, 5, describeClass)).toEqual(found);
  });
});
