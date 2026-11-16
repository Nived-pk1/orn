// @vitest-environment jsdom
/**
 * A truncated overview says so (step 5.5d, item g; INV-22 UI part): the drawing limit is lowered, so the demo's map is cut, the canvas
 * shows a notice that says what was cut and how to see more, and the status line keeps its one plain line. Since step 8.4m (M2) the
 * arranged overview admits every pair of its boxes, so the limit that can still cut it is the number of BOXES: lowered to 5 here
 * (before 8.4m this test lowered the arrow limit to 3).
 */
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Limits from '@/features/navigator/limits';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp } from '@/test-support/window-kit';

vi.mock('@/features/navigator/limits', async (original) => ({ ...(await original<typeof Limits>()), NAVIGATOR_MAX_NODES: 5 }));

afterEach(cleanup);

describe('a truncated map', () => {
  it('shows a notice with what was cut and how to see more, next to the status line that stays one plain line', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    await screen.findByRole('group', { name: /^Navigator:/ });
    const notice = await screen.findByText(/This map is not complete: .* not drawn, because/);
    expect(notice.textContent).toMatch(/arrows?/);
    expect(notice.textContent).toMatch(/because the drawing holds only so many boxes/);
    expect(notice.textContent).toMatch(/Open a family page to see everything: its full list of reactions is there, nothing is left out\./);
    const limits = screen.getByRole('region', { name: 'Drawing limits' });
    expect(limits.textContent).toMatch(/^Not drawn: .* \(the drawing is limited; reason: max nodes\)\.$/);
    expect(within(limits).queryByText(/Open a family page/)).toBeNull();
  });
});
