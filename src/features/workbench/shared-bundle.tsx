/**
 * The one section every editor shows for the shared record fields (step 6.6a, decision C1): the texts the kind has (Notes, Study notes and
 * the kind's own long texts), Concepts where the schema has `conceptIds`, Tags and Citations. The editors differ only in which texts they list.
 */
import type { MechanismLinksPort } from './mechanism-contracts';
import type { RecordPickerPort } from './record-picker-contracts';
import type { SectionProps } from './section-props';
import { CitationsSection, ConceptsSection, NotesSection, TagsSection } from './shared-sections';

export interface SharedFieldsProps extends SectionProps {
  /** The long texts, in order ("studyNotes", "notes", "description", ...). */
  readonly notes: readonly string[];
  /** Whether the kind has `conceptIds` (reaction, mechanism); species, classes and reagents do not. */
  readonly concepts?: boolean;
  readonly picker?: RecordPickerPort | undefined;
  readonly links?: MechanismLinksPort | undefined;
}

export function SharedFieldsSection(props: SharedFieldsProps) {
  const { notes, concepts, picker, links, ...section } = props;
  return (
    <div>
      <NotesSection {...section} fields={notes} links={links} />
      {concepts === true ? <ConceptsSection {...section} picker={picker} /> : null}
      <TagsSection {...section} />
      <CitationsSection {...section} picker={picker} />
    </div>
  );
}
