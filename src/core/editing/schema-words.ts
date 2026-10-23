/**
 * The schema's own (zod) phrases in plain words (step 6.8 follow-up U6), for the findings panel. A required choice not made reads
 * "Choose <field words> for <place>" ("Choose a role for product 1 of outcome 1"); any other schema phrase "<Field words> is not valid
 * (<place>)". The schema's plain messages ("Must not be blank"), messages of any other rule and the parts of a message that are already
 * words are kept. Pure; the finding itself is never changed (INV-24), only how it is worded on screen. No chemistry.
 */
import type { Finding } from '../validation';

const SCHEMA_RULE = 'SCHEMA';
const LIBRARY_PHRASE = /^(Invalid (input|option|string|number|key|element|value|format|type)\b|Too (small|big)\b|Input not instance\b|Unrecognized key)|\bexpected .+, received\b/;

/** True for a phrase the schema library wrote (not one the schema's authors wrote). */
export const isSchemaWording = (message: string): boolean => LIBRARY_PHRASE.test(message.trim());

const spaced = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();

/** "outcomes" -> "outcome", "stages" -> "stage", "classes" -> "class", "properties" -> "property", "conditionVariants" -> "condition variant". */
function singular(name: string): string {
  const words = spaced(name);
  if (/ies$/.test(words)) return `${words.slice(0, -3)}y`;
  if (/(ss|x|ch|sh)es$/.test(words)) return words.slice(0, -2);
  if (/s$/.test(words) && !/ss$/.test(words)) return words.slice(0, -1);
  return words;
}

interface Token {
  readonly name: string;
  readonly index: number | undefined;
}

const tokensOf = (path: string): Token[] =>
  [...path.matchAll(/([A-Za-z_][A-Za-z0-9_]*)(?:\[(\d+)\])?/g)].map((m) => ({ name: m[1] as string, index: m[2] === undefined ? undefined : Number(m[2]) }));

const placeOf = (tokens: readonly Token[]): string =>
  [...tokens].reverse().map((token) => (token.index === undefined ? spaced(token.name) : `${singular(token.name)} ${token.index + 1}`)).join(' of ');

function fieldAndPlace(path: string | undefined): { readonly field: string; readonly place: string } {
  const tokens = tokensOf(path ?? '');
  const last = tokens.at(-1);
  if (last === undefined) return { field: 'this record', place: '' };
  if (last.index !== undefined) return { field: `${singular(last.name)} ${last.index + 1}`, place: placeOf(tokens.slice(0, -1)) };
  return { field: spaced(last.name), place: placeOf(tokens.slice(0, -1)) };
}

const article = (words: string): string => (/^[aeiou]/.test(words) ? 'an' : 'a');
const capital = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** The message of a finding as the panel shows it. */
export function findingWords(finding: Finding): string {
  if (finding.ruleId !== SCHEMA_RULE) return finding.message;
  const parts = finding.message.split('; ');
  if (!parts.some(isSchemaWording)) return finding.message;
  const ours = parts.filter((part) => !isSchemaWording(part));
  if (ours.length > 0) return ours.join('; ');
  const { field, place } = fieldAndPlace(finding.path);
  if (parts.some((part) => part.startsWith('Invalid option'))) return `Choose ${article(field)} ${field}${place === '' ? '' : ` for ${place}`}`;
  return `${capital(field)} is not valid${place === '' ? '' : ` (${place})`}`;
}
