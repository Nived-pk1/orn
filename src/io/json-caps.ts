/**
 * Bounded, iterative caps enforced BEFORE `JSON.parse` (docs/SECURITY.md §3, ADV-032, IMPLEMENTATION_PLAN.md
 * §2 step 3.6): a string/escape-aware scan of the raw text tracks nesting depth and each string literal's
 * length, stopping at the first violation. One linear pass, no recursion, so a hostile 60 MB / depth-100
 * file is rejected without ever building a parse tree or touching the call stack. `JSON.parse` only ever
 * runs after this scan passes, so its own recursion depth is already bounded by `maxDepth`; any later walk
 * over the parsed value is bounded the same way (`sanitizeUnsafeKeys.ts`).
 */
export interface CapScanLimits {
  readonly maxDepth: number;
  /** Characters of raw JSON text inside one string literal's quotes (an escape sequence counts as one). */
  readonly maxStringLength: number;
}

export type CapScanResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'TOO_DEEP' | 'STRING_TOO_LONG'; readonly message: string; readonly at: number };

const QUOTE = 34; // "
const BACKSLASH = 92; // \
const OPEN_BRACE = 123; // {
const OPEN_BRACKET = 91; // [
const CLOSE_BRACE = 125; // }
const CLOSE_BRACKET = 93; // ]

export function scanJsonCaps(text: string, limits: CapScanLimits): CapScanResult {
  const len = text.length;
  let depth = 0;
  let inString = false;
  let stringLength = 0;
  let i = 0;
  while (i < len) {
    const ch = text.charCodeAt(i);
    if (inString) {
      if (ch === BACKSLASH) {
        // The escaped character (whatever it is) can never toggle string state or be a structural token.
        i += 2;
        stringLength += 1;
        continue;
      }
      if (ch === QUOTE) {
        inString = false;
        i += 1;
        continue;
      }
      stringLength += 1;
      if (stringLength > limits.maxStringLength) {
        return { ok: false, code: 'STRING_TOO_LONG', message: `a string literal exceeds ${limits.maxStringLength} characters`, at: i };
      }
      i += 1;
      continue;
    }
    if (ch === QUOTE) {
      inString = true;
      stringLength = 0;
      i += 1;
      continue;
    }
    if (ch === OPEN_BRACE || ch === OPEN_BRACKET) {
      depth += 1;
      if (depth > limits.maxDepth) {
        return { ok: false, code: 'TOO_DEEP', message: `nesting exceeds depth ${limits.maxDepth}`, at: i };
      }
      i += 1;
      continue;
    }
    if (ch === CLOSE_BRACE || ch === CLOSE_BRACKET) {
      depth -= 1;
    }
    i += 1;
  }
  return { ok: true };
}
