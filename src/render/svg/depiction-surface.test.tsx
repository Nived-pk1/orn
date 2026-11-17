// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DepictionSurface } from './depiction-surface';

const TOKENS = readFileSync(resolve(process.cwd(), 'src/ui/design/tokens.css'), 'utf8');

describe('the equation drawing backing (step 8.4m2, B2)', () => {
  it('wraps the drawing in one marked surface and leaves the drawing as it is', () => {
    const { container } = render(
      <DepictionSurface>
        <img src="blob:x" alt="Structure of X" />
      </DepictionSurface>,
    );
    const surface = container.querySelector('[data-depiction-surface]');
    expect(surface?.querySelector('img')?.getAttribute('alt')).toBe('Structure of X');
    expect(surface?.children).toHaveLength(1);
  });

  it('light has no backing; both dark blocks put the drawing on paper', () => {
    expect(TOKENS).toMatch(/--depiction-bg:transparent; --depiction-pad:0px;/);
    expect(TOKENS.match(/--depiction-bg:var\(--paper\); --depiction-pad:4px;/g)).toHaveLength(2);
  });
});
