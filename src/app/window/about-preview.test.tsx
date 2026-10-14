// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog } from '@/test-support/window-kit';
import { ABOUT_TEXT, aboutVersionLine } from './about-preview';

beforeAll(() => {
  stubDialog();
  fakeLayout();
});
afterEach(cleanup);

const EXPECTED =
  'Preview version. The chemistry here is a small demo and has NOT been checked by an expert yet - please do not study from it. ' +
  'Everything you do stays on this device: nothing is sent anywhere, there are no accounts and no tracking. ' +
  'Your data lives in this browser only; use File > Export to keep a copy. © 2026 Ponap. All rights reserved.';

describe('About this preview', () => {
  it('carries exactly the agreed text', () => {
    expect(ABOUT_TEXT).toBe(EXPECTED);
  });

  it('shows the version and the short commit, injected at build time', () => {
    expect(aboutVersionLine()).toMatch(/^Version \d+\.\d+\.\d+ \([0-9a-z]+\)$/);
  });

  it('opens from the first-run screen: a line under the title and a link-button', () => {
    renderWithApp(fakeApp());
    const region = screen.getByRole('region', { name: 'First run' });
    expect(within(region).getByText('Preview - the chemistry is a demo and not yet checked.')).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: 'About this preview' }));
    const dialog = screen.getByRole('dialog', { name: 'About this preview' });
    expect(dialog.textContent).toContain(EXPECTED);
    expect(within(dialog).getByText(aboutVersionLine())).toBeTruthy();
  });

  it('opens from the File menu', async () => {
    renderWithApp(fakeApp());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'File' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'About this preview' }));
    const dialog = screen.getByRole('dialog', { name: 'About this preview' });
    expect(dialog.textContent).toContain(EXPECTED);
    expect(dialog.textContent).toContain(aboutVersionLine());
  });
});
