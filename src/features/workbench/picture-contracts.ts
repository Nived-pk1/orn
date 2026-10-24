import type { RecordRef } from '@/core/schema';

/**
 * What an editor's Pictures section needs of the app (step 6.5b, ADR-038 addendum P1-P6, made generic in 7.1a, Q3): the pictures of a record as saved,
 * and the actions that save one AT ONCE (the picture's asset record and its bytes in ONE transaction, never through the draft). The app fills
 * it; the editor decides nothing about files or storage and holds no bytes beyond the chosen file's preview.
 */

/** One attached picture as the editor shows it (the asset record's own words). */
export interface PictureView {
  readonly id: string;
  readonly mediaType: string;
  /** "" when none is written. */
  readonly altText: string;
  readonly caption: string;
  readonly filename: string;
}

/** The file the person chose: only what a `File` offers, so a test can stand in for it. */
export interface PictureFile {
  readonly name: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** A chosen file that passed the checks (size, magic bytes, hash). The editor passes it back unchanged. */
export interface PreparedPicture {
  readonly mediaType: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly bytes: Uint8Array;
  readonly filename: string | undefined;
  /** The bytes as a Blob of the sniffed type, for the dialog's `<img>` preview. */
  readonly preview: Blob;
}

export type PrepareResult = { readonly ok: true; readonly picture: PreparedPicture } | { readonly ok: false; readonly message: string };
export type PictureResult = { readonly ok: true } | { readonly ok: false; readonly message: string };
export type PictureImage = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly message: string };

export interface PictureFields {
  readonly altText: string;
  readonly caption: string;
  /** The picture's natural size when the browser knew it. */
  readonly width?: number;
  readonly height?: number;
}

export interface PicturesPort {
  /** The pictures attached to a record, in the order they are shown (oldest first). */
  list(target: RecordRef): readonly PictureView[];
  /** Fires when any record changes (an Undo of an added picture changes the list). */
  subscribe(listener: () => void): () => void;
  /** Checks a chosen file: the size cap, the magic bytes against the supported types, readability. A refusal is words; nothing is saved. */
  prepare(file: PictureFile): Promise<PrepareResult>;
  /** Saves the picture NOW: its asset record (attached to the record) and its bytes in one change. The record itself is not touched. A kind outside PICTURE_KINDS is refused in words. */
  add(target: RecordRef, picture: PreparedPicture, fields: PictureFields): Promise<PictureResult>;
  /** Saves new alt text and caption of a picture now. */
  edit(assetId: string, fields: Pick<PictureFields, 'altText' | 'caption'>): Promise<PictureResult>;
  /** Detaches the picture from the record; the asset record stays in the data. */
  detach(target: RecordRef, assetId: string): PictureResult;
  /** A blob URL for the stored bytes, made here and revoked by `revoke` (never by the view). */
  image(assetId: string, mediaType: string): Promise<PictureImage>;
  revoke(url: string): void;
}

/** What a form needs to show its Pictures section: the port and whether the record is saved (an asset is attached to a record that must exist). */
export interface PicturesSlot {
  readonly port: PicturesPort;
  readonly saved: boolean;
}
