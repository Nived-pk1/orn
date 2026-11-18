// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createActiveExamStore } from '@/ui/state';
import { LazyTour } from './lazy-tour';

afterEach(cleanup);
const flush = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 50)); });

function setup(over: { asked?: boolean; hasData?: boolean; done?: boolean } = {}) {
  const exam = createActiveExamStore();
  if (over.asked ?? true) exam.getState().setAsked(true);
  const services = { bootReport: { uiState: over.done === true ? { tourDone: { done: true } } : {} }, status: { get: () => ({ mode: 'reader' }) } } as never;
  const view = render(<LazyTour exam={exam} hasData={over.hasData ?? true} services={services} />);
  return { exam, view };
}

describe('LazyTour (step 8.4g Part B, G4)', () => {
  it('shows after the exam question has been answered, once the data is there', async () => {
    setup();
    await flush();
    expect(screen.getByRole('region', { name: 'Tour' })).toBeTruthy();
  });

  it('waits for the exam question, for the data, and is never shown again once done', async () => {
    setup({ asked: false });
    await flush();
    expect(screen.queryByRole('region', { name: 'Tour' })).toBeNull();
    cleanup();
    setup({ hasData: false });
    await flush();
    expect(screen.queryByRole('region', { name: 'Tour' })).toBeNull();
    cleanup();
    setup({ done: true });
    await flush();
    expect(screen.queryByRole('region', { name: 'Tour' })).toBeNull();
  });

  it('answering the exam question later starts it; Skip ends it for good', async () => {
    const { exam } = setup({ asked: false });
    act(() => exam.getState().setAsked(true));
    await flush();
    const skip = screen.getByRole('button', { name: 'Skip' });
    act(() => skip.click());
    await flush();
    expect(screen.queryByRole('region', { name: 'Tour' })).toBeNull();
  });
});
