#!/usr/bin/env node
// Fails when tests/perf/*.bench.ts and tests/perf/budgets.mjs disagree (Gate C review, follow-up 3a): every bench()
// needs a budget entry (bench:compare aborts without one) and every budget entry must name an existing bench (a
// renamed bench leaves a dead entry). Static only: the bench files are read as text and no bench is run.
// A full name is `${describe title} > ${bench name}`, as Vitest reports it. A `${x}` in a title is expanded from a
// `for (const x of ['a', 'b'])` loop in the same file; any other `${...}` (a tuple loop, a computed label) matches
// any text, so such a bench needs at least one matching entry and such an entry counts as covered by it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PERF_DIR = join('tests', 'perf');

/** Reads the string literal starting at `from` (a quote, double quote or backtick); returns its raw body and end. */
function readLiteral(text, from) {
  const quote = text[from];
  if (quote !== "'" && quote !== '"' && quote !== '`') return undefined;
  let body = '';
  for (let i = from + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') { body += text[i + 1]; i += 1; continue; }
    if (ch === quote) return { body, end: i + 1 };
    body += ch;
  }
  return undefined;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Calls to `name(` whose first argument is a string literal, in file order. */
function callsOf(text, name) {
  const found = [];
  const re = new RegExp(`(?<![\\w.])${name}\\s*\\(\\s*`, 'g');
  for (const match of text.matchAll(re)) {
    const literal = readLiteral(text, match.index + match[0].length);
    if (literal) found.push({ at: match.index, title: literal.body });
  }
  return found;
}

function loopValues(text) {
  const values = new Map();
  for (const m of text.matchAll(/for\s*\(\s*const\s+(\w+)\s+of\s+\[([^\]]*)\]/g)) {
    values.set(m[1], [...m[2].matchAll(/'([^']*)'|"([^"]*)"/g)].map((v) => v[1] ?? v[2]));
  }
  return values;
}

/** Expands `${x}` from loops (cartesian); anything else becomes a wildcard marker. */
function expand(template, loops) {
  const WILD = '\u0000';
  let results = [template];
  for (const m of template.matchAll(/\$\{([^}]*)\}/g)) {
    const choices = loops.get(m[1].trim());
    results = results.flatMap((r) => (choices ? choices.map((c) => r.replace(m[0], c)) : [r.replace(m[0], WILD)]));
  }
  return results;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function toMatcher(name) {
  return new RegExp(`^${name.split('\u0000').map(escapeRe).join('[\\s\\S]+')}$`);
}

export async function checkBenchBudgets(root = process.cwd()) {
  const dir = join(root, PERF_DIR);
  const budgetKeys = Object.keys((await import(pathToFileURL(join(dir, 'budgets.mjs')).href)).BUDGETS);
  const benches = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.bench.ts')).sort()) {
    const text = stripComments(readFileSync(join(dir, file), 'utf8'));
    const loops = loopValues(text);
    const describes = callsOf(text, 'describe');
    for (const bench of callsOf(text, 'bench')) {
      const owner = describes.filter((d) => d.at < bench.at).at(-1);
      if (!owner) continue;
      for (const title of expand(owner.title, loops)) {
        for (const name of expand(bench.title, loops)) benches.push({ file, full: `${title} > ${name}` });
      }
    }
  }
  const matchers = benches.map((b) => ({ ...b, re: toMatcher(b.full) }));
  const missingBudgets = matchers.filter((b) => !budgetKeys.some((k) => b.re.test(k))).map((b) => `${b.file}: ${b.full.replaceAll('\u0000', '*')}`);
  const deadBudgets = budgetKeys.filter((k) => !matchers.some((b) => b.re.test(k)));
  return { benchCount: benches.length, budgetCount: budgetKeys.length, missingBudgets, deadBudgets };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const result = await checkBenchBudgets();
  for (const name of result.missingBudgets) console.error(`✖ bench without a budgets.mjs entry: ${name}`);
  for (const name of result.deadBudgets) console.error(`✖ budgets.mjs entry without a bench: ${name}`);
  if (result.missingBudgets.length + result.deadBudgets.length > 0) process.exit(1);
  console.log(`check:bench-budgets passed (${result.benchCount} benches, ${result.budgetCount} entries)`);
}
