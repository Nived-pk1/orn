/**
 * The mechanism editor's Pictures section (step 6.5b part 2, ADR-038 addendum P2-P6): the mechanism's own pictures small, each with its alt
 * text, caption, Edit and Remove; "Add picture" opens the dialog. Pictures are saved AT ONCE through the pictures port and are not part of
 * the draft: Remove DETACHES (the asset stays in the data, deleting is step 6.8) and asks first. A mechanism never saved cannot take a
 * picture ("Save the mechanism once before adding pictures."). Text only; the port decides.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/ui/primitives';
import type { PicturesPort, PictureView } from './picture-contracts';
import { PictureDialog, type PictureDialogMode } from './picture-dialog';
import { PictureThumb } from './picture-thumb';
import styles from './editor.module.css';
import own from './picture.module.css';

export const NOT_SAVED_YET = 'Save the mechanism once before adding pictures.';
export const REMOVED_WORDS = 'Removed from this mechanism. The picture stays in your data until deleting arrives (step 6.8).';

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
  const { mechanismId, port } = props;
  const [pictures, setPictures] = useState<readonly PictureView[]>(() => port.list(mechanismId));
  const [dialog, setDialog] = useState<PictureDialogMode | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ readonly kind: 'status' | 'alert'; readonly text: string } | null>(null);
  useEffect(() => {
    const refresh = (): void => setPictures(port.list(mechanismId));
    refresh();
    return port.subscribe(refresh);
  }, [port, mechanismId]);

  const locked = props.unavailable;
  const off = (action: () => void) => (locked !== undefined ? { unavailable: locked } : { onClick: action });
  return (
    <div className={styles.field}>
      {pictures.length === 0 ? <p className={styles.hint}>No pictures yet.</p> : null}
      <ul className={styles.list} aria-label="Pictures">
        {pictures.map((picture, index) => {
          const n = index + 1;
          return (
            <li key={picture.id} className={styles.panel}>
              <div role="group" aria-label={`Picture ${n}`} className={`${own.row} ${props.phone === true ? own.rowPhone : ''}`}>
                <div className={own.thumbBox}>
                  <PictureThumb port={port} picture={picture} />
                </div>
                <div className={own.text}>
                  <p>{picture.altText === '' ? 'No alt text is written.' : picture.altText}</p>
                  {picture.caption === '' ? null : <p className={styles.hint}>{picture.caption}</p>}
                </div>
                <div className={own.actions}>
                  <Button aria-label={`Edit picture ${n}`} {...off(() => setDialog({ kind: 'edit', picture }))}>
                    Edit
                  </Button>
                  <Button aria-label={`Remove picture ${n} from this mechanism`} {...off(() => setAsking(picture.id))}>
                    Remove
                  </Button>
                </div>
              </div>
              {asking === picture.id ? (
                <div className={styles.confirm} role="group" aria-label={`Remove picture ${n} from this mechanism?`}>
                  <span>The picture is detached from this mechanism. It stays in your data. This can be undone.</span>
                  <Button
                    variant="primary"
                    onClick={() => {
                      const result = port.detach(mechanismId, picture.id);
                      setAsking(null);
                      setNotice(result.ok ? { kind: 'status', text: REMOVED_WORDS } : { kind: 'alert', text: result.message });
                    }}
                  >
                    Remove from this mechanism
                  </Button>
                  <Button onClick={() => setAsking(null)}>Cancel</Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {notice === null ? null : (
        <p role={notice.kind} className={styles.hint}>
          {notice.text}
        </p>
      )}
      <Button {...(locked !== undefined ? { unavailable: locked } : props.saved ? { onClick: () => setDialog({ kind: 'add', mechanismId }) } : { unavailable: NOT_SAVED_YET })}>Add picture</Button>
      {props.saved ? null : <p className={styles.hint}>{NOT_SAVED_YET}</p>}
      {dialog === null ? null : <PictureDialog mode={dialog} port={port} onClose={() => setDialog(null)} />}
    </div>
  );
}
