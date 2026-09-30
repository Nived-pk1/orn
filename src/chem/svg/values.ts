/**
 * Attribute and style values the SVG sanitiser accepts (docs/SECURITY.md §2, ADR-009). Every validator answers the
 * NORMALISED value (trimmed, whitespace collapsed) or `undefined` (drop it): a value is either recognised whole by a small
 * regular expression or it does not pass. None of the patterns can match `(` except in `rgb(...)`/`rgba(...)`/transform
 * functions with numeric arguments, `=`, `<`, `@`, a backslash or a `/`, so no URL, reference, script or CSS escape can
 * get through. Pure; every regular expression is linear (no nested quantifiers).
 */

const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;
const UNIT = '(?:px|pt|pc|mm|cm|in|em|ex|%)?';
const LENGTH = new RegExp(`^${NUMBER}${UNIT}$`);
const LENGTH_LIST = new RegExp(`^${NUMBER}${UNIT}(?:[\\s,]+${NUMBER}${UNIT})*$`);
const NUMBER_LIST = new RegExp(`^${NUMBER}(?:[\\s,]+${NUMBER}){0,7}$`);
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]*$/;
const POINTS = /^[0-9eE+\-.,\s]*$/;
const TRANSFORM = new RegExp(`^(?:\\s*(?:translate|scale|rotate|skewX|skewY|matrix)\\(\\s*${NUMBER}(?:[\\s,]+${NUMBER}){0,5}\\s*\\))+\\s*$`);
const HEX_COLOUR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FUNCTION_COLOUR = new RegExp(`^rgba?\\(\\s*${NUMBER}%?(?:[\\s,]+${NUMBER}%?){2,3}\\s*\\)$`);
const NAMED_COLOUR = /^[A-Za-z]{2,25}$/;
const CLASS_NAMES = /^[A-Za-z0-9_ -]{1,500}$/;
const FONT_FAMILY = /^[A-Za-z0-9 ,._'"-]{1,200}$/;
const WHITESPACE_RUN = /\s+/g;

/** Trim and collapse whitespace: the one normal form, so a second pass changes nothing (idempotence). */
export const collapse = (value: string): string => value.replace(WHITESPACE_RUN, ' ').trim();

const matching = (pattern: RegExp) => (value: string): string | undefined => {
  const text = collapse(value);
  return pattern.test(text) ? text : undefined;
};

const oneOf = (words: readonly string[]) => (value: string): string | undefined => {
  const text = collapse(value);
  return words.includes(text) ? text : undefined;
};

const colour = (value: string): string | undefined => {
  const text = collapse(value);
  return HEX_COLOUR.test(text) || FUNCTION_COLOUR.test(text) || NAMED_COLOUR.test(text) ? text : undefined;
};

/** `stroke-dasharray`: a length list or `none`. */
const dashes = (value: string): string | undefined => {
  const text = collapse(value);
  return text === 'none' || LENGTH_LIST.test(text) ? text : undefined;
};

export type ValueKind =
  | 'length'
  | 'lengthList'
  | 'numberList'
  | 'number'
  | 'pathData'
  | 'points'
  | 'transform'
  | 'colour'
  | 'dashes'
  | 'className'
  | 'fontFamily'
  | 'fillRule'
  | 'lineCap'
  | 'lineJoin'
  | 'textAnchor'
  | 'fontStyle'
  | 'fontWeight'
  | 'baseline';

const NUMBER_ONLY = new RegExp(`^${NUMBER}$`);

const VALIDATORS: Readonly<Record<ValueKind, (value: string) => string | undefined>> = {
  length: matching(LENGTH),
  lengthList: matching(LENGTH_LIST),
  numberList: matching(NUMBER_LIST),
  number: matching(NUMBER_ONLY),
  pathData: matching(PATH_DATA),
  points: matching(POINTS),
  transform: matching(TRANSFORM),
  colour,
  dashes,
  className: matching(CLASS_NAMES),
  fontFamily: matching(FONT_FAMILY),
  fillRule: oneOf(['nonzero', 'evenodd']),
  lineCap: oneOf(['butt', 'round', 'square']),
  lineJoin: oneOf(['miter', 'round', 'bevel', 'miter-clip', 'arcs']),
  textAnchor: oneOf(['start', 'middle', 'end']),
  fontStyle: oneOf(['normal', 'italic', 'oblique']),
  fontWeight: oneOf(['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900']),
  baseline: oneOf(['auto', 'middle', 'central', 'hanging', 'alphabetic', 'mathematical', 'ideographic', 'text-before-edge', 'text-after-edge']),
};

export function validateValue(kind: ValueKind, raw: string): string | undefined {
  return VALIDATORS[kind](raw);
}

/**
 * What no output string may contain, in any case: a reference, a script scheme, a CSS `expression`, an event-handler
 * assignment, a tag opener. The value patterns above already cannot produce them; this is the second, independent check the
 * property tests state ("output never contains href, url(, on*=, <script, <!"), also applied to text nodes.
 */
const FORBIDDEN = /href|url\s*\(|javascript|expression|<|\bon[a-z]+\s*=/i;
export const hasForbiddenContent = (value: string): boolean => FORBIDDEN.test(value);

/** In a `style` attribute the whole attribute is refused if any of these appear (SECURITY §2): a url, `expression`, `@`, a backslash, `<`. */
const STYLE_REFUSED = /url\s*\(|expression|@|\\|</i;
export const styleIsRefused = (raw: string): boolean => STYLE_REFUSED.test(raw);
