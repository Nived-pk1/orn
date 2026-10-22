/**
 * An empty slot never shows the schema's "Unknown field slotOfClassId" text (step 6.7b, follow-up T1). The marker is draft-only, so L1 refuses
 * the row with that text; here the finding for such a row (and only such a row) is worded "Choose a species of <class> (participant n)" or
 * "(product n of outcome m)". Same finding id, path, severity; other findings and other problems on the row are untouched. Pure and total.
 */
import { SLOT_KEY } from '@/core/editing';
import type { Finding } from '@/core/validation';

type Bag = Record<string, unknown>;
const isBag = (value: unknown): value is Bag => typeof value === 'object' && value !== null && !Array.isArray(value);
const markerPart = (part: string): boolean => part.includes(`"${SLOT_KEY}"`);

const PARTICIPANT = /^participants\[(\d+)\]$/;
const PRODUCT = /^outcomes\[(\d+)\]\.products\[(\d+)\]$/;

function slotOf(draft: unknown, path: string): { readonly classId: string; readonly where: string } | undefined {
  if (!isBag(draft)) return undefined;
  const participant = PARTICIPANT.exec(path);
  if (participant !== null) {
    const index = Number(participant[1]);
    const row = Array.isArray(draft.participants) ? (draft.participants[index] as unknown) : undefined;
    return isBag(row) && typeof row[SLOT_KEY] === 'string' ? { classId: row[SLOT_KEY], where: `participant ${index + 1}` } : undefined;
  }
  const product = PRODUCT.exec(path);
  if (product === null) return undefined;
  const outcome = Number(product[1]);
  const at = Number(product[2]);
  const one = Array.isArray(draft.outcomes) ? (draft.outcomes[outcome] as unknown) : undefined;
  const row = isBag(one) && Array.isArray(one.products) ? (one.products[at] as unknown) : undefined;
  return isBag(row) && typeof row[SLOT_KEY] === 'string' ? { classId: row[SLOT_KEY], where: `product ${at + 1} of outcome ${outcome + 1}` } : undefined;
}

export function slotFindings(findings: readonly Finding[], draft: unknown, className: (classId: string) => string | undefined): readonly Finding[] {
  return findings.map((finding) => {
    if (finding.path === undefined || !finding.message.split('; ').some(markerPart)) return finding;
    const slot = slotOf(draft, finding.path);
    if (slot === undefined) return finding;
    const rest = finding.message.split('; ').filter((part) => !markerPart(part));
    const words = `Choose a species of ${className(slot.classId) ?? slot.classId} (${slot.where})`;
    return { ...finding, message: [words, ...rest].join('; '), data: { ...finding.data, slot: true } };
  });
}
