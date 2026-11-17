/** The mail a "Report a mistake" opens (step 8.4g, G6): the record's link, its kind and the app version, and a line to say what is wrong. */
const MAX_NAME = 120;

export interface MistakeFields {
  readonly address: string;
  readonly name: string;
  readonly kind: string;
  readonly link: string;
  readonly version: string;
}

export function mistakeMailto(fields: MistakeFields): string {
  const name = fields.name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  const body = `Link: ${fields.link}\nKind: ${fields.kind}\nApp version: ${fields.version}\n\nWhat is wrong:\n`;
  return `mailto:${fields.address}?subject=${encodeURIComponent(`ORN: mistake in ${name}`)}&body=${encodeURIComponent(body)}`;
}
