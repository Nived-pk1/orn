/**
 * The mechanism editor's Pictures section (step 6.5b part 2, ADR-038 addendum P2-P6): since step 7.1a the section itself is the generic
 * `RecordPicturesSection`; this keeps the mechanism's own words ("Save the mechanism once before adding pictures.", "Removed from this
 * mechanism. ...") and its props, so the mechanism form is unchanged.
 */
import { notSavedWords, RecordPicturesSection, removedWords } from './record-pictures';
import type { RecordRef } from '@/core/schema';
import type { PicturesPort } from './picture-contracts';

export const NOT_SAVED_YET = notSavedWords('mechanism');
export const REMOVED_WORDS = removedWords('mechanism');

export interface MechanismPicturesProps {
  readonly mechanismId: string;
  readonly port: PicturesPort;
  /** Whether the mechanism is saved (a picture's asset record is attached to a record that must exist). */
  readonly saved: boolean;
  /** Why editing is unavailable (a read-only tab); absent: it is available. */
  readonly unavailable?: string | undefined;
  readonly phone?: boolean | undefined;
}

export function MechanismPicturesSection(props: MechanismPicturesProps) {
  const { mechanismId, ...rest } = props;
  return <RecordPicturesSection target={{ kind: 'mechanism', id: mechanismId } as RecordRef} {...rest} />;
}
