/** Mini-markup parser — docs/DOMAIN_MODEL.md §3.4; ADV-033 (inert markup), REF-008 (soft links). */
import { describe, expect, it } from 'vitest';
import type { RichNode } from './contracts';
import { parseRichText, richTextLinks, richTextParser } from './richtext';

const text = (value: string): RichNode => ({ type: 'text', text: value });
const para = (...children: RichNode[]): RichNode => ({ type: 'paragraph', children });

describe('parseRichText: inline', () => {
  it('parses plain text as one paragraph', () => {
    expect(parseRichText('hello')).toEqual([para(text('hello'))]);
    expect(parseRichText('')).toEqual([]);
  });

  it('parses emphasis and strong', () => {
    expect(parseRichText('a *b* **c** d')).toEqual([
      para(
        text('a '),
        { type: 'em', children: [text('b')] },
        text(' '),
        { type: 'strong', children: [text('c')] },
        text(' d'),
      ),
    ]);
  });

  it('nests emphasis inside strong and strong inside emphasis', () => {
    expect(parseRichText('**a *b* c**')).toEqual([
      para({ type: 'strong', children: [text('a '), { type: 'em', children: [text('b')] }, text(' c')] }),
    ]);
    expect(parseRichText('*a **b** c*')).toEqual([
      para({ type: 'em', children: [text('a '), { type: 'strong', children: [text('b')] }, text(' c')] }),
    ]);
  });

  it('parses subscripts and superscripts', () => {
    expect(parseRichText('H_{2}SO_{4}, Br^{−}')).toEqual([
      para(
        text('H'),
        { type: 'sub', text: '2' },
        text('SO'),
        { type: 'sub', text: '4' },
        text(', Br'),
        { type: 'sup', text: '−' },
      ),
    ]);
  });

  it('parses record links with and without labels', () => {
    expect(parseRichText('see [[rxn_aldol]] and [[spc_xx|the ketone]]')).toEqual([
      para(
        text('see '),
        { type: 'link', target: { kind: 'reaction', id: 'rxn_aldol' }, label: 'rxn_aldol' },
        text(' and '),
        { type: 'link', target: { kind: 'species', id: 'spc_xx' }, label: 'the ketone' },
      ),
    ]);
  });

  it('allows markup inside emphasis, including links', () => {
    const [block] = parseRichText('*see [[rxn_aldol]] H_{2}O*');
    expect(block).toEqual(
      para({
        type: 'em',
        children: [
          text('see '),
          { type: 'link', target: { kind: 'reaction', id: 'rxn_aldol' }, label: 'rxn_aldol' },
          text(' H'),
          { type: 'sub', text: '2' },
          text('O'),
        ],
      }),
    );
  });
});

describe('parseRichText: blocks', () => {
  it('splits paragraphs on blank lines and keeps single newlines', () => {
    expect(parseRichText('one\ntwo\n\n\nthree')).toEqual([para(text('one\ntwo')), para(text('three'))]);
  });

  it('parses bullet lists and ends them at a blank or non-bullet line', () => {
    expect(parseRichText('intro\n- a\n- *b*\nafter')).toEqual([
      para(text('intro')),
      { type: 'bullets', items: [[text('a')], [{ type: 'em', children: [text('b')] }]] },
      para(text('after')),
    ]);
  });

  it('requires "- " exactly at the start of the line', () => {
    expect(parseRichText(' - a\n-b')).toEqual([para(text(' - a\n-b'))]);
  });

  it('handles CRLF and CR line endings like LF', () => {
    expect(parseRichText('a\r\n\r\nb\rc')).toEqual(parseRichText('a\n\nb\nc'));
  });
});

describe('parseRichText: malformed markup is literal (total parsing)', () => {
  it.each([
    ['unclosed *emphasis'],
    ['unclosed **strong'],
    ['2 * 3 * 4'],
    ['****'],
    ['**'],
    ['*'],
    ['H_{2'],
    ['H_{}'],
    ['x^{a\nb}'],
    ['[[rxn_aldol'],
    ['[[not an id]]'],
    ['[[rxn_aldol|]]'],
    ['[[Rxn_aldol]]'],
    ['[[zzz_aldol]]'],
    ['a_{b'],
  ])('%j renders verbatim', (source) => {
    const nodes = parseRichText(source);
    const flattened = JSON.stringify(nodes);
    expect(flattened).not.toContain('"strong"');
    expect(flattened).not.toContain('"link"');
    expect(flattened).not.toContain('"sub"');
    expect(flattened).not.toContain('"sup"');
    expect(nodes).toEqual([para(text(source))]);
  });

  it('keeps a valid link that follows a stray bracket', () => {
    expect(parseRichText('[[[rxn_aa]]')).toEqual([
      para(text('['), { type: 'link', target: { kind: 'reaction', id: 'rxn_aa' }, label: 'rxn_aa' }),
    ]);
  });

  it('never interprets HTML or Markdown (ADV-033)', () => {
    const source = '<script>alert(1)</script> <b>x</b> [link](javascript:alert(1)) `code` # heading';
    expect(parseRichText(source)).toEqual([para(text(source))]);
  });

  it('keeps content beyond the depth limit literal instead of dropping it', () => {
    const source = '*a **b *c **d *e f* g** h* i** j*';
    const nodes = parseRichText(source);
    const collected: string[] = [];
    const walk = (list: readonly RichNode[]): void => {
      for (const node of list) {
        if (node.type === 'text') collected.push(node.text);
        else if ('children' in node) walk(node.children);
      }
    };
    walk(nodes);
    for (const letter of 'abcdefghij') expect(collected.join('')).toContain(letter);
  });
});

describe('parseRichText: pathological input terminates', () => {
  it.each([
    ['unclosed openers with trailing text', '*a '.repeat(16_000)],
    ['unclosed strong openers', '**a '.repeat(12_000)],
    ['unclosed scripts', '_{a'.repeat(16_000)],
    ['unclosed links', '[[rxn_a'.repeat(7_000)],
    ['deep nesting', '*a '.repeat(2_000) + 'b' + '* '.repeat(2_000)],
  ])('%s terminates with a non-empty tree (the wall-clock bound is in tests/timing)', (_name, source) => {
    const nodes = parseRichText(source);
    expect(nodes.length).toBeGreaterThan(0);
  });
});

describe('richTextLinks', () => {
  it('returns distinct links in order of first appearance, including nested ones', () => {
    const source = 'a [[rxn_bb]] *[[spc_cc|x]]*\n\n- [[rxn_bb]] and [[cpt_dd]]';
    expect(richTextLinks(source)).toEqual([
      { kind: 'reaction', id: 'rxn_bb' },
      { kind: 'species', id: 'spc_cc' },
      { kind: 'concept', id: 'cpt_dd' },
    ]);
  });

  it('ignores malformed links and non-record IDs', () => {
    expect(richTextLinks('[[rxn_]] [[stg_abc]] [[fnd_abc]] [[rxn_ok]]')).toEqual([{ kind: 'reaction', id: 'rxn_ok' }]);
  });

  it('is exposed through the parser contract', () => {
    expect(richTextParser.links('[[rxn_zz]]')).toEqual([{ kind: 'reaction', id: 'rxn_zz' }]);
    expect(richTextParser.parse('x')).toEqual([para(text('x'))]);
  });
});

describe('parseRichText: totality on random input (seeded)', () => {
  it('never throws and never loses characters that are not markup delimiters', () => {
    let state = 0x9e3779b9;
    const random = (): number => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const alphabet = ['*', '**', '_{', '^{', '}', '[[', ']]', '|', 'rxn_a', 'x', ' ', '\n', '\n\n', '- ', 'é'];
    for (let run = 0; run < 300; run++) {
      let source = '';
      for (let i = 0, n = Math.floor(random() * 40); i < n; i++) {
        source += alphabet[Math.floor(random() * alphabet.length)];
      }
      const nodes = parseRichText(source);
      const letters: string[] = [];
      const walk = (list: readonly RichNode[]): void => {
        for (const node of list) {
          if (node.type === 'text' || node.type === 'sub' || node.type === 'sup') letters.push(node.text);
          else if (node.type === 'link') letters.push(node.label);
          else if (node.type === 'bullets') node.items.forEach(walk);
          else walk(node.children);
        }
      };
      walk(nodes);
      const kept = letters.join('');
      expect((source.match(/é/g) ?? []).length).toBe((kept.match(/é/g) ?? []).length);
    }
  });
});
