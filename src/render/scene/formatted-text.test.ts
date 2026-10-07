/** FormattedText (step 5.3): mini-markup AST to runs, and formula typography (a total function; the runs joined are the input). */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseRichText, type RichNode } from '@/core/text';
import type { FormattedText } from './contracts';
import { formulaRuns, plainRuns, richToRuns } from './formatted-text';

const joined = (runs: FormattedText): string => runs.map((run) => run.text).join('');
/** Compact form for the table: `H` plain, `_2_` a subscript, `^2+^` a superscript. */
const shown = (runs: FormattedText): string => runs.map((run) => (run.script === 'sub' ? `_${run.text}_` : run.script === 'sup' ? `^${run.text}^` : run.text)).join('');

describe('formulaRuns: ordinary formulas', () => {
  const table: readonly (readonly [string, string])[] = [
    ['H2O', 'H_2_O'],
    ['CH3COOH', 'CH_3_COOH'],
    ['C2H5OH', 'C_2_H_5_OH'],
    ['C12H22O11', 'C_12_H_22_O_11_'],
    ['Ca(OH)2', 'Ca(OH)_2_'],
    ['(NH4)2SO4', '(NH_4_)_2_SO_4_'],
    ['K2Cr2O7', 'K_2_Cr_2_O_7_'],
    ['Cl2', 'Cl_2_'],
    ['NH4+', 'NH_4_^+^'],
    ['Ca2+', 'Ca^2+^'],
    ['Fe3+', 'Fe^3+^'],
    ['SO4 2-', 'SO_4_ ^2-^'],
    ['SO42-', 'SO_4_^2-^'],
    ['Cl-', 'Cl^-^'],
    ['H3O+', 'H_3_O^+^'],
    ['[Fe(CN)6]3-', '[Fe(CN)_6_]^3-^'],
    ['[Cu(NH3)4]2+', '[Cu(NH_3_)_4_]^2+^'],
    ['CuSO4·5H2O', 'CuSO_4_·5H_2_O'],
  ];
  it.each(table)('%s', (input, expected) => expect(shown(formulaRuns(input))).toBe(expected));
});

describe('formulaRuns: odd formulas stay as they are', () => {
  const table: readonly (readonly [string, string])[] = [
    ['', ''],
    ['+', '+'],
    ['-', '-'],
    ['2', '2'],
    ['2H2O', '2H_2_O'], // a leading coefficient stays
    ['CnH2n+2', 'CnH_2_n+2'], // a general formula: only the digit after H
    ['CnH2n-2', 'CnH_2_n-2'],
    ['R–CH2OH', 'R–CH_2_OH'],
    ['R2C=CR2', 'R_2_C=CR_2_'],
    ['K2Cr2O7 / H⁺', 'K_2_Cr_2_O_7_ / H⁺'], // Unicode scripts are not touched
    ['H₂O', 'H₂O'],
    ['pent-2-ene', 'pent-2-ene'],
    ['a b', 'a b'],
    ['H 2', 'H 2'], // a digit after a space is not a subscript
    ['((', '(('],
    ['))2', '))_2_'],
    ['+2', '+2'],
    ['H2-', 'H^2-^'],
  ];
  it.each(table)('%j', (input, expected) => expect(shown(formulaRuns(input))).toBe(expected));
});

describe('formulaRuns: totality', () => {
  it('the runs joined equal the input, for any string', () => {
    fc.assert(fc.property(fc.string({ unit: 'binary', maxLength: 60 }), (text) => joined(formulaRuns(text)) === text));
  });

  it('the runs joined equal the input, for strings of formula characters', () => {
    const chars = fc.constantFrom(...'HCNOSPClBrNaK0123456789()[]+-−·– ×=^_abn'.split(''));
    fc.assert(fc.property(fc.array(chars, { maxLength: 40 }), (parts) => joined(formulaRuns(parts.join(''))) === parts.join('')));
  });

  it('never makes an empty run and never leaves two neighbours of the same style', () => {
    const chars = fc.constantFrom(...'HCOCl0123456789()+-'.split(''));
    fc.assert(
      fc.property(fc.array(chars, { maxLength: 30 }), (parts) => {
        const runs = formulaRuns(parts.join(''));
        return runs.every((run, i) => run.text !== '' && (i === 0 || runs[i - 1]?.script !== run.script));
      }),
    );
  });

  it('keeps hostile text as characters', () => {
    const hostile = '<img src=x onerror=alert(1)>H2O"\'&amp;';
    expect(joined(formulaRuns(hostile))).toBe(hostile);
    expect(shown(formulaRuns(hostile))).toBe('<img src=x onerror=alert(1)>H_2_O"\'&amp;');
  });
});

describe('plainRuns', () => {
  it('is one run, the text verbatim; nothing for an empty text', () => {
    expect(plainRuns('<b>x</b> **y**')).toEqual([{ text: '<b>x</b> **y**' }]);
    expect(plainRuns('')).toEqual([]);
    expect(plainRuns('a', 'strong')).toEqual([{ text: 'a', emphasis: 'strong' }]);
  });
});

describe('richToRuns', () => {
  it('turns emphasis, scripts and links into runs and merges neighbours of the same style', () => {
    const ast: readonly RichNode[] = [
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
      { type: 'strong', children: [{ type: 'text', text: 'S' }, { type: 'em', children: [{ type: 'text', text: 'E' }] }] },
      { type: 'sub', text: '2' },
      { type: 'sup', text: '+' },
      { type: 'link', target: { kind: 'species', id: 'spc_x' }, label: 'L' },
    ];
    expect(richToRuns(ast)).toEqual([{ text: 'ab' }, { text: 'S', emphasis: 'strong' }, { text: 'E', emphasis: 'em' }, { text: '2', script: 'sub' }, { text: '+', script: 'sup' }, { text: 'L' }]);
  });

  it('keeps every character of a paragraph and a bullet list, with line breaks between blocks', () => {
    const ast = parseRichText('First line\n\n- one\n- two');
    const text = joined(richToRuns(ast));
    for (const part of ['First line', 'one', 'two']) expect(text).toContain(part);
    expect(text).toContain('\n');
  });

  it('keeps text past the depth cap as plain text', () => {
    let deep: RichNode = { type: 'text', text: 'deep' };
    for (let i = 0; i < 40; i += 1) deep = { type: 'strong', children: [deep] };
    expect(joined(richToRuns([deep]))).toBe('deep');
  });

  it('is total for text the parser reads as hostile', () => {
    for (const source of ['**unclosed', '[[spc_x|<script>alert(1)</script>]]', '^^^^', '*'.repeat(500), '<a href="javascript:alert(1)">x</a>']) {
      const runs = richToRuns(parseRichText(source));
      expect(Array.isArray(runs)).toBe(true);
      for (const run of runs) expect(typeof run.text).toBe('string');
    }
  });

  it('is empty for an empty AST', () => expect(richToRuns([])).toEqual([]));
});
