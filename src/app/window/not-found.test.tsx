// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFound } from './not-found';

afterEach(cleanup);

describe('NotFound (step 8.4g, G7)', () => {
  it('says the page does not exist for a bad address', () => {
    const go = vi.fn();
    render(<NotFound what="bad" onChapters={go} />);
    expect(screen.getByText('This page does not exist.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Chapters' }));
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('Go to Chapters is a real, primary button (step 8.4g Part B, P3)', () => {
    render(<NotFound what="bad" onChapters={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Go to Chapters' }).getAttribute('data-kind')).toBe('primary');
  });

  it('says the record is not in this version for an unknown id', () => {
    render(<NotFound what="missing" onChapters={() => undefined} />);
    expect(screen.getByText('This record is not in this version of the app.')).toBeTruthy();
  });
});
