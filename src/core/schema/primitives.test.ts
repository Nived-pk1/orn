/** Shared value types — docs/DOMAIN_MODEL.md §3, docs/SECURITY.md §3. Validate, never transform. */
import { describe, expect, it } from 'vitest';
import {
  DifficultySchema,
  FiniteNumberSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  isSafeHttpUrl,
  Base64Schema,
  JsonValueSchema,
  LabelTextSchema,
  LIMITS,
  NamesSchema,
  NameTextSchema,
  PositiveNumberSchema,
  RichTextSchema,
  SafeUrlSchema,
  ShortTextSchema,
  StructureRepSchema,
  TagSchema,
} from './index';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;

describe('text schemas', () => {
  const cases = [
    { name: 'NameText', schema: NameTextSchema, max: LIMITS.name, singleLine: true },
    { name: 'LabelText', schema: LabelTextSchema, max: LIMITS.label, singleLine: true },
    { name: 'Tag', schema: TagSchema, max: LIMITS.tag, singleLine: true },
    { name: 'ShortText', schema: ShortTextSchema, max: LIMITS.shortText, singleLine: false },
    { name: 'RichText', schema: RichTextSchema, max: LIMITS.richText, singleLine: false },
  ];

  it.each(cases)('$name enforces its cap exactly', ({ schema, max }) => {
    expect(ok(schema, 'a'.repeat(max))).toBe(true);
    expect(ok(schema, 'a'.repeat(max + 1))).toBe(false);
  });

  it.each(cases)('$name rejects every C0 control except TAB/LF/CR, DEL and bidi controls (ADV-034)', ({ schema, singleLine }) => {
    for (let code = 0; code < 0x20; code += 1) {
      const allowedInMultiLine = code === 0x09 || code === 0x0a || code === 0x0d;
      expect(ok(schema, `a${String.fromCharCode(code)}b`), `U+${code.toString(16)}`).toBe(!singleLine && allowedInMultiLine);
    }
    for (const code of [0x7f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
      expect(ok(schema, `a${String.fromCharCode(code)}b`), `U+${code.toString(16)}`).toBe(false);
    }
  });

  it.each(cases)('$name accepts Unicode chemistry text and inert markup verbatim (ADV-033)', ({ schema }) => {
    for (const text of ['α-D-glucose', 'C₂H₅OH', 'Friedel–Crafts', 'Sɴ2', '<img src=x onerror=alert(1)>', '[[rxn_ab]] *x* _y_']) {
      expect(schema.parse(text)).toBe(text);
    }
  });

  it('single-line text rejects blank values; multi-line text allows them', () => {
    for (const blank of ['', ' ', '   ']) {
      expect(ok(NameTextSchema, blank)).toBe(false);
      expect(ok(LabelTextSchema, blank)).toBe(false);
      expect(ok(TagSchema, blank)).toBe(false);
      expect(ok(ShortTextSchema, blank)).toBe(true);
      expect(ok(RichTextSchema, blank)).toBe(true);
    }
  });

  it('never trims or normalises (INV-24)', () => {
    expect(NameTextSchema.parse('  Ethanol  ')).toBe('  Ethanol  ');
    expect(NameTextSchema.parse('éthanol')).toBe('éthanol');
  });
});

describe('timestamps and dates', () => {
  it.each(['2026-09-26T00:00:00Z', '2026-09-26T00:00:00.1Z', '2026-09-26T23:59:59.999Z'])('accepts %s', (v) => {
    expect(ok(IsoDateTimeSchema, v)).toBe(true);
  });
  it.each(['2026-09-26', '2026-09-26T00:00:00', '2026-09-26T00:00:00+05:30', '2026-09-26T00:00:00.1234Z', '2026-09-26 00:00:00Z'])(
    'rejects %s',
    (v) => expect(ok(IsoDateTimeSchema, v)).toBe(false),
  );
  it('IsoDate accepts YYYY-MM-DD only', () => {
    expect(ok(IsoDateSchema, '2026-01-31')).toBe(true);
    expect(ok(IsoDateSchema, '2026-1-31')).toBe(false);
    expect(ok(IsoDateSchema, '2026-01-31T00:00:00Z')).toBe(false);
  });
});

describe('numbers (ADV-037)', () => {
  it('FiniteNumber rejects NaN and ±Infinity', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(ok(FiniteNumberSchema, v)).toBe(false);
    for (const v of [0, -273.15, 1e300]) expect(ok(FiniteNumberSchema, v)).toBe(true);
  });
  it('PositiveNumber requires > 0', () => {
    expect(ok(PositiveNumberSchema, 0)).toBe(false);
    expect(ok(PositiveNumberSchema, -2)).toBe(false);
    expect(ok(PositiveNumberSchema, 0.5)).toBe(true);
    expect(ok(PositiveNumberSchema, Number.POSITIVE_INFINITY)).toBe(false);
  });
  it('Difficulty is an integer 1–5', () => {
    expect([0, 1, 5, 6, 2.5].map((v) => ok(DifficultySchema, v))).toEqual([false, true, true, false, false]);
  });
});

describe('SafeUrl (SECURITY.md §2)', () => {
  it.each(['https://ncert.nic.in/textbook.php', 'http://example.org/a?b=c#d'])('accepts %s', (url) => {
    expect(ok(SafeUrlSchema, url)).toBe(true);
  });
  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.org/',
    'https://user:pass@example.org/',
    'https://user@example.org/',
    '//example.org/',
    '/relative/path',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(ok(SafeUrlSchema, url)).toBe(false);
    expect(isSafeHttpUrl(url)).toBe(false);
  });
  it('rejects control and bidi-override characters, which the URL parser would silently normalise', () => {
    for (const code of [0x00, 0x09, 0x0a, 0x0d, 0x1f, 0x7f, 0x202e, 0x2066]) {
      const url = `https://example.org/a${String.fromCharCode(code)}b`;
      expect(ok(SafeUrlSchema, url), `U+${code.toString(16)}`).toBe(false);
    }
    expect(ok(SafeUrlSchema, 'https://example.org/a%0Ab')).toBe(true); // percent-encoded, visible and inert
  });
  it('enforces the length cap', () => {
    const base = 'https://example.org/';
    expect(ok(SafeUrlSchema, base + 'a'.repeat(LIMITS.url - base.length))).toBe(true);
    expect(ok(SafeUrlSchema, base + 'a'.repeat(LIMITS.url - base.length + 1))).toBe(false);
  });
});

describe('StructureRep', () => {
  it('caps line notations at the inline limit and molfiles at the molfile limit', () => {
    for (const format of ['smiles', 'cxsmiles'] as const) {
      expect(ok(StructureRepSchema, { format, value: 'C'.repeat(LIMITS.inlineStructure) })).toBe(true);
      expect(ok(StructureRepSchema, { format, value: 'C'.repeat(LIMITS.inlineStructure + 1) })).toBe(false);
    }
    expect(ok(StructureRepSchema, { format: 'molfile', value: 'M'.repeat(LIMITS.molfile) })).toBe(true);
    expect(ok(StructureRepSchema, { format: 'molfile', value: 'M'.repeat(LIMITS.molfile + 1) })).toBe(false);
  });
  it('rejects empty values and unknown formats; keeps unparsable SMILES for CHEM-001 (ADV-036)', () => {
    expect(ok(StructureRepSchema, { format: 'smiles', value: '' })).toBe(false);
    expect(ok(StructureRepSchema, { format: 'inchi', value: 'InChI=1S/CH4/h1H4' })).toBe(false);
    expect(StructureRepSchema.parse({ format: 'smiles', value: 'C1CC(' })).toEqual({ format: 'smiles', value: 'C1CC(' });
  });
  it('preserves molfile line breaks verbatim', () => {
    const molfile = '\n  RDKit\n\n  1  0  0  0  0  0  0  0  0  0999 V2000\nM  END\n';
    expect(StructureRepSchema.parse({ format: 'molfile', value: molfile }).value).toBe(molfile);
  });
});

describe('JsonValue (legacy.unmapped, INV-23)', () => {
  it('accepts nested JSON and rejects non-finite numbers and non-JSON values', () => {
    const value = { a: [1, 'x', null, true, { b: [] }], c: -0.5 };
    expect(JsonValueSchema.parse(value)).toEqual(value);
    expect(ok(JsonValueSchema, { a: [Number.POSITIVE_INFINITY] })).toBe(false);
    expect(ok(JsonValueSchema, { a: undefined })).toBe(false);
    expect(ok(JsonValueSchema, () => 1)).toBe(false);
  });
});

describe('Names', () => {
  it('caps aliases and common names', () => {
    const names = (n: number) => ({ canonical: 'X', common: [], aliases: Array.from({ length: n }, (_, i) => `a${i}`) });
    expect(ok(NamesSchema, names(LIMITS.aliases))).toBe(true);
    expect(ok(NamesSchema, names(LIMITS.aliases + 1))).toBe(false);
  });
});

describe('Base64 (embedded assets, ADV-032)', () => {
  it.each(['iVBORw0K', 'AAAA', 'QQ==', 'QUI=', 'a+b/', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='])(
    'accepts %s',
    (v) => expect(ok(Base64Schema, v)).toBe(true),
  );
  it.each([
    ['empty', ''],
    ['too short', 'QQ='],
    ['length not a multiple of 4', 'iVBORw0KG'],
    ['outside the alphabet', 'iVBO<Rw0K'],
    ['URL-safe alphabet', 'a-b_'],
    ['whitespace', 'iVBO Rw0K'],
    ['line break', 'iVBO\nRw0K'],
    ['padding before the end', 'iV==ORw0'],
    ['three padding characters', 'Q==='],
    ['non-ASCII digit', 'iVBO٣w0K'],
  ])('rejects %s', (_label, v) => expect(ok(Base64Schema, v)).toBe(false));
  it('enforces the cap on a maximum-size payload (the wall-clock bound is in tests/timing)', () => {
    const cap = LIMITS.embeddedAssetBase64;
    expect(ok(Base64Schema, 'A'.repeat(cap))).toBe(true);
    expect(ok(Base64Schema, 'A'.repeat(cap + 4))).toBe(false);
    expect(ok(Base64Schema, `${'A'.repeat(cap - 4)}!AAA`)).toBe(false);
  });
});
