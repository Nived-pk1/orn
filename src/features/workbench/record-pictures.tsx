/**
 * The Pictures section of an editor (step 6.5b part 2, ADR-038 addendum P2-P6; generic in the kind word for every PICTURE_KINDS record since
 * step 7.1a, Q3 and Q4): the record's own pictures small, each with its alt text, caption, Edit and Remove; "Add picture" opens the dialog.
 * Pictures are saved AT ONCE through the pictures port and are not part of the draft: Remove DETACHES (the asset stays in the data, deleting
 * is step 6.8) and asks first. A record never saved cannot take a picture ("Save the <kind word> once before adding pictures."). Text only;
 * the port decides.
 */
import { useEffect, useState } from 'react';
import { kindWordsOf } from '@/core/editing';
import type { RecordRef } from '@/core/schema';
import { Button } from '@/ui/primitives';
import type { PicturesPort, PictureView } from './picture-contracts';
import { PictureDialog, type PictureDialogMode } from './picture-dialog';
import { PictureThumb } from './picture-thumb';
import { useRemove } from './remove-context';
import styles from './editor.module.css';
import own from './picture.module.css';

export const notSavedWords = (kind: string): string => `Save the ${kindWordsOf(kind)} once before adding pictures.`;
export const removedWords = (kind: string): string => `Removed from this ${kindWordsOf(kind)}. The picture stays in your data until you delete it.`;

export interface RecordPicturesProps {
  readonly target: RecordRef;
  readonly port: PicturesPort;
  /** Whether the record is saved (a picture's asset record is attached to a record that must exist). */
  readonly saved: boolean;
  /** Why editing is unavailable (a read-only tab); absent: it is available. */
  readonly unavailable?: string | undefined;
  readonly phone?: boolean | undefined;
}

export function RecordPicturesSection(props: RecordPicturesProps) {
  const { target, port } = props;
  const word = kindWordsOf(target.kind);
  const [pictures, setPictures] = useState<readonly PictureView[]>(() => port.list(target));
  const [dialog, setDialog] = useState<PictureDialogMode | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const remove = useRemove();
  const [notice, setNotice] = useState<{ readonly kind: 'status' | 'alert'; readonly text: string } | null>(null);
  useEffect(() => {
    const refresh = (): void => setPictures(port.list(target));
    refresh();
    return port.subscribe(refresh);
  }, [port, target.kind, target.id]);

  const locked = props.unavailable;
  const off = (action: () => void) => (locked !== undefined ? { unavailable: locked } : { onClick: action });
  const notSaved = notSavedWords(target.kind);
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
                  <Button aria-label={`Edit picture ${n}`} {...off(() => setDialog({ kind: 'edit', picture, target }))}>
                    Edit
                  </Button>
                  <Button aria-label={`Remove picture ${n} from this ${word}`} {...off(() => setAsking(picture.id))}>
                    Remove
                  </Button>
                  {remove === undefined ? null : (
                    <Button aria-label={`Delete picture ${n}...`} {...off(() => remove({ kind: 'asset', id: picture.id } as RecordRef))}>
                      Delete...
                    </Button>
                  )}
                </div>
              </div>
              {asking === picture.id ? (
                <div className={styles.confirm} role="group" aria-label={`Remove picture ${n} from this ${word}?`}>
                  <span>{`The picture is detached from this ${word}. It stays in your data. This can be undone.`}</span>
                  <Button
                    variant="primary"
                    onClick={() => {
                      const result = port.detach(target, picture.id);
                      setAsking(null);
                      setNotice(result.ok ? { kind: 'status', text: removedWords(target.kind) } : { kind: 'alert', text: result.message });
                    }}
                  >
                    {`Remove from this ${word}`}
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
      <Button {...(locked !== undefined ? { unavailable: locked } : props.saved ? { onClick: () => setDialog({ kind: 'add', target }) } : { unavailable: notSaved })}>Add picture</Button>
      {props.saved ? null : <p className={styles.hint}>{notSaved}</p>}
      {dialog === null ? null : <PictureDialog mode={dialog} port={port} onClose={() => setDialog(null)} />}
    </div>
  );
}
