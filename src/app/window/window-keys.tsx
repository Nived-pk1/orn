/** The window's keys that are not needed at boot (step 8.4g Part B, size trim), one lazy chunk: Starred and Recent (the key S, the rules) and the shortcuts sheet (the key "?"). */
import type { ActiveExamStore } from '@/ui/state';
import { useApp } from './context';
import { LazyTour } from './lazy-tour';
import MyRecordsKeys from './my-records-keys';
import { ShortcutsHost } from './shortcuts-host';

/** The first-run tour is here too (Study only): this chunk holds its "is it time?" check, and the tour itself is a chunk fetched only when it is. */
export default function WindowKeys(props: { readonly studio: boolean; readonly exam: ActiveExamStore; readonly hasData: boolean }) {
  const { services } = useApp();
  return (
    <>
      <MyRecordsKeys />
      <ShortcutsHost studio={props.studio} />
      {props.studio ? null : <LazyTour exam={props.exam} hasData={props.hasData} services={services} />}
    </>
  );
}
