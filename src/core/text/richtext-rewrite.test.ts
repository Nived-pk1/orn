/** `rewriteRichTextLinks` (step 3.7, Phase 3 note 2): only links the parser itself sees are rewritten, everything else is byte-identical. */
import { describe, expect, it } from 'vitest';
import { richTextLinks, rewriteRichTextLinks } from './richtext';

const MAP = new Map([
  ['cpt_alpha', 'cpt_new-alpha'],
  ['spc_beta', 'spc_new-beta'],
]);
const mapId = (id: string): string | undefined => MAP.get(id);

describe('rewriteRichTextLinks', () => {
  it('rewrites a plain link and a labelled link, keeping the label and the text around them', () => {
    const result = rewriteRichTextLinks('See [[cpt_alpha]] and [[spc_beta|the species]] today.', mapId);
    expect(result).toEqual({ text: 'See [[cpt_new-alpha]] and [[spc_new-beta|the species]] today.', rewritten: 2 });
  });

  it('leaves links to IDs outside the map untouched and reports zero', () => {
    const source = 'See [[cpt_other]] only.';
    expect(rewriteRichTextLinks(source, mapId)).toEqual({ text: source, rewritten: 0 });
  });

  it('rewrites every occurrence, inside emphasis, strong, and bullet items, over LF, CRLF and CR line endings', () => {
    const source = '**bold [[cpt_alpha]]** and *em [[spc_beta]]*\r\nsecond line [[cpt_alpha]]\r\rpara two\n- item [[spc_beta]]\n- *nested **[[cpt_alpha]]** here*';
    const result = rewriteRichTextLinks(source, mapId);
    expect(result.rewritten).toBe(5);
    expect(result.text).toBe(source.replaceAll('[[cpt_alpha]]', '[[cpt_new-alpha]]').replaceAll('[[spc_beta]]', '[[spc_new-beta]]'));
    expect(richTextLinks(result.text).map((l) => l.id)).toEqual(['cpt_new-alpha', 'spc_new-beta']);
  });

  it('never touches a [[…]] the parser treats as literal text (inside a subscript group) and never touches malformed links', () => {
    const source = 'x_{[[cpt_alpha]]} [[cpt_alpha] [[cpt_alpha\nb]] [[xxx_alpha]] and [[cpt_alpha]]';
    const result = rewriteRichTextLinks(source, mapId);
    expect(result.rewritten).toBe(1);
    expect(result.text).toBe('x_{[[cpt_alpha]]} [[cpt_alpha] [[cpt_alpha\nb]] [[xxx_alpha]] and [[cpt_new-alpha]]');
  });

  it('the links found afterwards are exactly the links found before, with IDs mapped (order kept)', () => {
    const source = '[[spc_beta]] one, [[cpt_alpha|A]] two, [[cpt_keep]] three, [[spc_beta]] again';
    const before = richTextLinks(source).map((l) => l.id);
    const after = richTextLinks(rewriteRichTextLinks(source, mapId).text).map((l) => l.id);
    expect(after).toEqual(before.map((id) => MAP.get(id) ?? id));
  });

  it('an empty source and a map that maps an ID to itself change nothing', () => {
    expect(rewriteRichTextLinks('', mapId)).toEqual({ text: '', rewritten: 0 });
    expect(rewriteRichTextLinks('[[cpt_alpha]]', (id) => id)).toEqual({ text: '[[cpt_alpha]]', rewritten: 0 });
  });

  it('is bounded like parsing: a hostile 50,000-character text of unclosed openers finishes and rewrites nothing', () => {
    const source = '[['.repeat(25_000);
    expect(rewriteRichTextLinks(source, mapId)).toEqual({ text: source, rewritten: 0 });
  });
});
