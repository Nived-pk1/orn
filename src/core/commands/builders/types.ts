/** Shared shape of command builders: plain functions from state (and injected capabilities) to an envelope. */
import type { CommandEnvelope, CommandError } from '../contracts';

export type BuildResult =
  | { readonly ok: true; readonly envelope: CommandEnvelope }
  | { readonly ok: false; readonly error: CommandError };

export const built = (envelope: CommandEnvelope): BuildResult => ({ ok: true, envelope });
export const rejected = (error: CommandError): BuildResult => ({ ok: false, error });
