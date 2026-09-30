/**
 * Character data for the SVG sanitiser: decode the five predefined entities and numeric references (and nothing else: no
 * DOCTYPE is accepted, so no other entity can be defined; an unknown `&name;` stays literal text and is escaped on output),
 * remove characters XML 1.0 forbids, and escape for output. Pure.
 */

const ENTITY = /&(#x[0-9A-Fa-f]{1,8}|#[0-9]{1,10}|amp|lt|gt|quot|apos);/g;
const NAMED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
// Characters an XML 1.0 document may contain (tab, LF, CR, and the printable ranges without the two noncharacters).
const ILLEGAL_XML = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu;
const ILLEGAL_XML_ONE = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/u;

export interface Decoded {
  readonly text: string;
  /** Numeric references to characters XML forbids (removed). */
  readonly badReferences: number;
}

export function decode(raw: string): Decoded {
  let badReferences = 0;
  const replaced = raw.replace(ENTITY, (whole, body: string) => {
    if (!body.startsWith('#')) return NAMED[body] ?? whole;
    const code = body[1] === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
      badReferences += 1;
      return '';
    }
    const char = String.fromCodePoint(code);
    if (ILLEGAL_XML_ONE.test(char)) {
      badReferences += 1;
      return '';
    }
    return char;
  });
  return { text: replaced.replace(ILLEGAL_XML, ''), badReferences };
}

/** For an attribute value in double quotes or for text. */
export function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
