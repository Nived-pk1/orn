/** The rest of the notices, in a dialog (step 8.4a, Part C): "+n more" opens it. A lazy chunk: it loads when first asked for. */
import { Banner, Dialog } from '@/ui/primitives';
import type { BandNotice } from './notice-band-view';
import styles from './notice-band.module.css';

export function NoticeList(props: { readonly notices: readonly BandNotice[]; readonly onClose: () => void }) {
  return (
    <Dialog open onClose={props.onClose} title="Notices" dismissOnBackdrop>
      {props.notices.length === 0 ? <p>Nothing needs your attention.</p> : null}
      <ul className={styles.list}>
        {props.notices.map((notice) => (
          <li key={notice.id}>
            <Banner kind={notice.kind} actions={notice.actions}>
              {notice.text}
            </Banner>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
