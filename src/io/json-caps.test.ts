import { describe, expect, it } from 'vitest';
import { scanJsonCaps } from './json-caps';

const LIMITS = { maxDepth: 4, maxStringLength: 10 };

describe('scanJsonCaps', () => {
  it('accepts well-formed JSON within both caps', () => {
    expect(scanJsonCaps('{"a":[1,2,{"b":"short"}]}', LIMITS)).toEqual({ ok: true });
  });

  it('accepts a string containing escaped quotes and backslashes without miscounting depth', () => {
    // The string body is `x\"y\\z` (7 raw characters between the quotes): within the 10-char cap.
    expect(scanJsonCaps(String.raw`{"a":"x\"y\\z"}`, LIMITS)).toEqual({ ok: true });
  });

  it('rejects nesting deeper than maxDepth, stopping at the first violation', () => {
    const text = '{"a":{"b":{"c":{"d":{"e":1}}}}}'; // 5 levels of {, cap is 4
    const result = scanJsonCaps(text, LIMITS);
    expect(result).toMatchObject({ ok: false, code: 'TOO_DEEP' });
  });

  it('rejects an array nested deeper than maxDepth', () => {
    expect(scanJsonCaps('[[[[[1]]]]]', LIMITS)).toMatchObject({ ok: false, code: 'TOO_DEEP' });
  });

  it('rejects a string literal longer than maxStringLength', () => {
    const result = scanJsonCaps('{"a":"12345678901"}', LIMITS); // 11 characters, cap is 10
    expect(result).toMatchObject({ ok: false, code: 'STRING_TOO_LONG' });
  });

  it('braces and brackets inside a string never count toward depth', () => {
    expect(scanJsonCaps('{"a":"{[{[{[{[{["}', LIMITS)).toEqual({ ok: true });
  });

  it('ADV-032 io part: a depth-100 file is rejected fast, without building a parse tree', () => {
    const text = `${'['.repeat(100)}1${']'.repeat(100)}`;
    const result = scanJsonCaps(text, { maxDepth: 64, maxStringLength: 1_000_000 });
    expect(result).toMatchObject({ ok: false, code: 'TOO_DEEP' });
  });

  it('ADV-032 io part: a 5 MB string literal is rejected fast', () => {
    const text = `{"a":"${'x'.repeat(5 * 1024 * 1024)}"}`;
    const result = scanJsonCaps(text, { maxDepth: 64, maxStringLength: 1_000_000 });
    expect(result).toMatchObject({ ok: false, code: 'STRING_TOO_LONG' });
  });
});
