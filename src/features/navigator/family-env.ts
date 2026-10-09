/**
 * What the cards of the family page need from outside, made once per state snapshot (step 5.5b): names and formulas as plain text,
 * the depiction key of a species with a structure, the shared depiction manager and the timers. No chemistry here.
 */
import { createContext, useContext } from 'react';
import type { RecordRef } from '@/core/schema';
import type { DepictionManager } from '@/render/svg';
import type { NavigatorPorts } from './contracts';

export interface FamilyEnv {
  readonly describe: (ref: RecordRef) => { readonly name: string; readonly formula?: string } | undefined;
  /** The depiction key of a species with a structure, else undefined (a class, a reagent, a species without a structure). */
  readonly keyOf: (ref: RecordRef) => string | undefined;
  readonly manager: DepictionManager | undefined;
  readonly timers: NavigatorPorts['timers'];
}

export const FamilyEnvContext = createContext<FamilyEnv | null>(null);

export function useFamilyEnv(): FamilyEnv {
  const env = useContext(FamilyEnvContext);
  if (env === null) throw new Error('useFamilyEnv was called outside the family page');
  return env;
}
