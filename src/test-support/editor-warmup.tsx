/**
 * Test-only. The first time a file opens an editor, the editor's components render for the first time in that worker (cold code, a big
 * form), which takes ~0.3 s alone and over a second when the machine is busy with the other test workers: longer than a `findBy*` waits
 * (R7 family, studio step G4). `window-setup.ts` (the main project's setup file) calls this once in `beforeAll` of every window test file, after `stubDialog()` and `fakeLayout()`, so the cold cost
 * is paid in the hook (which has its own, longer limit) and the asserted waits only see a warm editor. No wait anywhere is raised.
 */
import { expect } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { demoState } from './app-boot-kit';
import { fakeApp, renderWithApp } from './window-kit';

const COLD_LIMIT_MS = 30_000;

export async function warmEditors(): Promise<void> {
  const state = demoState();
  for (const kind of ['species', 'reaction', 'mechanism'] as const) {
    const id = Object.keys(state.records[kind]).sort()[0];
    if (id === undefined) continue;
    const app = fakeApp({ state: demoState() });
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    act(() => app.inspectorStore.getState().open({ kind, id }));
    const pane = await screen.findByRole('complementary', { name: 'Inspector' }, { timeout: COLD_LIMIT_MS });
    fireEvent.click(await within(pane).findByRole('button', { name: 'Edit' }, { timeout: COLD_LIMIT_MS }));
    await screen.findByRole('dialog', { name: /^Edit / }, { timeout: COLD_LIMIT_MS });
    cleanup();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  }
}
