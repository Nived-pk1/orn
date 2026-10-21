/**
 * The form of the record being edited: the species form, the class form, the reagent form, or (a kind without a full form) the Names section alone. One
 * place chooses, so the host knows no kind (step 6.2b).
 */
import type { RecordKind } from '@/core/schema';
import type { ClassSuggestion } from './check-contracts';
import { ClassForm } from './class-form';
import { NamesSection } from './names-section';
import { MechanismForm } from './mechanism-form';
import type { MechanismLinksPort } from './mechanism-contracts';
import { ReactionForm } from './reaction-form';
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
}

export function RecordForm(props: RecordFormProps) {
  const { kind, suggestions, newId, links, pictures, saved, ...rest } = props;
  if (kind === 'species') return <SpeciesForm {...rest} suggestions={suggestions} />;
  if (kind === 'class') return <ClassForm {...rest} />;
  if (kind === 'reference') return <SourceForm draft={rest.draft} onEdit={rest.onEdit} picker={rest.picker} {...(rest.invalid === undefined ? {} : { invalid: rest.invalid })} {...(rest.unavailable === undefined ? {} : { unavailable: rest.unavailable })} {...(rest.phone === undefined ? {} : { phone: rest.phone })} />;
  if (kind === 'reaction') return <ReactionForm draft={rest.draft} onEdit={rest.onEdit} newId={newId} links={links} {...(rest.invalid === undefined ? {} : { invalid: rest.invalid })} {...(rest.unavailable === undefined ? {} : { unavailable: rest.unavailable })} {...(rest.phone === undefined ? {} : { phone: rest.phone })} {...(rest.picker === undefined ? {} : { picker: rest.picker })} />;
  if (kind === 'mechanism') return <MechanismForm draft={rest.draft} onEdit={rest.onEdit} newId={newId} links={links} pictures={pictures} saved={saved} picker={rest.picker} structure={rest.structure} timers={rest.timers} {...(rest.invalid === undefined ? {} : { invalid: rest.invalid })} {...(rest.unavailable === undefined ? {} : { unavailable: rest.unavailable })} {...(rest.phone === undefined ? {} : { phone: rest.phone })} />;
  if (kind === 'reagent') return <ReagentForm draft={rest.draft} onEdit={rest.onEdit} newId={newId} {...(rest.invalid === undefined ? {} : { invalid: rest.invalid })} {...(rest.unavailable === undefined ? {} : { unavailable: rest.unavailable })} {...(rest.phone === undefined ? {} : { phone: rest.phone })} {...(rest.picker === undefined ? {} : { picker: rest.picker })} />;
  const { draft, onEdit, invalid, unavailable, phone } = props;
  return <NamesSection draft={draft} onEdit={onEdit} phone={phone} {...(invalid === undefined ? {} : { invalid })} {...(unavailable === undefined ? {} : { unavailable })} />;
}
