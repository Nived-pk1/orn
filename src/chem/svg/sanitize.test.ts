/**
 * The SVG sanitiser (step 4.3a): what is kept, what is dropped and counted, what is refused as a value, and the value checks.
 * The adversarial corpus is tests/adversarial/adv-033-svg-sanitizer.test.ts; the properties are tests/property/svg-sanitizer.test.ts;
 * real RDKit output is tests/integration/chem-rdkit.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { inertProblems } from '@/test-support/svg-inert';
import { MAX_SVG_ATTRIBUTES, MAX_SVG_INPUT_CHARS, MAX_SVG_NESTING, sanitizeSvg } from './sanitize';
import { validateValue } from './values';
import { GEOMETRY, PRESENTATION } from './whitelist';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

function ok(input: string) {
  const out = sanitizeSvg(input);
  if (!out.ok) throw new Error(`refused: ${out.reason} ${out.message}`);
  return out;
}

const RDKIT_LIKE = `<?xml version='1.0' encoding='iso-8859-1'?>
<svg version='1.1' baseProfile='full'
              xmlns='http://www.w3.org/2000/svg'
                      xmlns:rdkit='http://www.rdkit.org/xml'
                      xmlns:xlink='http://www.w3.org/1999/xlink'
                  xml:space='preserve'
width='200px' height='150px' viewBox='0 0 200 150'>
<!-- END OF HEADER -->
<rect style='opacity:1.0;fill:#FFFFFF;stroke:none' width='200.0' height='150.0' x='0.0' y='0.0'> </rect>
<path class='bond-0 atom-0 atom-1' d='M 43.8,84.9 L 72.2,68.4' style='fill:none;fill-rule:evenodd;stroke:#000000;stroke-width:2.0px;stroke-linecap:butt;stroke-linejoin:miter;stroke-opacity:1' />
<path class='atom-0' d='M 10.0 89.3
Q 10.0 84.8, 12.1 82.5' fill='#FF0000'/>
<metadata>
<rdkit:mol xmlns:rdkit = "http://www.rdkit.org/xml" version="0.9">
<rdkit:atom idx="1" atom-smiles="[CH3]" drawing-x="43.8" />
</rdkit:mol></metadata>
</svg>
`;

describe('sanitizeSvg on RDKit-shaped output', () => {
  const out = ok(RDKIT_LIKE);

  it('keeps every drawing element and drops the declaration, the comment and the metadata with its content', () => {
    expect(out.report).toMatchObject({
      elementsKept: 4, // svg, rect, two paths -> svg + rect + path + path
      commentsDropped: 1,
      processingInstructionsDropped: 1,
      cdataDropped: 0,
    });
    expect(out.report.elementsDropped).toBe(3); // metadata, rdkit:mol, rdkit:atom
    expect(out.svg).not.toMatch(/rdkit|metadata|END OF HEADER|<\?xml/);
    expect(out.svg.match(/<path /g)).toHaveLength(2);
  });

  it('writes its own namespace declaration, ignores the input namespaces, and keeps no xlink or xml attribute', () => {
    expect(out.svg.startsWith(`<svg ${NS} `)).toBe(true);
    expect(out.svg).not.toMatch(/xlink|xml:space|xmlns:|baseProfile|version=/);
    expect(out.report.attributesDropped).toBeGreaterThanOrEqual(5); // version, baseProfile, xmlns, xmlns:rdkit, xmlns:xlink, xml:space
  });

  it('keeps the geometry, the class names and the whitelisted style declarations, normalised', () => {
    expect(out.svg).toContain('viewBox="0 0 200 150"');
    expect(out.svg).toContain('class="bond-0 atom-0 atom-1"');
    expect(out.svg).toContain('style="fill:none;fill-rule:evenodd;stroke:#000000;stroke-width:2.0px;stroke-linecap:butt;stroke-linejoin:miter;stroke-opacity:1"');
    expect(out.svg).toContain('d="M 10.0 89.3 Q 10.0 84.8, 12.1 82.5"'); // the newline inside `d` is a space
    expect(out.svg).toContain('fill="#FF0000"');
  });

  it('is inert by an independent check, and sanitising it again changes nothing (idempotent)', () => {
    expect(inertProblems(out.svg)).toEqual([]);
    expect(ok(out.svg).svg).toBe(out.svg);
  });
});

describe('style attributes', () => {
  const styled = (style: string): string => ok(`<svg><rect style="${style}"/></svg>`).svg;

  it('keeps whitelisted properties with safe values and counts the declarations it drops', () => {
    const out = ok(`<svg><rect style="fill:#abc;stroke:rgb(1, 2, 3);stroke-width:1.5px;font-family:'Arial', sans-serif;foo:bar;fill-opacity:calc(1)"/></svg>`);
    expect(out.svg).toContain(`style="fill:#abc;stroke:rgb(1, 2, 3);stroke-width:1.5px;font-family:'Arial', sans-serif"`);
    expect(out.report.styleDeclarationsDropped).toBe(2); // foo:bar, fill-opacity:calc(1)
  });

  it.each([
    ['a url', 'fill:url(http://evil/x)'],
    ['a url in another case', 'fill:URL(#a)'],
    ['a url with a space', 'fill:url (#a)'],
    ['expression', 'width:expression(alert(1))'],
    ['an at-rule', '@import "x";fill:red'],
    ['a backslash escape', 'fill:\\75rl(x)'],
    ['a less-than sign', 'fill:red;x:<'],
    ['a url written with a numeric reference', 'fill:&#x75;rl(x)'],
    ['a backslash written with a numeric reference', 'fill:&#92;75rl(x)'],
  ])('refuses the whole attribute for %s (nothing of it survives)', (_name, style) => {
    const out = ok(`<svg><rect style="${style}" width="5"/></svg>`);
    expect(out.svg).not.toContain('style=');
    expect(out.svg).toContain('width="5"');
    expect(out.report.stylesRefused).toBe(1);
  });

  it('drops a declaration whose value is not a colour, a number, a length or a font name', () => {
    expect(styled('fill:javascript:alert(1)')).not.toContain('style=');
    expect(styled('stroke-width:1px !important')).not.toContain('style=');
    expect(styled('fill: red ; stroke:blue')).toContain('style="fill:red;stroke:blue"');
  });

  it('property names are matched in any case and written in lower case', () => {
    expect(styled('FILL:Red;Stroke-Width:2px')).toContain('style="fill:Red;stroke-width:2px"');
  });
});

describe('the second check: no reference or handler word survives in any value, even one a pattern accepts', () => {
  it('class names and font families that are only letters but spell a reference, a script scheme or an expression are dropped', () => {
    const out = ok('<svg><rect class="atom href" style="font-family:javascript;fill:red"/><rect class="expression" style="font-family:HREF"/><rect class="bond-1"/></svg>');
    expect(out.svg).toBe(`<svg ${NS}><rect style="fill:red"></rect><rect></rect><rect class="bond-1"></rect></svg>`);
    expect(out.report.attributesDropped).toBe(3); // class "atom href", class "expression", the whole second style
    expect(out.report.styleDeclarationsDropped).toBe(2); // font-family:javascript and font-family:HREF
  });
});

describe('attribute values', () => {
  it.each([
    ['length', '3.5px', '3.5px'],
    ['length', ' -2e3 ', '-2e3'],
    ['length', 'expression(1)', undefined],
    ['length', '1px; onload=x', undefined],
    ['lengthList', '1 2,3px', '1 2,3px'],
    ['numberList', '0 0 300 200', '0 0 300 200'],
    ['numberList', '0 0 a 200', undefined],
    ['pathData', 'M 1,2 L 3 4 z', 'M 1,2 L 3 4 z'],
    ['pathData', 'M 1 2 <script>', undefined],
    ['transform', 'translate(10,20) rotate(45)', 'translate(10,20) rotate(45)'],
    ['transform', 'translate(url(x))', undefined],
    ['colour', '#F00', '#F00'],
    ['colour', '#12345678', '#12345678'],
    ['colour', 'rgb(0,0,0)', 'rgb(0,0,0)'],
    ['colour', 'red', 'red'],
    ['colour', 'url(#g)', undefined],
    ['colour', 'rgb(url(x))', undefined],
    ['className', 'atom-1  bond_2', 'atom-1 bond_2'],
    ['className', 'a" onclick="x', undefined],
    ['fontFamily', "'Helvetica Neue', Arial", "'Helvetica Neue', Arial"],
    ['fontFamily', 'a;b', undefined],
    ['fillRule', 'evenodd', 'evenodd'],
    ['fillRule', 'EVENODD', undefined],
    ['dashes', '2 2', '2 2'],
    ['dashes', 'none', 'none'],
  ] as const)('%s %j -> %j', (kind, value, expected) => {
    expect(validateValue(kind, value)).toBe(expected);
  });
});

describe('text and entities', () => {
  it('keeps text only inside text and tspan, escaped, with entities decoded once', () => {
    const out = ok('<svg><text>N<tspan>H&amp;</tspan> &#43;&#x2212;</text><g>stray</g>loose</svg>');
    expect(out.svg).toBe(`<svg ${NS}><text>N<tspan>H&amp;</tspan> +−</text><g></g></svg>`);
    expect(out.report.textDropped).toBe(2); // "stray" and "loose"
  });

  it('drops a text node that carries a reference, a script scheme or a handler, or a character XML forbids', () => {
    const out = ok('<svg><text>a href b</text><text>url(x)</text><text>&#60;b&#62;</text><text>ok&#0;&#1;</text></svg>');
    expect(out.svg).toBe(`<svg ${NS}><text></text><text></text><text></text><text>ok</text></svg>`);
    expect(out.report.textDropped).toBe(3);
    expect(out.report.badReferences).toBe(2);
  });

  it('a name it does not know stays literal text and is escaped on output; no entity can be defined', () => {
    expect(ok('<svg><text>&bogus; &lt;</text></svg>').svg).toContain('<text></text>'); // "&lt;" decodes to "<": dropped as a tag opener
    expect(ok('<svg><text>a &bogus; b</text></svg>').svg).toContain('<text>a &amp;bogus; b</text>');
  });
});

describe('structure', () => {
  it('drops an unknown element with everything inside it, and a namespaced one', () => {
    const out = ok('<svg><g><script>alert(1)</script><rect/></g><svg:rect/><foreignObject><rect/></foreignObject></svg>');
    expect(out.svg).toBe(`<svg ${NS}><g><rect></rect></g></svg>`);
    expect(out.report.elementsDropped).toBe(4); // script, svg:rect, foreignObject, and the rect inside it
  });

  it('closes what is left open, ignores a stray end tag, and treats a mismatched end tag as closing what it names', () => {
    expect(ok('<svg><g><rect>').svg).toBe(`<svg ${NS}><g><rect></rect></g></svg>`);
    expect(ok('<svg><g></x></g></svg>').report.strayEndTags).toBe(1);
    expect(ok('<svg><g><path></g><rect/></svg>').svg).toBe(`<svg ${NS}><g><path></path></g><rect></rect></svg>`);
    expect(ok('<svg><g><rect>').report.autoClosed).toBe(3);
  });

  it('keeps only the first svg root; everything after it is dropped', () => {
    expect(ok('<svg><rect/></svg><svg><circle/></svg><rect/>').svg).toBe(`<svg ${NS}><rect></rect></svg>`);
  });

  it('quotes decide where a tag ends: a ">" inside a value does not end it', () => {
    expect(ok(`<svg><rect x=">" y='1'/></svg>`).svg).toBe(`<svg ${NS}><rect y="1"></rect></svg>`); // x=">" is not a length
  });

  it('reads unquoted and valueless attributes without letting them through unchecked', () => {
    expect(ok('<svg><rect width=5 hidden onclick=alert(1)></rect></svg>').svg).toBe(`<svg ${NS}><rect width="5"></rect></svg>`);
  });

  it('keeps an attribute once (the first) and caps the attributes it reads per tag', () => {
    expect(ok('<svg><rect width="1" width="2"/></svg>').svg).toContain('width="1"');
    const many = Array.from({ length: MAX_SVG_ATTRIBUTES + 10 }, (_, i) => `a${i}="1"`).join(' ');
    expect(ok(`<svg><rect ${many}/></svg>`).report.attributesDropped).toBe(MAX_SVG_ATTRIBUTES + 10);
  });

  it('an unfinished tag, comment, CDATA section or instruction drops the rest of the input and says so', () => {
    for (const cut of ['<svg><rect width="1', '<svg><rect', '<svg><!-- x', '<svg><![CDATA[ x', '<svg><?pi x', '<svg></g']) {
      const out = ok(cut);
      expect(out.report.truncated).toBe(1);
      expect(inertProblems(out.svg)).toEqual([]);
    }
  });

  it('a "<" that starts no markup is character data and never written as markup', () => {
    const out = ok('<svg><text>1 < 2</text></svg>');
    expect(out.svg).toBe(`<svg ${NS}><text>1  2</text></svg>`);
    expect(out.report.textDropped).toBe(1); // the "<" itself
  });
});

describe('refusals are values', () => {
  it(`an input of ${MAX_SVG_INPUT_CHARS} characters (2 MiB) is accepted, one more is refused with the cap in the message`, () => {
    const pad = (n: number): string => `<svg>${' '.repeat(n - '<svg></svg>'.length)}</svg>`;
    expect(sanitizeSvg(pad(MAX_SVG_INPUT_CHARS)).ok).toBe(true);
    const refused = sanitizeSvg(pad(MAX_SVG_INPUT_CHARS + 1));
    expect(refused).toMatchObject({ ok: false, reason: 'too_large' });
    expect(refused.ok ? '' : refused.message).toContain('2 MiB');
  });

  it.each(['<!DOCTYPE svg><svg/>', '<svg><!DOCTYPE x></svg>', '<svg><!ENTITY a "b"></svg>', '<!doctype svg PUBLIC "x" "y"><svg/>', '<svg><!ELEMENT x></svg>'])('%s: a declaration is refused', (input) => {
    expect(sanitizeSvg(input)).toMatchObject({ ok: false, reason: 'declaration' });
  });

  it('nesting deeper than the cap is refused; at the cap it is accepted', () => {
    const nested = (depth: number): string => `${'<g>'.repeat(depth - 1)}`;
    expect(sanitizeSvg(`<svg>${nested(MAX_SVG_NESTING)}`).ok).toBe(true);
    expect(sanitizeSvg(`<svg>${nested(MAX_SVG_NESTING + 2)}`)).toMatchObject({ ok: false, reason: 'too_deep' });
  });

  it('input with no svg to keep is refused, however much else it holds', () => {
    for (const input of ['', 'plain text', '<rect/>', '<div><svg/></div>', '<svg:svg/>', '<SVG/>', '<!-- <svg/> -->']) {
      expect(sanitizeSvg(input)).toMatchObject({ ok: false, reason: 'no_svg' });
    }
  });
});

describe('the whitelist itself', () => {
  it('has no event handler, reference or namespace attribute, ever (names starting with "on", href, anything with a colon)', () => {
    for (const name of [...Object.keys(GEOMETRY), ...Object.keys(PRESENTATION)]) {
      expect(name).not.toMatch(/^on/i);
      expect(name).not.toMatch(/href/i);
      expect(name).not.toContain(':');
    }
  });
});
