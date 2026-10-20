/**
 * The picture dialog (step 6.5b part 2, ADR-038 addendum P2, P3, P5). Add: a file chooser limited to the supported media types (the system
 * chooser on a phone, no `capture`), a preview (`<img>` from a blob URL), alt text REQUIRED, caption optional. Edit: the same dialog for the
 * alt text and caption. The picture is saved AT ONCE when the button is pressed (through the port, never through the editor's draft), and the
 * dialog says so. A refusal (a file over the cap, bytes that are not a picture, an unreadable file, a picture the browser cannot show, a
 * refused save) is words and nothing is saved. No file handling here: the port checks the file.
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog } from '@/ui/primitives';
import type { PictureView, PicturesPort, PreparedPicture } from './picture-contracts';
import styles from './picture.module.css';

export type PictureDialogMode = { readonly kind: 'add'; readonly mechanismId: string } | { readonly kind: 'edit'; readonly picture: PictureView };

/** The media types the asset pipeline accepts, as the file chooser's `accept`. */
export const PICTURE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
export const SAVED_NOW = "The picture is saved now; it does not wait for the mechanism's Save.";
export const ALT_REASON = 'Describe what the picture shows. It is read aloud, and shown if the picture cannot load.';

export interface PictureDialogProps {
  readonly mode: PictureDialogMode;
  readonly port: PicturesPort;
  readonly onClose: () => void;
}

export function PictureDialog(props: PictureDialogProps) {
  const { mode, port, onClose } = props;
  const adding = mode.kind === 'add';
  const [prepared, setPrepared] = useState<PreparedPicture | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ readonly width: number; readonly height: number } | null>(null);
  const [alt, setAlt] = useState(mode.kind === 'edit' ? mode.picture.altText : '');
  const [caption, setCaption] = useState(mode.kind === 'edit' ? mode.picture.caption : '');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef(0);

  // the preview's blob URL is made when a file passes the checks and revoked when it is replaced or the dialog goes
  useEffect(() => {
    if (prepared === null) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(prepared.preview);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);

  const choose = (file: File | undefined): void => {
    asked.current += 1;
    const mine = asked.current;
    setPrepared(null);
    setSize(null);
    setMessage(null);
    if (file === undefined) return;
    void port.prepare(file).then((result) => {
      if (mine !== asked.current) return; // a newer choice supersedes this one
      if (result.ok) setPrepared(result.picture);
      else setMessage(result.message);
    });
  };

  const submit = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    const result =
      mode.kind === 'add' && prepared !== null
        ? await port.add(mode.mechanismId, prepared, { altText: alt, caption, ...(size === null ? {} : size) })
        : mode.kind === 'edit'
          ? await port.edit(mode.picture.id, { altText: alt, caption })
          : { ok: false as const, message: 'Choose a picture file first.' };
    setBusy(false);
    if (result.ok) onClose();
    else setMessage(result.message);
  };

  const reason = busy ? 'Saving the picture...' : adding && prepared === null ? 'Choose a picture file first.' : alt.trim() === '' ? 'Write the alt text first.' : undefined;
  const footer = (
    <div className={styles.actions}>
      <Button variant="primary" {...(reason === undefined ? { onClick: () => void submit() } : { unavailable: reason })}>
        {adding ? 'Add picture' : 'Save picture'}
      </Button>
      <Button onClick={onClose}>Cancel</Button>
    </div>
  );
  return (
    <Dialog open onClose={onClose} title={adding ? 'Add picture' : 'Edit picture'} footer={footer} initialFocus={adding ? 'input[type="file"]' : '#picture-alt'}>
      <div className={styles.fields}>
        {adding ? (
          <>
            <label htmlFor="picture-file">Picture file</label>
            <input id="picture-file" type="file" accept={PICTURE_ACCEPT} onChange={(event) => choose(event.target.files?.[0])} />
            {previewUrl === null ? null : (
              <img
                className={styles.preview}
                src={previewUrl}
                alt="Preview of the chosen picture"
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalWidth > 0 && naturalHeight > 0) setSize({ width: naturalWidth, height: naturalHeight });
                }}
                onError={() => {
                  setPrepared(null);
                  setMessage('The browser could not read this picture.');
                }}
              />
            )}
          </>
        ) : null}
        <label htmlFor="picture-alt">Alt text (required)</label>
        <input id="picture-alt" type="text" value={alt} autoComplete="off" aria-describedby="picture-alt-help" onChange={(event) => setAlt(event.target.value)} />
        <p id="picture-alt-help" className={styles.note}>
          {ALT_REASON}
        </p>
        <label htmlFor="picture-caption">Caption (optional)</label>
        <textarea id="picture-caption" rows={3} value={caption} onChange={(event) => setCaption(event.target.value)} />
        <p className={styles.note}>{SAVED_NOW}</p>
        {message === null ? null : (
          <p role="alert" className={styles.problem}>
            {message}
          </p>
        )}
      </div>
    </Dialog>
  );
}
