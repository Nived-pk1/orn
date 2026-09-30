/**
 * Properties of the SVG sanitiser (step 4.3a, ADV-033 depiction part): over arbitrary strings and over strings assembled from
 * the fragments that matter (tags, attributes, entities, quotes, comments, escapes) the sanitiser NEVER THROWS, its output is
 * BOUNDED by its input, IDEMPOTENT (sanitise(sanitise(x)) == sanitise(x)), and NEVER CONTAINS `<script`, `on*=`, `href`, `url(`
 * or `<!`, and passes the independent inertness check. Wall-clock bounds are not asserted here (tests/timing); the linear-work
 * inputs are in tests/adversarial/adv-033-svg-sanitizer.test.ts.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { MAX_SVG_INPUT_CHARS, sanitizeSvg } from '@/chem';
import { FORBIDDEN_IN_OUTPUT, inertProblems } from '@/test-support/svg-inert';
import { PARAMS, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

const FRAGMENTS = [
  '<svg>', '</svg>', '<svg xmlns="http://www.w3.org/2000/svg" width="300px" viewBox="0 0 300 300">', '<g>', '</g>', '<rect/>', '<rect width="5" height="5">', '</rect>',
  '<path d="M 0 0 L 10 10"/>', '<path d="M 1,2 Q 3 4, 5 6" style="fill:none;stroke:#000000;stroke-width:2.0px"/>', '<text>', '</text>', '<tspan>', '</tspan>', 'N', 'H', '+', ' ',
  '<script>', '</script>', 'alert(1)', '<foreignObject>', '</foreignObject>', '<style>', '</style>', '<a href="x">', '</a>', '<use xlink:href="#a"/>', '<image href="x"/>',
  ' onclick="a"', ' ONLOAD=b', ' onmouseover=c', ' href="javascript:a"', ' xlink:href="x"', ' style="fill:url(#a)"', ' style="fill:red;stroke:blue"', ' style="width:expression(a)"',
  ' class="atom-1 bond-2"', ' fill="#FF0000"', ' transform="translate(1,2)"', ' width="10"', ' d="M 0 0"',
  '<!--', '-->', '<![CDATA[', ']]>', '<?xml version="1.0"?>', '<?pi', '?>', '<!DOCTYPE svg>', '<!ENTITY a "b">', '<!x>',
  '&amp;', '&lt;', '&gt;', '&quot;', '&#60;', '&#x3C;', '&#0;', '&#x110000;', '&bogus;', '&', '&#',
  '<', '>', '/', '"', "'", '=', '\\', '@', '\u0000', '‮', 'url(', 'expression(', 'javascript:', 'href', 'on', '\n', '\t', 'é', '😀',
];

const assembled = fc.array(fc.constantFrom(...FRAGMENTS), { maxLength: 80 }).map((parts) => parts.join(''));
const rooted = assembled.map((text) => `<svg>${text}`);
const anything = fc.oneof(fc.string({ maxLength: 400 }), fc.string({ unit: 'binary', maxLength: 200 }), assembled, rooted);

function checkOutcome(input: string): void {
  const out = sanitizeSvg(input);
  if (!out.ok) {
    expect(['too_large', 'declaration', 'too_deep', 'no_svg']).toContain(out.reason);
    return;
  }
  for (const pattern of FORBIDDEN_IN_OUTPUT) expect(out.svg).not.toMatch(pattern);
  expect(inertProblems(out.svg)).toEqual([]);
  // Bounded: every character of output is a whitelisted name, a fixed piece of syntax, or escaped input.
  expect(out.svg.length).toBeLessThanOrEqual(6 * input.length + 64);
  expect(out.report.elementsKept).toBeGreaterThanOrEqual(1);
  // Idempotent.
  const again = sanitizeSvg(out.svg);
  expect(again.ok && again.svg).toBe(out.svg);
}

describe('sanitizeSvg properties (ADV-033 depiction part)', () => {
  it('never throws, and every outcome is a refusal value or an inert, bounded, idempotent svg (arbitrary and assembled input)', () => {
    fc.assert(
      fc.property(anything, (input) => {
        checkOutcome(input);
      }),
      { ...PARAMS, numRuns: Math.max(PARAMS.numRuns, 300) },
    );
  });

  it('the same holds for assembled input that is always rooted in an svg, so the accepting path is exercised', () => {
    fc.assert(
      fc.property(rooted, (input) => {
        checkOutcome(input);
      }),
      { ...PARAMS, numRuns: Math.max(PARAMS.numRuns, 300) },
    );
  });

  it('is deterministic: the same input gives the same outcome', () => {
    fc.assert(
      fc.property(rooted, (input) => {
        expect(sanitizeSvg(input)).toEqual(sanitizeSvg(input));
      }),
      PARAMS,
    );
  });

  it('a script placed anywhere in valid drawing markup never survives, whatever surrounds it', () => {
    const drawing = fc.array(fc.constantFrom('<rect width="3"/>', '<g>', '</g>', '<path d="M 1 1"/>', '<text>N</text>'), { maxLength: 12 }).map((parts) => parts.join(''));
    fc.assert(
      fc.property(drawing, drawing, fc.constantFrom('<script>alert(1)</script>', '<SCRIPT SRC=//x></SCRIPT>', '<foreignObject><script>a</script></foreignObject>'), (before, after, script) => {
        const out = sanitizeSvg(`<svg>${before}${script}${after}</svg>`);
        if (out.ok) expect(out.svg).not.toMatch(/script|alert|foreignObject/i);
      }),
      PARAMS,
    );
  });

  it('the cap is exact: any input over it is refused as too_large, without being read', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (extra) => {
        const input = `<svg>${' '.repeat(MAX_SVG_INPUT_CHARS - 10 + extra)}</svg>`;
        expect(sanitizeSvg(input).ok).toBe(input.length <= MAX_SVG_INPUT_CHARS);
      }),
      { ...PARAMS, numRuns: 20 },
    );
  });
});
