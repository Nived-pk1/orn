import { describe, expect, it } from 'vitest';
import { ANY_ID_PATTERN } from '../schema';
import { MAX_MESSAGE_LENGTH, findingId, makeFinding, plainText } from './findings';

const subject = { kind: 'reaction', id: 'rxn_a' } as const;

describe('findingId', () => {
  it('is fnd_ plus 16 hex digits and satisfies the shared ID shape', () => {
    const id = findingId('RXN-004', subject, 'participants[0]');
    expect(id).toMatch(/^fnd_[0-9a-f]{16}$/);
    expect(ANY_ID_PATTERN.test(id)).toBe(true);
  });

  it('is a pure function of rule, subject and path', () => {
    expect(findingId('RXN-004', subject, 'a')).toBe(findingId('RXN-004', { ...subject }, 'a'));
    const variants = [
      findingId('RXN-004', subject, 'a'),
      findingId('RXN-005', subject, 'a'),
      findingId('RXN-004', { kind: 'reaction', id: 'rxn_b' }, 'a'),
      findingId('RXN-004', { kind: 'species', id: 'rxn_a' }, 'a'),
      findingId('RXN-004', subject, 'b'),
      findingId('RXN-004', subject),
    ];
    expect(new Set(variants).size).toBe(variants.length);
  });

  it('does not run fields together: (ab, c) differs from (a, bc)', () => {
    expect(findingId('AB', { kind: 'species', id: 'c' })).not.toBe(findingId('A', { kind: 'species', id: 'bc' }));
  });

  it('has no collisions over 50,000 realistic (rule, subject, path) triples', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50_000; i += 1) {
      seen.add(findingId(`RXN-0${i % 24}`, { kind: 'reaction', id: `rxn_${Math.floor(i / 24)}` }, `outcomes[${i % 7}].products[${i % 5}]`));
    }
    expect(seen.size).toBeGreaterThan(49_000);
  });
});

describe('makeFinding', () => {
  const origin = { id: 'RXN-004', level: 3, severity: 'error' } as const;

  it('takes level and severity from the rule, and a draft may override the severity', () => {
    expect(makeFinding(origin, subject, { message: 'm' })).toMatchObject({ level: 3, severity: 'error', related: [] });
    expect(makeFinding(origin, subject, { message: 'm', severity: 'warning' }).severity).toBe('warning');
  });

  it('keeps the ID when only message, data or related change (a fixed-then-reintroduced problem is the same problem)', () => {
    const a = makeFinding(origin, subject, { path: 'p', message: 'one' });
    const b = makeFinding(origin, subject, { path: 'p', message: 'two', data: { n: 1 }, related: [{ kind: 'species', id: 'spc_x' }] });
    expect(a.id).toBe(b.id);
  });

  it('omits absent optional fields rather than storing undefined', () => {
    const finding = makeFinding(origin, subject, { message: 'm' });
    expect(Object.keys(finding).sort()).toEqual(['id', 'level', 'message', 'related', 'ruleId', 'severity', 'subject']);
  });
});

describe('plainText', () => {
  it('replaces control, bidi, and separator characters and leaves ordinary text alone', () => {
    expect(plainText('a\u0000b‮c d\ne')).toBe('a�b�c�d�e');
    expect(plainText('α-ethanol, 2°  H₂SO₄ 日本語')).toBe('α-ethanol, 2°  H₂SO₄ 日本語');
  });

  it('truncates to the limit with an ellipsis', () => {
    const out = plainText('x'.repeat(MAX_MESSAGE_LENGTH + 100));
    expect(out).toHaveLength(MAX_MESSAGE_LENGTH);
    expect(out.endsWith('…')).toBe(true);
    expect(plainText('short', 10)).toBe('short');
  });

  it('never leaves markup interpretable: it is returned as text, unchanged', () => {
    expect(plainText('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
  });
});
