/**
 * What the merge dialog needs of the app (step 6.8a, D3): candidates of the same kind to merge into, the preview (the core's, plus the
 * structure check a species needs from the chem worker) and the merge itself. The app fills it (`src/app/window/merge-port.ts`); the dialog
 * decides nothing about chemistry or references.
 */
import type { RecordRef } from '@/core/schema';

export interface MergeCandidate {
  readonly ref: RecordRef;
  readonly name: string;
}

export type MergeView =
  | {
      readonly ok: true;
      /** The fields where the two differ: B's value (`into`, selected first) and A's (`from`). */
      readonly scalars: readonly { readonly path: string; readonly into: unknown; readonly from: unknown }[];
      readonly changes: readonly { readonly ref: RecordRef; readonly name: string }[];
      /** A, when it is a stored record (it is deleted in the same step). */
      readonly deleted: { readonly ref: RecordRef; readonly name: string } | undefined;
    }
  | { readonly ok: false; readonly message: string };

export type MergePick = 'keep' | 'take';

export interface MergePort {
  /** Records of this kind (other than `exceptId`) whose name contains `text`, best first, at most 20. */
  candidates(kind: RecordRef['kind'], text: string, exceptId: string): readonly MergeCandidate[];
  /** `from` is a stored record or a draft that was never stored. */
  preview(from: unknown, into: RecordRef): Promise<MergeView>;
  run(from: unknown, into: RecordRef, picks: Readonly<Record<string, MergePick>>): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
}
