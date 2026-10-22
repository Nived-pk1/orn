/**
 * Exams step, X3: no on-screen text assumes one exam. A product string (string literal, template text or JSX text) outside the data
 * must not contain "JEE" (exam names come from the data). Comments are not strings and are not checked. The allow-list holds only
 * data-driven text: the demo dataset and the legacy importer's vocabulary (a data mapping that is never shown as UI words).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ALLOWED_DIRS = ['src/test-support', 'src/io/legacy-v6'];
const slash = (p: string): string => p.split(String.fromCharCode(92)).join('/');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

export function jeeStrings(fileName: string, text: string): string[] {
  const found: string[] = [];
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node: ts.Node): void => {
    const isText = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node);
    if (isText && /JEE/i.test(node.text)) found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('product strings outside the data', () => {
  it('the scanner sees strings, template text and JSX text but not comments', () => {
    expect(jeeStrings('a.ts', "const a = 'JEE Main'; // JEE here\n/* JEE */ const b = `x ${a} jee`;")).toEqual(['JEE Main', ' jee']);
    expect(jeeStrings('a.tsx', 'export const A = () => <p>For JEE</p>;')).toEqual(['For JEE']);
  });

  it('none contains "JEE" (src, index.html and public)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(resolve('src'))) {
      const rel = slash(relative(resolve('.'), file));
      if (ALLOWED_DIRS.some((d) => rel.startsWith(`${d}/`))) continue;
      for (const s of jeeStrings(file, readFileSync(file, 'utf8'))) offenders.push(`${rel}: ${s.slice(0, 80)}`);
    }
    expect(offenders).toEqual([]);
    expect(/jee/i.test(readFileSync(resolve('index.html'), 'utf8'))).toBe(false);
  });
});
