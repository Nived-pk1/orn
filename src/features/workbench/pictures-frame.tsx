/**
 * The Pictures section of a form (step 7.1a, ADR-038 addendum Q4): one collapsible section, placed by each form directly after the section
 * that holds the record's summary or description (after Identity when it has neither). A phone starts it closed, like the other long
 * sections. Nothing is drawn when the editor has no pictures port.
 */
import type { PictureKind } from '@/core/editing';
import type { RecordRef } from '@/core/schema';
import { RecordPicturesSection } from './record-pictures';
import { SectionFrame } from './section-frame';
import type { SectionProps } from './section-props';

export function PicturesFrame(props: { readonly kind: PictureKind; readonly form: SectionProps }) {
  const { form } = props;
  const slot = form.recordPictures;
  if (slot === undefined) return null;
  const id = (form.draft as { id?: unknown } | null)?.id;
  return (
    <SectionFrame id="pictures" title="Pictures" initiallyOpen={form.phone !== true}>
      <RecordPicturesSection target={{ kind: props.kind, id: typeof id === 'string' ? id : '' } as RecordRef} port={slot.port} saved={slot.saved} unavailable={form.unavailable} phone={form.phone} />
    </SectionFrame>
  );
}
