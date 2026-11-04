/** Reduced motion (step 8.2a): a box fades with a transition only for a visitor who has not asked for less motion; otherwise its opacity changes at once. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/render/svg/scene-svg.module.css'), 'utf8');

describe('the fade of a map box', () => {
  it('has a transition only inside prefers-reduced-motion: no-preference', () => {
    const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/g, '');
    expect(outside).not.toMatch(/\.mapNode[^}]*transition/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.mapNode \{\s*transition: opacity/);
  });

  it('the faded opacity itself is set outside any motion query (it applies at once)', () => {
    expect(css).toMatch(/\n\.faded \{\s*opacity: 0\.35;/);
  });
});
