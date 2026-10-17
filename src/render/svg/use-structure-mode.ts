/**
 * The structures mode as a React value (equation step, part 4): the mode the depiction port reports now, and a re-render when it changes,
 * so every component that makes a depiction key asks again in the new mode. A port without a mode (or none) is always Skeletal.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { StructureMode } from '@/chem/contracts';
import type { DepictionPort } from './depiction-binding';

const nobody = (): (() => void) => () => undefined;

export function useStructureMode(port: Pick<DepictionPort, 'mode' | 'onMode'> | undefined): StructureMode {
  const subscribe = useCallback((listener: () => void) => (port?.onMode === undefined ? nobody() : port.onMode(listener)), [port]);
  const read = useCallback((): StructureMode => port?.mode?.() ?? 'skeletal', [port]);
  return useSyncExternalStore(subscribe, read, read);
}
