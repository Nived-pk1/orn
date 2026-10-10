/**
 * What the inspector's parts read, made once per snapshot of the state (step 5.6a): the state itself, the ports and how to open a
 * record. Components use this instead of reaching into the ports, so a render is a function of the snapshot.
 */
import { createContext, useContext } from 'react';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { InspectorHost, InspectorPorts } from './contracts';
import { nameOf, recordOf } from './model/describe';

export interface InspectorEnv {
  readonly ports: InspectorPorts;
  readonly host: InspectorHost;
  readonly state: CanonicalState;
  /** Focuses a record (pushed on the history; the pane opens). */
  open(ref: RecordRef): void;
  exists(ref: RecordRef): boolean;
  name(ref: RecordRef): string;
}

export const InspectorEnvContext = createContext<InspectorEnv | null>(null);

export function useInspectorEnv(): InspectorEnv {
  const env = useContext(InspectorEnvContext);
  if (env === null) throw new Error('useInspectorEnv was called outside the inspector');
  return env;
}

export function makeEnv(ports: InspectorPorts, host: InspectorHost, state: CanonicalState, open: (ref: RecordRef) => void): InspectorEnv {
  return { ports, host, state, open, exists: (ref) => recordOf(state, ref) !== undefined, name: (ref) => nameOf(state, ref) };
}
