/** The star in the record's header (step 8.4g Part B, G2): "Star for revision", pressed when the record is starred. The window owns the list (a port). */
import { useSyncExternalStore } from 'react';
import { IconButton } from '@/ui/primitives';
import type { RecordRef } from '@/core/schema';
import type { StarsPort } from './contracts';

export function StarButton(props: { readonly stars: StarsPort; readonly refOf: RecordRef }) {
  const { stars, refOf } = props;
  const starred = useSyncExternalStore(stars.subscribe, () => stars.isStarred(refOf));
  return <IconButton label="Star for revision" icon={starred ? 'star-filled' : 'star'} aria-pressed={starred} tip={starred ? 'Starred: press to remove the star' : 'Star for revision (S)'} onClick={() => stars.toggle(refOf)} />;
}
