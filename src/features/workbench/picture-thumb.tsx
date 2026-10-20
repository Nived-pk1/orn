/**
 * One stored picture, small (step 6.5b part 2, P6): an `<img>` whose blob URL is made through the pictures port when it appears and revoked
 * when it goes (never by this view's own bytes handling). Bytes missing in this browser are said in words, never a broken image icon.
 */
import { useEffect, useState } from 'react';
import type { PicturesPort, PictureView } from './picture-contracts';
import styles from './picture.module.css';

type Shown = { readonly state: 'loading' } | { readonly state: 'ready'; readonly url: string } | { readonly state: 'none'; readonly message: string };

export function PictureThumb(props: { readonly port: PicturesPort; readonly picture: PictureView }) {
  const { port, picture } = props;
  const [shown, setShown] = useState<Shown>({ state: 'loading' });
  useEffect(() => {
    let cancelled = false;
    let made: string | undefined;
    setShown({ state: 'loading' });
    void port.image(picture.id, picture.mediaType).then((result) => {
      if (!result.ok) {
        if (!cancelled) setShown({ state: 'none', message: result.message });
        return;
      }
      if (cancelled) {
        port.revoke(result.url);
        return;
      }
      made = result.url;
      setShown({ state: 'ready', url: result.url });
    });
    return () => {
      cancelled = true;
      if (made !== undefined) port.revoke(made);
    };
  }, [port, picture.id, picture.mediaType]);
  if (shown.state === 'loading') return <span className={styles.note}>Loading the picture.</span>;
  if (shown.state === 'none') return <span className={styles.note}>{shown.message}</span>;
  return <img className={styles.thumb} src={shown.url} alt={picture.altText === '' ? 'Picture (no alt text is written)' : picture.altText} />;
}
