/**
 * What the review queue needs of the app (step 6.8b, R1). The app fills it (`src/app/window/review-host.tsx`) from the store, the finding
 * store and the clock; the queue decides nothing about chemistry, only shows the core's rows (`core/editing/review-queue.ts`) and asks for
 * a bulk change as ONE envelope, which is one Undo step.
 */
import type { CommandEnvelope } from '@/core/commands';
import type { FindingsOf } from '@/core/editing';
import type { CanonicalState, RecordRef } from '@/core/schema';

export interface ReviewPort {
  state(): CanonicalState;
  readonly findingsOf: FindingsOf;
  /** Told when a record or a finding changed. */
  subscribe(listener: () => void): () => void;
  /** The injected clock as an ISO time. */
  now(): string;
  dispatch(envelope: CommandEnvelope): { readonly ok: true } | { readonly ok: false; readonly message: string };
  /** Why changing anything is unavailable (a read-only tab); undefined when it is available. */
  readonly unavailable: string | undefined;
  /** Shows the record in the inspector. */
  open(ref: RecordRef): void;
  /** Why this record has no editor (a sentence), or undefined when "Edit" opens one. */
  editReason(ref: RecordRef): string | undefined;
  edit(ref: RecordRef): void;
}
