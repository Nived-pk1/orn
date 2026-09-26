/**
 * Chemistry-aware text normaliser — docs/SEARCH.md §2.
 *
 * `fold` produces a comparable form used by duplicate-name validation (SPC-001 …) and by search.
 * It is deliberately lossy and its output is never stored or shown (INV-01: derived data is not canonical).
 * It is total, linear in the input length, deterministic and idempotent: fold(fold(x)) === fold(x).
 */
import type { TextNormalizer } from './contracts';

const GREEK_NAMES: Readonly<Record<string, string>> = {
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  δ: 'delta',
  ε: 'epsilon',
  ζ: 'zeta',
  η: 'eta',
  θ: 'theta',
  ι: 'iota',
  κ: 'kappa',
  λ: 'lambda',
  μ: 'mu',
  ν: 'nu',
  ξ: 'xi',
  ο: 'omicron',
  π: 'pi',
  ρ: 'rho',
  σ: 'sigma',
  ς: 'sigma',
  τ: 'tau',
  υ: 'upsilon',
  φ: 'phi',
  χ: 'chi',
  ψ: 'psi',
  ω: 'omega',
};

/** U+0300–U+036F only: stripping every \p{M} would destroy non-Latin scripts. */
const COMBINING_DIACRITICS = /[̀-ͯ]/g;
const GREEK_LETTER = /[α-ω]/g;
/** Apostrophes, primes and backtick/acute used as apostrophes. */
const APOSTROPHES = /['‘’ʼ′″`´]/g;
/** Hyphen-minus, hyphens, non-breaking hyphen, figure/en/em dashes, horizontal bar, minus sign, small/fullwidth forms. */
const DASH = /[-‐-―−⁃﹘﹣－]/;
const WHITESPACE_RUNS = /\s+/g;
const ALNUM = /[\p{L}\p{N}]/u;

/**
 * A dash directly after a letter/digit and not before one is a charge sign (Br⁻ → br-) and is kept as "-".
 * Every other dash (Reimer–Tiemann, "a - b", "-nitro", "(-)-menthol") separates words and becomes a space.
 * The decision looks only at immediate neighbours, which later steps never change, so fold stays idempotent.
 */
function unifyDashes(input: string): string {
  const chars = Array.from(input);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] as string;
    if (!DASH.test(ch)) {
      out += ch;
      continue;
    }
    const prev = chars[i - 1];
    const next = chars[i + 1];
    const isChargeSign = prev !== undefined && ALNUM.test(prev) && !(next !== undefined && ALNUM.test(next));
    out += isChargeSign ? '-' : ' ';
  }
  return out;
}

export function fold(input: string): string {
  const stripped = input
    .normalize('NFKC') // sub/superscript digits and signs → ASCII digits and ±
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(GREEK_LETTER, (letter) => GREEK_NAMES[letter] ?? letter)
    .replace(APOSTROPHES, '');
  return unifyDashes(stripped).replace(WHITESPACE_RUNS, ' ').trim();
}

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}+-]+|[^\p{L}\p{N}+-]+$/gu;
const HAS_WORD_CHARACTER = /[\p{L}\p{N}]/u;

/**
 * Search tokens: each folded word (surrounding punctuation removed), each adjacent pair joined, and the
 * whole phrase joined, so "wolff-kishner", "wolff kishner" and "wolffkishner" all share a token.
 * Output size is O(input): at most 3n tokens for n words. Order is deterministic; duplicates are removed.
 */
export function tokens(input: string): readonly string[] {
  const words = fold(input)
    .split(' ')
    .map((word) => word.replace(EDGE_PUNCTUATION, ''))
    .filter((word) => HAS_WORD_CHARACTER.test(word));
  const out = new Set<string>(words);
  for (let i = 0; i + 1 < words.length; i++) out.add(`${words[i]}${words[i + 1]}`);
  if (words.length > 2) out.add(words.join(''));
  return [...out];
}

export const textNormalizer: TextNormalizer = { fold, tokens };
