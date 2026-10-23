/**
 * The user's own pictures of a mechanism, FIRST in its view (step 6.5b part 3, ADR-038 addendum P6; SECURITY §2). Each is an `<img>` whose
 * blob URL is made and revoked through the inspector's assets port (never by this view); an SVG is never inlined (an `<img>` runs no
 * script). The alt text and the caption come from the record; the picture fits the panel and is never enlarged past its natural size.
 * "Open full size" shows it in a modal dialog as large as the screen allows. Bytes not in this browser are said in words with the alt
 * text, never a broken image icon. Nothing is drawn as arrows (Phase 8).
 */
import { useEffect, useState } from 'react';
import type { Asset } from '@/core/schema';
import { revokeWhenUnused } from '@/ui/hooks';
import { Button, Dialog } from '@/ui/primitives';
import { FullPicture } from './full-picture';
import { useInspectorEnv } from './env';
import { picturesOfMechanism } from './model/pictures';
import { RichText } from './rich-text';
import styles from './inspector.module.css';

type Shown = { readonly state: 'loading' } | { readonly state: 'ready'; readonly url: string } | { readonly state: 'none'; readonly why: string };

export const PICTURE_MISSING = 'Picture missing: its file is not stored in this browser';
const NO_ALT = 'Picture (no alt text is written)';

function PictureFigure(props: { readonly asset: Asset }) {
  const { asset } = props;
  const { ports } = useInspectorEnv();
  const [shown, setShown] = useState<Shown>({ state: 'loading' });
  const [big, setBig] = useState(false);
  const alt = asset.altText ?? asset.filename ?? NO_ALT;
  useEffect(() => {
    const assets = ports.assets;
    if (assets === undefined) {
      setShown({ state: 'none', why: 'No picture is shown here: this window has no way to read image bytes.' });
      return undefined;
    }
    let cancelled = false;
    let made: string | undefined;
    setShown({ state: 'loading' });
    void assets.open(asset.id, asset.mediaType).then((result) => {
      if (!result.ok) {
        if (!cancelled) setShown({ state: 'none', why: result.reason === 'missing' ? PICTURE_MISSING : result.message });
        return;
      }
      if (cancelled) {
        assets.revoke(result.url);
        return;
      }
      made = result.url;
      setShown({ state: 'ready', url: result.url });
    });
    return () => {
      cancelled = true;
      if (made !== undefined) revokeWhenUnused(assets.revoke, made);
    };
  }, [ports, asset.id, asset.mediaType, asset.sha256]);

  return (
    <figure className={styles.pictureFigure}>
      {shown.state === 'loading' ? <p className={styles.muted} role="status">Loading the picture.</p> : null}
      {shown.state === 'none' ? (
        <>
          <p className={styles.missing} role="status">
            {shown.why}
          </p>
          <p>{alt}</p>
        </>
      ) : null}
      {shown.state === 'ready' ? (
        <>
          <img className={styles.mechanismPicture} src={shown.url} alt={alt} />
          <Button onClick={() => setBig(true)}>Open full size</Button>
          {big ? (
            <Dialog open onClose={() => setBig(false)} title={alt} size="screen">
              <FullPicture url={shown.url} alt={alt} />
            </Dialog>
          ) : null}
        </>
      ) : null}
      {asset.caption === undefined || asset.caption === '' ? null : (
        <figcaption>
          <RichText source={asset.caption} />
        </figcaption>
      )}
    </figure>
  );
}

/** The mechanism's pictures, oldest first; nothing at all when it has none. */
export function MechanismPictures(props: { readonly mechanismId: string }) {
  const { state } = useInspectorEnv();
  const pictures = picturesOfMechanism(state, props.mechanismId);
  if (pictures.length === 0) return null;
  return (
    <section className={styles.pictures} aria-label="Pictures of this mechanism">
      {pictures.map((asset) => (
        <PictureFigure key={asset.id} asset={asset} />
      ))}
    </section>
  );
}
