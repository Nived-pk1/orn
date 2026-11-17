import { describe, expect, it } from 'vitest';
import { mistakeMailto } from './report-mail';

const fields = { address: 'a.b@example.com', name: 'Aldol → β-hydroxy ketone (H₂O)', kind: 'Reaction', link: 'https://x.test/orn/#/reactions/rxn_1', version: '0.1.0' };

describe('mistakeMailto (step 8.4g, G6)', () => {
  it('opens the mail app for the address with the subject and the body in plain words', () => {
    const href = mistakeMailto(fields);
    expect(href.startsWith('mailto:a.b@example.com?')).toBe(true);
    const query = new URLSearchParams(href.slice(href.indexOf('?') + 1));
    expect(query.get('subject')).toBe('ORN: mistake in Aldol → β-hydroxy ketone (H₂O)');
    expect(query.get('body')).toBe('Link: https://x.test/orn/#/reactions/rxn_1\nKind: Reaction\nApp version: 0.1.0\n\nWhat is wrong:\n');
  });

  it('encodes symbols, spaces, ampersands and line breaks so nothing leaks into the address or other fields', () => {
    const href = mistakeMailto({ ...fields, name: 'A & B = C?\nD #1' });
    expect(href).not.toMatch(/[ \n#]/);
    expect(href.match(/&/g)).toHaveLength(1);
    const query = new URLSearchParams(href.slice(href.indexOf('?') + 1));
    expect(query.get('subject')).toBe('ORN: mistake in A & B = C? D #1');
  });

  it('keeps a long name bounded', () => {
    const href = mistakeMailto({ ...fields, name: 'x'.repeat(5000) });
    expect(href.length).toBeLessThan(2000);
  });
});
