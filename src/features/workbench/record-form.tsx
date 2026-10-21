/**
 * The form of the record being edited: the species form, the class form, the reagent form, or (a kind without a full form) the Names section alone. One
 * place chooses, so the host knows no kind (step 6.2b).
 */
import type { RecordKind, RecordRef } from '@/core/schema';
import type { ClassSuggestion } from './check-contracts';
import { CaveatForm } from './caveat-form';
import { ClassForm } from './class-form';
import { ConceptForm } from './concept-form';
import { NamedReactionForm } from './named-reaction-form';
import { NamesSection } from './names-section';
import { TransformationForm } from './transformation-form';
import { MechanismForm } from './mechanism-form';
import type { MechanismLinksPort } from './mechanism-contracts';
import { ReactionForm } from './reaction-form';
import { RelationshipForm } from './relationship-form';
import { RelationshipsList } from './relationships-list';
import { SectionFrame } from './section-frame';
import { ReagentForm } from './reagent-form';
import type { PicturesPort } from './picture-contracts';
import type { RecordPickerPort } from './record-picker-contracts';
import type { SectionProps } from './section-props';
import { SourceForm } from './source-form';
import { SpeciesForm } from './species-form';
import type { StructurePort } from './structure-contracts';

export interface RecordFormProps extends SectionProps {
  readonly kind: RecordKind;
  readonly structure: StructurePort | undefined;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly picker?: RecordPickerPort;
  readonly newId: (prefix: string) => string;
  readonly suggestions: readonly ClassSuggestion[];
  readonly links?: MechanismLinksPort | undefined;
  readonly pictures?: PicturesPort | undefined;
  readonly saved?: boolean | undefined;
  /** Closes the editor (the draft is kept) and shows the record in the inspector: "Used by" and "Relationships" lists. */
  readonly openRecord?: ((ref: RecordRef) => void) | undefined;
}

function KindForm(props: RecordFormProps) {
  const { kind, suggestions, newId, links, pictures, saved, openRecord, ...rest } = props;
  if (kind === 'relationship') return <RelationshipForm {...rest} />;
  if (kind === 'caveat') return <CaveatForm {...rest} />;
  if (kind === 'concept') return <ConceptForm {...rest} />;
  if (kind === 'named_reaction') return <NamedReactionForm {...rest} openRecord={openRecord} />;
  if (kind === 'transformation') return <TransformationForm {...rest} openRecord={openRecord} />;
  if (kind === 'species') return <SpeciesForm {...rest} suggestions={suggestions} />;
  if (kind === 'class') return <ClassForm {...rest} />;
  if (kind === 'reference') return <SourceForm draft={rest.draft} onEdit={rest.onEdit} picker={rest.picker} {...(rest.invalid === undefined ? {} : { invalid: rest.invalid })} {...(rest.unavailable === undefined ? {} : { unavailable: rest.unavailable })} {...(rest.phone === undefined ? {} : { phone: rest.phone })} />;
  if (kind === 'reaction') return <ReactionForm draft={rest.draft} onEdit={rest.onEdit} newId={newId} links={links} {...(rest.invalid === undefined ? {} : { invalid: rest.invalid })} {...(rest.unavailable === undefined ? {} : { unavailable: rest.unavailable })} {...(rest.phone === undefined ? {} : { phone: rest.phone })} {...(rest.picker === undefined ? {} : { picker: rest.picker })} />;
  if (kind === 'mechanism') return <MechanismForm draft={rest.draft} onEdit={rest.onEdit} newId={newId} links={links} pictures={pictures} saved={saved} picker={rest.picker} structure={rest.structure} timers={rest.timers} {...(rest.invalid === undefined ? {} : { invalid: rest.invalid })} {...(rest.unavailable === undefined ? {} : { unavailable: rest.unavailable })} {...(rest.phone === undefined ? {} : { phone: rest.phone })} />;
  if (kind === 'reagent') return <ReagentForm draft={rest.draft} onEdit={rest.onEdit} newId={newId} {...(rest.invalid === undefined ? {} : { invalid: rest.invalid })} {...(rest.unavailable === undefined ? {} : { unavailable: rest.unavailable })} {...(rest.phone === undefined ? {} : { phone: rest.phone })} {...(rest.picker === undefined ? {} : { picker: rest.picker })} />;
  const { draft, onEdit, invalid, unavailable, phone } = props;
  return <NamesSection draft={draft} onEdit={onEdit} phone={phone} {...(invalid === undefined ? {} : { invalid })} {...(unavailable === undefined ? {} : { unavailable })} />;
}

/** Kinds that can be an end of a relationship: their editor ends with the read-only "Relationships" list (step 6.6b part 4). */
const NO_RELATIONSHIPS: readonly RecordKind[] = ['relationship', 'reference'];

export function RecordForm(props: RecordFormProps) {
  const id = (props.draft as { id?: unknown } | null)?.id;
  const listed = !NO_RELATIONSHIPS.includes(props.kind);
  return (
    <>
      <KindForm {...props} />
      {!listed ? null : (
        <SectionFrame id="relationships" title="Relationships" initiallyOpen={false}>
          <RelationshipsList kind={props.kind} id={typeof id === 'string' ? id : ''} picker={props.picker} openRecord={props.openRecord} />
        </SectionFrame>
      )}
    </>
  );
}
