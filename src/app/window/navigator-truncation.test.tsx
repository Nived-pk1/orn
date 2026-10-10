// @vitest-environment jsdom
/**
 * A truncated overview says so (step 5.5d, item g; INV-22 UI part): the drawing limit is lowered to 3 arrows, so the demo's map is cut,
 * the canvas shows a notice that says what was cut and how to see more, and the status line keeps its one plain line.
 */
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp } from '@/test-support/window-kit';

vi.mock('@/features/navigator/limits', () => ({ NAVIGATOR_MAX_EDGES: 3, NAVIGATOR_MAX_NODES: 400 }));

afterEach(cleanup);

describe('a truncated map', () => {
  it('shows a notice with what was cut and how to see more, next to the status line that stays one plain line', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    await screen.findByRole('group', { name: /^Navigator:/ });
    const notice = await screen.findByText(/This map is not complete: .* not drawn, because/);
    expect(notice.textContent).toMatch(/arrows?/);
    expect(notice.textContent).toMatch(/Open a family page to see everything: its full list of reactions is there, nothing is left out\./);
    const limits = screen.getByRole('region', { name: 'Drawing limits' });
    expect(limits.textContent).toMatch(/^Not drawn: .* \(the drawing is limited; reason: max edges\)\.$/);
    expect(within(limits).queryByText(/Open a family page/)).toBeNull();
  });
});
