// @vitest-environment jsdom
/** A structure in the inspector follows the Structures setting (equation step, part 4): a change asks for the drawing again, in the new mode. */
import { act, cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { StructureMode } from '@/chem/contracts';
import type { RecordRef } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout, inspectorRig, preloadViews } from '@/test-support/inspector-kit';
import { Inspector } from './inspector';

afterEach(cleanup);
beforeAll(fakeLayout);
beforeAll(preloadViews);
afterAll(() => undefined);

describe('the inspector\'s structure and the Structures setting', () => {
  it('asks again, in the new mode, when the setting changes; never a drawing of the other mode', async () => {
    const asked: string[] = [];
    let mode: StructureMode = 'skeletal';
    const listeners = new Set<() => void>();
    const depictions = {
      keyOf: (s: { value: string }, _size: unknown, m?: StructureMode) => `${s.value}#${m ?? 'skeletal'}`,
      depict: (s: { value: string }, _size: unknown, m?: StructureMode) => {
        asked.push(`${s.value}#${m ?? 'skeletal'}`);
        return Promise.resolve({ ok: true as const, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
      },
      cancel: () => undefined,
      createUrl: () => 'blob:drawn',
      revokeUrl: () => undefined,
      mode: () => mode,
      onMode: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)),
    } as never;
    const rig = inspectorRig(demoState(), { depictions });
    render(<Inspector ports={rig.ports} host={rig.host} />);
    act(() => rig.inspector.getState().open({ kind: 'species', id: 'spc_ethanol' } as RecordRef));
    await act(async () => {
      await Promise.resolve();
    });
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((key) => key.endsWith('#skeletal'))).toBe(true);
    const before = asked.length;
    mode = 'condensed';
    await act(async () => {
      listeners.forEach((l) => l());
      await Promise.resolve();
    });
    expect(asked.length).toBeGreaterThan(before);
    expect(asked.slice(before).every((key) => key.endsWith('#condensed'))).toBe(true);
  });
});
