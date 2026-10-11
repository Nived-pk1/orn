/**
 * An asset (an attached image) in the inspector (step 5.6b, item i; SECURITY §2, ADV-033 asset part). L2: the image and what it is
 * attached to; L3: its metadata; L4: caption and sources. The image is shown ONLY through an `<img>` whose address is a blob URL made
 * and revoked through the ports: an SVG asset is never inlined (an `<img>` runs no script). A missing blob is said in words
 * (AST-002); nothing is guessed.
 */
import { useEffect, useState } from 'react';
import type { Asset } from '@/core/schema';
import { useInspectorEnv } from './env';
import { FactList, Facts, LevelSection } from './levels';
import { RecordList } from './record-list';
import { NoteFact, TextFact, CitationsAndTags, words } from './view-parts';
import styles from './inspector.module.css';

type Shown = { readonly state: 'loading' } | { readonly state: 'ready'; readonly url: string } | { readonly state: 'none'; readonly why: string };

export function AssetImageView(props: { readonly asset: Asset }) {
  const { asset } = props;
  const { ports } = useInspectorEnv();
  const [shown, setShown] = useState<Shown>({ state: 'loading' });
  useEffect(() => {
    const assets = ports.assets;
    if (assets === undefined) {
      setShown({ state: 'none', why: 'No image is shown here: this window has no way to read image bytes.' });
      return undefined;
    }
    let cancelled = false;
    let made: string | undefined;
    setShown({ state: 'loading' });
    void assets.open(asset.id, asset.mediaType).then((result) => {
      if (!result.ok) {
        if (!cancelled) setShown({ state: 'none', why: result.message });
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
      if (made !== undefined) assets.revoke(made);
    };
  }, [ports, asset.id, asset.mediaType, asset.sha256]);
  if (shown.state === 'loading') return <p className={styles.muted} role="status">Loading the image.</p>;
  if (shown.state === 'none') return <p role="status" className={styles.missing}>{shown.why}</p>;
  return <img className={styles.assetImage} src={shown.url} alt={asset.altText ?? asset.filename ?? 'Attached image (no alt text is written)'} />;
}

export function AssetLevels(props: { readonly record: Asset }) {
  const { record } = props;
  return (
    <>
      <LevelSection level={2} title="The image and what it is attached to">
        <AssetImageView asset={record} />
        <FactList label="Asset">
          <Facts label="Role">{words(record.assetRole)}</Facts>
          <TextFact label="Alt text" value={record.altText ?? 'none written'} />
          <NoteFact label="Caption" source={record.caption} />
        </FactList>
        <h4 className={styles.subheading}>Attached to ({record.attachedTo.length})</h4>
        {record.attachedTo.length === 0 ? (
          <p className={styles.muted}>It is not attached to any record.</p>
        ) : (
          <RecordList
            label="Attached to"
            items={record.attachedTo.map((a) => ({ kind: a.ref.kind, id: a.ref.id, note: a.note }))}
            suffix={(item) => (item.note === undefined ? null : <span className={styles.muted}> ({item.note})</span>)}
          />
        )}
      </LevelSection>
      <LevelSection level={3} title="Metadata">
        <FactList label="Asset metadata">
          <Facts label="Media type">{record.mediaType}</Facts>
          <Facts label="Size">{record.byteSize} bytes</Facts>
          <TextFact label="Width" value={record.width === undefined ? undefined : `${record.width} px`} />
          <TextFact label="Height" value={record.height === undefined ? undefined : `${record.height} px`} />
          <TextFact label="File name" value={record.filename} />
          <Facts label="SHA-256">{record.sha256}</Facts>
        </FactList>
      </LevelSection>
      <LevelSection level={4} title="Sources and links">
        <FactList label="Asset sources">
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
      </LevelSection>
    </>
  );
}
