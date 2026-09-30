/**
 * ADV-033, the depiction part (docs/TEST_STRATEGY.md §5; docs/SECURITY.md §2): a depiction that is, or carries, script, a
 * foreign object, an event handler, an external reference, CSS that loads something, a DOCTYPE or an entity bomb, CDATA, comments,
 * instructions, broken markup, extreme nesting or size must come out INERT (one balanced tree of whitelisted elements and
 * attributes, no reference, no script, no handler) or be REFUSED AS A VALUE. Every accepted output is checked by
 * `inertProblems`, which does not share the sanitiser's scanner. The rendering half (an `<img>` never inlines it) is Gate E.
 */
import { describe, expect, it } from 'vitest';
import { sanitizeSvg, MAX_SVG_INPUT_CHARS } from '@/chem';
import { inertProblems } from '@/test-support/svg-inert';

/** Sanitises `input` and asserts the result is inert or a refusal; returns the accepted svg or the refusal reason. */
function outcome(input: string): { readonly svg: string } | { readonly refused: string } {
  const out = sanitizeSvg(input);
  if (!out.ok) return { refused: out.reason };
  expect(inertProblems(out.svg)).toEqual([]);
  return { svg: out.svg };
}

const svgOf = (input: string): string => {
  const out = outcome(input);
  if ('refused' in out) throw new Error(`refused (${out.refused}): ${input.slice(0, 60)}`);
  return out.svg;
};

describe('ADV-033 depiction: scripts and foreign content', () => {
  it.each([
    ['a script element', '<svg><script>alert(1)</script><rect width="5"/></svg>', 'alert'],
    ['a script in another case', '<svg><ScRiPt>alert(1)</ScRiPt></svg>', 'alert'],
    ['a script with a type', '<svg><script type="text/ecmascript">alert(1)</script></svg>', 'alert'],
    ['foreignObject with html', '<svg><foreignObject width="9"><body xmlns="http://www.w3.org/1999/xhtml" onload="alert(1)"><script>x</script></body></foreignObject></svg>', 'onload'],
    ['an iframe inside foreignObject', '<svg><foreignObject><iframe src="javascript:alert(1)"/></foreignObject></svg>', 'iframe'],
    ['an embedded image', '<svg><image href="https://evil.example/x.png" width="10" height="10"/></svg>', 'image'],
    ['a use of an external document', '<svg><use xlink:href="https://evil.example/x.svg#a"/></svg>', 'evil'],
    ['an anchor with a javascript url', '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>', 'javascript'],
    ['animation that sets a handler', '<svg><rect><set attributeName="onmouseover" to="alert(1)"/></rect></svg>', 'attributeName'],
    ['animation that sets an href', '<svg><a><animate attributeName="href" values="javascript:alert(1)"/></a></svg>', 'values'],
    ['an embedded style sheet', '<svg><style>@import url(https://evil.example/x.css); rect{fill:url(#a)}</style></svg>', 'import'],
    ['a namespaced script', '<svg xmlns:x="http://www.w3.org/2000/svg"><x:script>alert(1)</x:script></svg>', 'alert'],
    ['a script inside a metadata block', '<svg><metadata><script>alert(1)</script></metadata></svg>', 'alert'],
  ])('%s is dropped with its content', (_name, input, leak) => {
    expect(svgOf(input)).not.toContain(leak);
  });

  it('an element the tree does not whitelist is dropped even in a different case or with a stray namespace', () => {
    for (const tag of ['SCRIPT', 'Script', 'svg:script', 'x:foreignObject', 'ANIMATE', 'Set', 'filter', 'mask', 'pattern', 'symbol', 'marker', 'linearGradient', 'switch', 'view']) {
      expect(svgOf(`<svg><${tag} id="a"><rect width="3"/></${tag}></svg>`)).toBe('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    }
  });
});

describe('ADV-033 depiction: attributes', () => {
  it.each(['onclick', 'ONCLICK', 'OnLoad', 'onmouseover', 'onerror', 'onbegin', 'onfocusin', 'onx', 'ON'])('%s is dropped on every whitelisted element', (name) => {
    for (const element of ['svg', 'g', 'path', 'rect', 'circle', 'text', 'tspan']) {
      const svg = svgOf(`<svg><${element} ${name}="alert(1)" ${name}=x width="4"></${element}></svg>`);
      expect(svg).not.toMatch(/alert|on[a-z]*=/i);
    }
  });

  it.each([
    ['href', '<svg><path href="https://evil.example" d="M 0 0"/></svg>'],
    ['xlink:href', '<svg><path xlink:href="https://evil.example" d="M 0 0"/></svg>'],
    ['xlink:href in upper case', '<svg><path XLINK:HREF="https://evil.example" d="M 0 0"/></svg>'],
    ['href on the root', '<svg href="//evil.example"><g/></svg>'],
    ['src', '<svg><rect src="//evil.example"/></svg>'],
    ['xml:base', '<svg xml:base="https://evil.example/"><rect/></svg>'],
    ['a namespace declaration', '<svg xmlns:evil="http://evil.example" evil:x="1"><rect/></svg>'],
  ])('%s: the attribute is dropped, the element and its path stay', (_name, input) => {
    const svg = svgOf(input);
    expect(svg).not.toMatch(/evil|href|src=/i);
  });

  it('an attribute value that is not a number, a path, a colour, a length or a class name is dropped, whatever it says', () => {
    const svg = svgOf('<svg><rect width="1px onload=x" height="javascript:alert(1)" x="url(#a)" class="a&quot; onclick=&quot;x" fill="url(https://evil.example/x)"/></svg>');
    expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect></rect></svg>');
  });

  it('duplicate attributes and attributes with odd names are handled without letting either through', () => {
    expect(svgOf('<svg><rect x="1" x="2" onclick="a" onclick="b" ="c" "d" \'e\' ==></rect></svg>')).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect x="1"></rect></svg>');
  });
});

describe('ADV-033 depiction: style', () => {
  it.each([
    ['url()', 'fill:url(https://evil.example/x)'],
    ['url() in capitals', 'fill:URL(https://evil.example/x)'],
    ['url() with a comment inside', 'fill:ur/**/l(x)'],
    ['expression()', 'width:expression(alert(1))'],
    ['-moz-binding', '-moz-binding:url(evil.xml#a)'],
    ['behavior', 'behavior:url(evil.htc)'],
    ['@import', '@import url(evil.css)'],
    ['a CSS escape for u', 'fill:\\75rl(x)'],
    ['a CSS escape for the paren', 'fill:url\\28x)'],
    ['a numeric reference for u', 'fill:&#117;rl(x)'],
    ['a hex reference for u', 'fill:&#x75;rl(x)'],
    ['a reference for a backslash', 'fill:&#x5C;75rl(x)'],
    ['a reference for <', 'fill:&#60;script&#62;'],
    ['a declaration that ends the attribute', 'fill:red" onload="alert(1)'],
  ])('%s never survives', (_name, style) => {
    const svg = svgOf(`<svg><rect style="${style}"/></svg>`);
    expect(svg).not.toMatch(/url|expression|binding|behavior|import|evil|onload|alert|\\/i);
  });

  it('a safe style beside an unsafe one is kept only when the whole attribute is safe', () => {
    expect(svgOf(`<svg><rect style="fill:red;stroke:url(#a)"/></svg>`)).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect></rect></svg>');
    expect(svgOf(`<svg><rect style="fill:red;stroke:blue;bogus:1"/></svg>`)).toContain('style="fill:red;stroke:blue"');
  });
});

describe('ADV-033 depiction: DOCTYPE, entities, CDATA, comments, instructions', () => {
  it.each([
    ['a DOCTYPE with an internal subset', '<!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>'],
    ['an external entity (XXE)', '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg><text>&xxe;</text></svg>'],
    ['a billion laughs', '<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">]><svg><text>&lol2;</text></svg>'],
    ['an entity declared inside the svg', '<svg><!ENTITY a "b"><text>&a;</text></svg>'],
    ['a lower-case doctype', '<!doctype html><svg/>'],
    ['a public doctype', '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg/>'],
  ])('%s is refused as a value', (_name, input) => {
    expect(outcome(input)).toEqual({ refused: 'declaration' });
  });

  it('an entity reference without a declaration is literal text, and only the five predefined ones and numeric references decode', () => {
    const svg = svgOf('<svg><text>&lol; &amp; &#65;&#x42; &foo</text></svg>');
    expect(svg).toContain('<text>&amp;lol; &amp; AB &amp;foo</text>');
  });

  it('a numeric reference to a character XML forbids, or beyond Unicode, is removed', () => {
    expect(svgOf('<svg><text>a&#0;b&#1;c&#xD800;d&#x110000;e&#4294967295;f</text></svg>')).toContain('<text>abcdef</text>');
    // Longer than ten digits is not a reference the sanitiser reads at all: it stays literal text and is escaped.
    expect(svgOf('<svg><text>a&#99999999999;b</text></svg>')).toContain('<text>a&amp;#99999999999;b</text>');
  });

  it('CDATA is dropped whole, including markup inside it and an unclosed section', () => {
    expect(svgOf('<svg><text><![CDATA[<script>alert(1)</script>]]>ok</text></svg>')).toBe('<svg xmlns="http://www.w3.org/2000/svg"><text>ok</text></svg>');
    expect(svgOf('<svg><rect/><![CDATA[<script>alert(1)')).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect></rect></svg>');
  });

  it('comments are dropped whole: conditional comments, comments hiding markup, unclosed comments', () => {
    expect(svgOf('<svg><!--[if IE]><script>alert(1)</script><![endif]--><rect/></svg>')).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect></rect></svg>');
    expect(svgOf('<svg><!-- <rect onclick="x"> --><circle/></svg>')).toBe('<svg xmlns="http://www.w3.org/2000/svg"><circle></circle></svg>');
    expect(svgOf('<svg><rect/><!-- <script>alert(1)</script>')).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect></rect></svg>');
  });

  it('processing instructions and the XML declaration are dropped', () => {
    const svg = svgOf('<?xml version="1.0"?><?xml-stylesheet href="evil.css" type="text/css"?><svg><?php system("id"); ?><rect/></svg>');
    expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect></rect></svg>');
  });
});

describe('ADV-033 depiction: malformed markup', () => {
  it.each([
    ['an unclosed tag', '<svg><rect'],
    ['an unclosed attribute value', '<svg><rect width="5'],
    ['a tag inside an attribute value', '<svg><rect width="<script>alert(1)</script>"/></svg>'],
    ['a doubled bracket', '<<svg>><rect/>>'],
    ['end tags without starts', '</svg></svg></g><svg><rect/>'],
    ['crossed tags', '<svg><g><path></g></path><rect/></svg>'],
    ['a tag name with a slash', '<svg><scr/ipt>alert(1)</scr/ipt></svg>'],
    ['a null byte inside a tag name', '<svg><scr\u0000ipt>alert(1)</scr\u0000ipt></svg>'],
    ['a newline inside a tag name', '<svg><scr\nipt>alert(1)</scr\nipt></svg>'],
    ['an attribute with no name', '<svg><rect ="x" onclick="a"/></svg>'],
    ['slashes for spaces', '<svg><rect/onclick=alert(1)/></svg>'],
    ['a quote that hides the end of the tag', `<svg><rect width='1" onclick="alert(1)'/></svg>`],
    ['a greater-than inside a quoted value', '<svg><rect width=">" onclick="alert(1)"/></svg>'],
    ['many roots', '<svg/><svg onload="alert(1)"/><script>alert(1)</script>'],
    ['text before and after', 'hello <svg><rect/></svg> <script>alert(1)</script>'],
  ])('%s: inert or refused, never a handler or a script', (_name, input) => {
    const out = outcome(input);
    if ('svg' in out) expect(out.svg).not.toMatch(/alert|onclick|onload|script/i);
  });

  it('a lone "<" or ">" and stray quotes in text are escaped, never markup', () => {
    const out = outcome('<svg><text>a > b " c \' d</text></svg>');
    expect('svg' in out && out.svg).toBe('<svg xmlns="http://www.w3.org/2000/svg"><text>a &gt; b &quot; c \' d</text></svg>');
  });
});

describe('ADV-033 depiction: size and depth', () => {
  it('nesting depth 10,000 is refused as a value, without recursion', () => {
    expect(outcome(`<svg>${'<g>'.repeat(10_000)}</svg>`)).toEqual({ refused: 'too_deep' });
    expect(outcome(`<svg>${'<a>'.repeat(10_000)}`)).toEqual({ refused: 'too_deep' });
  });

  it('a 5 MB input is refused as a value, naming the 2 MiB cap', () => {
    const big = `<svg>${'<rect width="1"/>'.repeat(Math.ceil((5 * 1024 * 1024) / 17))}</svg>`;
    expect(big.length).toBeGreaterThan(5 * 1024 * 1024);
    const out = sanitizeSvg(big);
    expect(out).toMatchObject({ ok: false, reason: 'too_large' });
    expect(out.ok ? '' : out.message).toContain('2 MiB');
  });

  it('an input at the cap made of the worst shapes finishes (linear work, no backtracking) and is inert', () => {
    const shapes = [
      '<a>'.repeat(80) + '</b>'.repeat(200_000),
      '<svg>' + '<!--'.repeat(200_000),
      '<svg>' + '<rect x="'.repeat(100_000),
      '<svg>' + '&#x0;&amp;&#'.repeat(150_000),
      '<svg>' + '<g></g>'.repeat(140_000),
      '<svg><path d="' + 'M1 '.repeat(600_000) + '"/></svg>',
      '<svg>' + '<text>' + '&lt;'.repeat(400_000),
    ].map((text) => text.slice(0, MAX_SVG_INPUT_CHARS));
    for (const text of shapes) {
      const out = sanitizeSvg(text);
      if (out.ok) expect(inertProblems(out.svg)).toEqual([]);
    }
  });

  it('a thousand text nodes and ten thousand attributes across tags stay bounded in the output', () => {
    const many = `<svg>${'<text>hello</text>'.repeat(1_000)}${'<rect a="1" b="2" c="3"/>'.repeat(10_000)}</svg>`;
    const out = sanitizeSvg(many);
    if (!out.ok) throw new Error(out.message);
    expect(out.svg.length).toBeLessThan(many.length);
    expect(out.report.elementsKept).toBe(1 + 1_000 + 10_000);
  });
});
