/**
 * The participants of ONE legacy reaction → participants, stages, the single outcome and intermediates (docs/MIGRATION.md §4.5,
 * §4.6). Roles: `substrate` → reactant + `isPrimarySubstrate`; `workup` → `workup_reagent` in a second stage of kind `workup`;
 * `product` / `byproduct` → the products of ONE outcome (`major` → main, other products → coproduct + review, byproducts →
 * byproduct; selectivity `unspecified`); `intermediate` → `intermediates[]` (kind other) + review. A participant that cannot be
 * represented (no ref and no usable label) is kept whole in `unmapped` with a reason: it is never dropped.
 *
 * Nested IDs use the participant's 1-based position in the legacy list (`prt_v6-r5-3`, `pdt_v6-r5-3`, `int_v6-r5-3`), so a skipped
 * participant leaves a gap and the IDs of the others do not depend on it.
 */
import { LIMITS, RichTextSchema, ShortTextSchema, LabelTextSchema, type ConditionParameters, type Participant, type ParticipantRole, type Product, type Reaction, type RecordRef, type SpeciesOrClassRef, type SubstanceRef } from '@/core/schema';
import type { LegacyIdSpace } from './id-space';
import { parseLabel, type ParsedLabel } from './label-parser';
import { excerpt, type CompoundScope } from './compound-scope';
import { list } from './compound-review';
import type { AssetBook } from './reaction-assets';
import { mergeStageParameters } from './reaction-labels';
import { ROLES, UNKNOWN_ROLE } from './reaction-roles';
import type { SubstanceBook } from './reaction-substances';
import { idKey } from './id-collect';
import { isObj, type LegacyObject } from './text';

type Intermediate = Reaction['intermediates'][number];
export interface PartsContext {
  readonly reaction: LegacyObject;
  readonly index: number;
  /** The reaction's key in the ID space and its legacy ID text (for usage notes). */
  readonly key: string;
  readonly legacyId: string;
  readonly ref: RecordRef;
  readonly ids: LegacyIdSpace;
  readonly substances: SubstanceBook;
  readonly assets: AssetBook;
  readonly scope: CompoundScope;
  /** The stage-1 parameters read from `conditions`; whole-label temperatures and light are merged into them (or into the workup stage's). */
  readonly stage1: ConditionParameters;
  readonly workup: ConditionParameters;
}

export interface MappedParts {
  readonly participants: Participant[];
  readonly stage1Ids: string[];
  readonly workupIds: string[];
  /** True when something belongs in the workup stage (a workup participant, or a whole-label temperature of a workup participant). */
  readonly hasWorkup: boolean;
  readonly products: Product[];
  readonly intermediates: Intermediate[];
  /** Every species / class the reaction refers to (participants, products, intermediates), for its scope. */
  readonly substanceRefs: SpeciesOrClassRef[];
}

const asText = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const isBlank = (value: unknown): boolean => value === undefined || value === null || value === '' || value === false;
const truthy = (value: unknown): boolean => Boolean(value);
const valid = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown): value is string => typeof value === 'string' && schema.safeParse(value).success;

/** Maps all participants of one reaction. Total: never throws for any parsed-JSON input. */
export async function mapParticipants(ctx: PartsContext, participants: readonly unknown[]): Promise<MappedParts> {
  const { scope, ids, key, legacyId, substances } = ctx;
  const out: MappedParts = { participants: [], stage1Ids: [], workupIds: [], hasWorkup: false, products: [], intermediates: [], substanceRefs: [] };
  const coproducts: string[] = [];
  const classProducts: string[] = [];
  const dangling: string[] = [];
  const unknownRoles: string[] = [];
  const tokenOnly: string[] = [];
  const parameterOverflow: string[] = [];
  let hasWorkup = false;

  for (const [j, raw] of participants.entries()) {
    const at = ['participants', j] as const;
    const position = j + 1;
    if (!isObj(raw) || Array.isArray(raw)) {
      scope.keep([`participants[${j}]`], raw);
      scope.reason(`participant ${position} is not an object; kept in legacy.unmapped`);
      continue;
    }
    const p = raw;
    const keepWhole = (why: string): void => {
      scope.keep([`participants[${j}]`], p);
      scope.reason(`participant ${position}: ${why}; the whole participant is kept in legacy.unmapped`);
    };

    const roleText = asText(p.role);
    const known = roleText === undefined ? undefined : ROLES.get(roleText);
    const info = known ?? UNKNOWN_ROLE;
    if (known !== undefined) scope.consume([...at, 'role'], p.role);
    else {
      scope.keep([`participants[${j}].role`], p.role);
      unknownRoles.push(excerpt(p.role, 30));
    }

    const hasRef = truthy(p.ref);
    const label = p.label;
    const labelText = asText(label);
    const wholeLabel = labelText !== undefined && labelText.trim() !== '';
    if (!hasRef && !wholeLabel) {
      keepWhole(isBlank(label) ? 'it has neither a compound reference nor a label' : `its label is ${typeof label}, not text`);
      continue;
    }

    // ---- a whole-label temperature or light is a stage parameter, not a participant
    let parsedLabel: ParsedLabel | undefined;
    if (!hasRef) {
      if (p.ref !== undefined) scope.consume([...at, 'ref'], p.ref); // falsy: v6's "no reference"
      parsedLabel = parseLabel(labelText as string);
      for (const item of parsedLabel.review) scope.reason(`participant ${position}: ${item.message}`);
      if (parsedLabel.kind === 'stage_parameter') {
        const target = info.group === 'workup' ? ctx.workup : ctx.stage1;
        parameterOverflow.push(...mergeStageParameters(target, parsedLabel, (labelText as string).trim(), scope));
        if (info.group === 'workup') hasWorkup = true;
        scope.consume([...at, 'label'], label);
        if (!isBlank(p.note)) {
          scope.keep([`participants[${j}].note`], p.note);
          scope.reason(`participant ${position} is a stage parameter (${excerpt(labelText, 30)}); its note is kept in legacy.unmapped`);
        } else if (p.note !== undefined) scope.consume([...at, 'note'], p.note);
        if (p.major !== undefined && p.major !== false) scope.keep([`participants[${j}].major`], p.major);
        else if (p.major !== undefined) scope.consume([...at, 'major'], p.major);
        await attachImage(ctx, j, p, labelText as string);
        continue;
      }
    }

    // ---- the substance
    let ref: SubstanceRef | undefined;
    let intermediateLabel: string | undefined;
    let originalText: string | undefined;
    let tokens: ParsedLabel | undefined;
    if (hasRef) {
      const target = substances.refFor(p.ref, legacyId);
      if (target.placeholder && !dangling.includes(idText(p.ref))) dangling.push(idText(p.ref));
      ref = target.ref;
      scope.consume([...at, 'ref'], p.ref);
      if (wholeLabel) {
        if (valid(ShortTextSchema, labelText)) {
          originalText = labelText;
          scope.consume([...at, 'label'], label);
        } else {
          scope.keep([`participants[${j}].label`], label);
          scope.reason(`participant ${position}: the label cannot be stored as original text; kept in legacy.unmapped`);
        }
      } else if (isBlank(label)) {
        if (label !== undefined) scope.consume([...at, 'label'], label);
      } else {
        scope.keep([`participants[${j}].label`], label);
        scope.reason(`participant ${position}: the label is ${typeof label === 'string' ? 'blank' : typeof label}; kept in legacy.unmapped`);
      }
    } else {
      const text = labelText as string;
      if (info.group === 'intermediate') {
        // an intermediate keeps its label: it is a name for a transient species, not a compound to look up or create
        if (valid(LabelTextSchema, text)) {
          intermediateLabel = text;
          scope.consume([...at, 'label'], label);
        } else {
          keepWhole('the label cannot be stored as an intermediate label');
          continue;
        }
      } else {
        tokens = parsedLabel;
        const remainder = (parsedLabel as ParsedLabel).remainder;
        const name = remainder !== '' ? remainder : text.trim();
        if (remainder === '') tokenOnly.push(excerpt(text.trim(), 30));
        if (!substances.canName(name)) {
          keepWhole('the label cannot be the name of a record');
          continue;
        }
        if (!valid(ShortTextSchema, text)) {
          keepWhole('the label cannot be stored as original text');
          continue;
        }
        const found = substances.labelFor(name, text, info.need, legacyId);
        if (found.ambiguousWith !== undefined) scope.reason(`participant ${position}: label ${excerpt(text, 40)} matches several mapped records by folded name (${list(found.ambiguousWith)} besides the one used); the first was used`);
        ref = found.ref;
        originalText = text;
        scope.consume([...at, 'label'], label);
        if (remainder === '') tokens = undefined; // tokens only: nothing was taken out, the label itself is the name
      }
    }

    // ---- note and image
    let noteText: string | undefined;
    if (!isBlank(p.note)) {
      if (valid(RichTextSchema, p.note)) {
        noteText = p.note;
        scope.consume([...at, 'note'], p.note);
      } else {
        scope.keep([`participants[${j}].note`], p.note);
        scope.reason(`participant ${position}: the note cannot be stored; kept in legacy.unmapped`);
      }
    } else if (p.note !== undefined) scope.consume([...at, 'note'], p.note);
    await attachImage(ctx, j, p, labelText !== undefined && labelText.trim() !== '' ? labelText : asText(p.ref) ?? '');

    // ---- the role
    const subject = wholeLabel ? (labelText as string).trim() : idText(p.ref);
    const major = p.major === true;
    if (p.major !== undefined && p.major !== false && !(major && (info.group === 'product' || info.group === 'byproduct'))) scope.keep([`participants[${j}].major`], p.major);
    else if (p.major !== undefined) scope.consume([...at, 'major'], p.major);

    if (info.group === 'intermediate') {
      if (out.intermediates.length >= LIMITS.intermediates) {
        keepWhole(`more than ${LIMITS.intermediates} intermediates`);
        continue;
      }
      const entry: Intermediate = {
        id: ids.intermediateId(key, position) as Intermediate['id'],
        intermediateKind: 'other',
        ...(ref !== undefined && ref.kind !== 'reagent' ? { ref } : {}),
        ...(intermediateLabel === undefined ? {} : { label: intermediateLabel }),
        ...(noteText === undefined ? {} : { note: noteText }),
      };
      out.intermediates.push(entry);
      if (ref !== undefined && ref.kind !== 'reagent') out.substanceRefs.push(ref);
      continue;
    }

    if (info.group === 'product' || info.group === 'byproduct') {
      if (out.products.length >= LIMITS.products || ref === undefined || ref.kind === 'reagent') {
        keepWhole(ref === undefined || ref.kind === 'reagent' ? 'a product needs a species or class' : `more than ${LIMITS.products} products`);
        continue;
      }
      const role: Product['role'] = info.group === 'byproduct' ? 'byproduct' : major ? 'main' : 'coproduct';
      const product: Product = {
        id: ids.productId(key, position) as Product['id'],
        ref,
        role,
        ...(tokens?.phase === undefined ? {} : { phase: tokens.phase }),
        ...(originalText === undefined ? {} : { originalText }),
        ...(noteText === undefined ? {} : { note: noteText }),
      };
      out.products.push(product);
      out.substanceRefs.push(ref);
      if (role === 'coproduct') coproducts.push(excerpt(subject, 30));
      if (role !== 'main' && ref.kind === 'class') classProducts.push(excerpt(subject, 30));
      continue;
    }

    // reactant-like and workup participants
    const bucket = info.group === 'workup' ? out.workupIds : out.stage1Ids;
    if (out.participants.length >= LIMITS.participants || bucket.length >= LIMITS.participants) {
      keepWhole(`more than ${LIMITS.participants} participants`);
      continue;
    }
    if (info.group === 'workup') hasWorkup = true;
    const participant: Participant = {
      id: ids.participantId(key, position) as Participant['id'],
      ref: ref as SubstanceRef,
      role: info.role as ParticipantRole,
      ...(tokens?.phase === undefined ? {} : { phase: tokens.phase }),
      ...(tokens?.strength === undefined ? {} : { strength: tokens.strength }),
      ...(tokens?.dry === undefined ? {} : { dry: tokens.dry }),
      ...(tokens?.quantityQualifier === undefined ? {} : { quantity: { qualifier: tokens.quantityQualifier } }),
      ...(info.primary === true ? { isPrimarySubstrate: true } : {}),
      ...(originalText === undefined ? {} : { originalText }),
      ...(noteText === undefined ? {} : { note: noteText }),
    };
    out.participants.push(participant);
    bucket.push(participant.id);
    if (ref !== undefined && ref.kind !== 'reagent') out.substanceRefs.push(ref);
  }

  if (parameterOverflow.length > 0) scope.keep(['participantParameterOverflow'], parameterOverflow);
  if (unknownRoles.length > 0) scope.reason(`unrecognised participant role(s) ${list(unknownRoles)}; imported as reagent (v6's own default); the original is kept in legacy.unmapped`);
  if (tokenOnly.length > 0) scope.reason(`participant label(s) ${list(tokenOnly)} hold only tokens (aq., dry, …) and no substance name; the label itself was used as the name and no token was taken out`);
  if (coproducts.length > 0) scope.reason(`${coproducts.length} product(s) not marked major were imported as coproduct (${list(coproducts)}): coproduct or minor isomer? (v6's major meant "main arrow target")`);
  if (classProducts.length > 0) scope.reason(`coproduct/byproduct ${list(classProducts)} points at a class; a specific species may be intended`);
  if (dangling.length > 0) scope.reason(`participant(s) refer to compound id(s) ${list(dangling.map((d) => excerpt(d, 30)))} that the file does not have; placeholder species were created`);
  if (out.intermediates.length > 0) scope.reason(`${out.intermediates.length} intermediate(s) imported with kind "other"; check the kind`);
  const seen = new Map<string, number>();
  for (const participant of out.participants) {
    const identity = `${participant.role}\u0000${participant.ref.kind}:${participant.ref.id}`;
    seen.set(identity, (seen.get(identity) ?? 0) + 1);
  }
  const twice = [...seen].filter(([, count]) => count > 1).map(([identity]) => identity.split('\u0000')[1] as string);
  if (twice.length > 0) scope.reason(`the same substance appears more than once with the same role (${list(twice)}; RXN-021); kept, not merged`);
  return { ...out, hasWorkup };
}

const idText = (value: unknown): string => idKey(value);

async function attachImage(ctx: PartsContext, j: number, p: LegacyObject, noteSource: string): Promise<void> {
  const { scope } = ctx;
  const image = p.image;
  if (image === undefined) return;
  if (isBlank(image)) {
    scope.consume(['participants', j, 'image'], image);
    return;
  }
  if (typeof image !== 'string') {
    scope.keep([`participants[${j}].image`], image);
    scope.reason(`participant ${j + 1}: the image is ${typeof image}, not a data: URL; kept in legacy.unmapped`);
    return;
  }
  const result = await ctx.assets.attach(image, ctx.ref, noteSource.trim() === '' ? undefined : noteSource.trim(), ctx.legacyId);
  if (result.ok) scope.consume(['participants', j, 'image'], image);
  else {
    scope.keep([`participants[${j}].image`], image);
    scope.reason(`participant ${j + 1}: ${result.reason}; kept in legacy.unmapped`);
  }
}
