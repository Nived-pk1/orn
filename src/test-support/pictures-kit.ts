/** A stand-in for the pictures port (step 6.5b): the editor's component tests decide what each call answers and read what it was asked. Test-only. */
import { vi } from 'vitest';
import type { RecordRef } from '@/core/schema';
import type { PictureView, PicturesPort, PreparedPicture, PrepareResult, PictureResult, PictureImage } from '@/features/workbench';

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

export const picture = (overrides: Partial<PreparedPicture> = {}): PreparedPicture => ({
  mediaType: 'image/png',
  byteSize: PNG_BYTES.length,
  sha256: 'a'.repeat(64),
  bytes: PNG_BYTES,
  filename: 'step.png',
  preview: new Blob([PNG_BYTES], { type: 'image/png' }),
  ...overrides,
});

export interface FakePictures {
  readonly port: PicturesPort;
  readonly views: PictureView[];
  readonly prepare: ReturnType<typeof vi.fn>;
  readonly add: ReturnType<typeof vi.fn>;
  readonly edit: ReturnType<typeof vi.fn>;
  readonly detach: ReturnType<typeof vi.fn>;
  readonly image: ReturnType<typeof vi.fn>;
  readonly revoke: ReturnType<typeof vi.fn>;
  /** Tells every subscriber that the list changed. */
  changed(): void;
}

export function fakePictures(initial: readonly PictureView[] = [], answers: { prepare?: PrepareResult; add?: PictureResult; edit?: PictureResult; image?: PictureImage } = {}): FakePictures {
  const views = [...initial];
  const listeners = new Set<() => void>();
  let made = 0;
  const prepare = vi.fn(async (): Promise<PrepareResult> => answers.prepare ?? { ok: true, picture: picture() });
  const add = vi.fn(async (): Promise<PictureResult> => answers.add ?? { ok: true });
  const edit = vi.fn(async (): Promise<PictureResult> => answers.edit ?? { ok: true });
  const detach = vi.fn((target: RecordRef, assetId: string): PictureResult => {
    void target;
    const at = views.findIndex((view) => view.id === assetId);
    if (at >= 0) views.splice(at, 1);
    listeners.forEach((listener) => listener()); // the store tells its subscribers
    return { ok: true };
  });
  const image = vi.fn(async (): Promise<PictureImage> => answers.image ?? { ok: true, url: `blob:test/${++made}` });
  const revoke = vi.fn();
  const port: PicturesPort = { list: () => [...views], subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)), prepare, add, edit, detach, image, revoke };
  return { port, views, prepare, add, edit, detach, image, revoke, changed: () => listeners.forEach((listener) => listener()) };
}

export const view = (id: string, altText: string, caption = '', filename = ''): PictureView => ({ id, mediaType: 'image/png', altText, caption, filename });
