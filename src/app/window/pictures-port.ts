/**
 * The mechanism editor's pictures port (step 6.5b, ADR-038 addendum P1-P5). A picture is an `asset` record attached to a mechanism
 * (`attachedTo[].ref`; the mechanism record is never changed) and its bytes. It is saved AT ONCE, outside the draft: the bytes are staged
 * for the write queue (`AssetHost.stage`), ONE `record.create` is dispatched through the store's gate (L1-L3), and the queue writes the
 * record and the bytes in one transaction. A chosen file is checked first (the size cap, the magic bytes against the supported types, the
 * SHA-256 the way the import pipeline computes it); every refusal is words and saves nothing. No chemistry; every failure is a value.
 */
import type { StoreHandle } from '@/core/commands';
import type { CommitResult } from '@/core/commands';
import { ASSET_MEDIA_TYPES, type Asset, type CanonicalState } from '@/core/schema';
import { IMPORT_LIMITS } from '@/io';
import { magicBytesMatch } from '@/io/asset-magic';
import { sha256Hex } from '@/io/hash';
import type { AssetHost } from '@/app/services';
import type { PictureFields, PictureFile, PictureResult, PicturesPort, PictureView } from '@/features/workbench';

export interface PicturesPortDeps {
  readonly store: Pick<StoreHandle, 'getState' | 'subscribe' | 'dispatch' | 'isReadOnly'>;
  readonly assets: AssetHost;
  /** The stored bytes of an asset; absent: this tab keeps nothing on disk. */
  readonly getBlob: ((assetId: string) => Promise<Blob | undefined>) | undefined;
}

const MB = 1024 * 1024;
const ALT_REQUIRED = 'Write the alt text: it describes what the picture shows.';
const NOT_SAVED = 'Save the mechanism once before adding pictures.';

const megabytes = (bytes: number): string => `${(bytes / MB).toFixed(1)} MB`;

/** The base name only: no path, no control characters, at most 200 characters; undefined when nothing is left. */
function baseName(name: string): string | undefined {
  const last = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex -- control characters are what is removed
  const clean = last.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').trim().slice(0, 200).trim();
  return clean === '' ? undefined : clean;
}

const optional = (text: string): string | undefined => (text.trim() === '' ? undefined : text);

function failure(result: Extract<CommitResult, { ok: false }>): PictureResult {
  const { error } = result;
  if (error.code === 'READ_ONLY') return { ok: false, message: 'This tab cannot save changes: it is read-only.' };
  const first = error.findings?.find((finding) => finding.severity === 'error');
  return { ok: false, message: `The picture was not saved (${error.code}): ${first?.message ?? error.message}` };
}

export function createPicturesPort(deps: PicturesPortDeps): PicturesPort {
  const { store, assets, getBlob } = deps;
  const state = (): CanonicalState => store.getState();
  const mechanismName = (id: string): string => state().records.mechanism[id as never]?.name ?? 'the mechanism';
  const assetOf = (id: string): Asset | undefined => state().records.asset[id as never];

  const attachedTo = (asset: Asset): string => {
    const ref = asset.attachedTo.find((one) => one.ref.kind === 'mechanism');
    return ref === undefined ? 'a mechanism' : mechanismName(ref.ref.id);
  };

  return {
    list(mechanismId) {
      const found = (Object.values(state().records.asset) as Asset[]).filter((asset) => asset.attachedTo.some((one) => one.ref.kind === 'mechanism' && one.ref.id === mechanismId));
      found.sort((a, b) => a.provenance.createdAt.localeCompare(b.provenance.createdAt) || a.id.localeCompare(b.id));
      return found.map((asset): PictureView => ({ id: asset.id, mediaType: asset.mediaType, altText: asset.altText ?? '', caption: asset.caption ?? '', filename: asset.filename ?? '' }));
    },
    subscribe: (listener) => store.subscribe(() => listener()),

    async prepare(file: PictureFile) {
      if (file.size > IMPORT_LIMITS.maxAssetBytes) return { ok: false, message: `This file is ${megabytes(file.size)}. The largest picture the app keeps is ${IMPORT_LIMITS.maxAssetBytes / MB} MB.` };
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch {
        return { ok: false, message: 'This file could not be read.' };
      }
      if (bytes.length === 0) return { ok: false, message: 'This file is empty.' };
      if (bytes.length > IMPORT_LIMITS.maxAssetBytes) return { ok: false, message: `This file is ${megabytes(bytes.length)}. The largest picture the app keeps is ${IMPORT_LIMITS.maxAssetBytes / MB} MB.` };
      // the declared type of the file is not trusted: the bytes decide
      const mediaType = ASSET_MEDIA_TYPES.find((type) => magicBytesMatch(bytes, type));
      if (mediaType === undefined) return { ok: false, message: 'This file is not a picture the app can show: PNG, JPEG, WebP, GIF or SVG.' };
      return { ok: true, picture: { mediaType, byteSize: bytes.length, sha256: await sha256Hex(bytes), bytes, filename: baseName(file.name), preview: new Blob([bytes as BlobPart], { type: mediaType }) } };
    },

    async add(mechanismId, picture, fields: PictureFields) {
      if (fields.altText.trim() === '') return { ok: false, message: ALT_REQUIRED };
      if (store.isReadOnly()) return { ok: false, message: 'This tab cannot save changes: it is read-only.' };
      const mechanism = state().records.mechanism[mechanismId as never];
      if (mechanism === undefined) return { ok: false, message: NOT_SAVED };
      const now = assets.now();
      const id = assets.newId('ast');
      const caption = optional(fields.caption);
      const record = {
        id,
        kind: 'asset',
        mediaType: picture.mediaType,
        byteSize: picture.byteSize,
        sha256: picture.sha256,
        ...(fields.width === undefined || fields.width < 1 ? {} : { width: fields.width }),
        ...(fields.height === undefined || fields.height < 1 ? {} : { height: fields.height }),
        ...(picture.filename === undefined ? {} : { filename: picture.filename }),
        altText: fields.altText,
        assetRole: 'mechanism_image',
        attachedTo: [{ ref: { kind: 'mechanism', id: mechanismId } }],
        ...(caption === undefined ? {} : { caption }),
        tags: [],
        citations: [],
        provenance: { origin: 'user', createdAt: now, updatedAt: now },
        review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] },
      } as unknown as Asset;
      let result: CommitResult;
      // the bytes are staged for exactly this commit: the store notifies the write queue synchronously, which reads them
      assets.stage.stage([{ assetId: record.id, sha256: picture.sha256, mediaType: picture.mediaType, bytes: picture.bytes }]);
      try {
        result = store.dispatch({ label: `Add picture to ${mechanism.name}`, commands: [{ type: 'record.create', record }], selectionHint: [{ kind: 'mechanism', id: mechanismId }] });
      } finally {
        assets.stage.clear();
      }
      if (!result.ok) return failure(result);
      await assets.saved();
      return { ok: true };
    },

    async edit(assetId, fields) {
      if (fields.altText.trim() === '') return { ok: false, message: ALT_REQUIRED };
      const asset = assetOf(assetId);
      if (asset === undefined) return { ok: false, message: 'This picture is no longer in your data.' };
      const caption = optional(fields.caption);
      const { caption: _old, ...rest } = asset;
      const next = { ...rest, altText: fields.altText, ...(caption === undefined ? {} : { caption }), provenance: { ...asset.provenance, updatedAt: assets.now() } } as Asset;
      const result = store.dispatch({ label: `Edit picture of ${attachedTo(asset)}`, commands: [{ type: 'record.update', record: next }] });
      if (!result.ok) return result.error.code === 'EMPTY_COMMAND' ? { ok: true } : failure(result);
      await assets.saved();
      return { ok: true };
    },

    detach(mechanismId, assetId) {
      const asset = assetOf(assetId);
      if (asset === undefined) return { ok: false, message: 'This picture is no longer in your data.' };
      const kept = asset.attachedTo.filter((one) => !(one.ref.kind === 'mechanism' && one.ref.id === mechanismId));
      const next = { ...asset, attachedTo: kept, provenance: { ...asset.provenance, updatedAt: assets.now() } } as Asset;
      const result = store.dispatch({ label: `Remove picture from ${mechanismName(mechanismId)}`, commands: [{ type: 'record.update', record: next }], selectionHint: [{ kind: 'mechanism', id: mechanismId }] });
      return result.ok ? { ok: true } : failure(result);
    },

    async image(assetId, mediaType) {
      try {
        // a picture just added may not be durable yet: what is held answers first
        const sha = assetOf(assetId)?.sha256;
        const blob = (sha === undefined ? undefined : assets.held(sha)) ?? (getBlob === undefined ? undefined : await getBlob(assetId));
        if (blob === undefined && getBlob === undefined) return { ok: false, message: 'This tab keeps nothing on disk, so no picture is shown here.' };
        if (blob === undefined) return { ok: false, message: 'Picture missing: its file is not stored in this browser' };
        // the stored type decides how the browser reads the bytes; an SVG is only ever an image, never markup
        return { ok: true, url: URL.createObjectURL(new Blob([blob], { type: mediaType })) };
      } catch (error) {
        return { ok: false, message: `The picture could not be read: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
    revoke: (url) => URL.revokeObjectURL(url),
  };
}
