// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './error-boundary';

afterEach(cleanup);

let shouldThrow = true;
function Bomb() {
  if (shouldThrow) throw new Error('boom');
  return <p>fine now</p>;
}

describe('ErrorBoundary', () => {
  it('shows the error as text with a "Reload panel" button that tries the panel again', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: unknown[] = [];
    shouldThrow = true;
    render(
      <ErrorBoundary label="The test panel" onError={(error) => seen.push(error)}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert', { name: 'The test panel' }).textContent).toContain('The test panel stopped working: Error: boom');
    expect(seen).toHaveLength(1);
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reload panel' }));
    expect(screen.getByText('fine now')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders its children untouched when nothing fails', () => {
    shouldThrow = false;
    render(
      <ErrorBoundary label="p">
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine now')).toBeTruthy();
  });

  it('a non-Error throw is shown as text too', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Odd(): never {
      throw 'a plain string';
    }
    render(
      <ErrorBoundary label="p">
        <Odd />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain('a plain string');
  });
});
