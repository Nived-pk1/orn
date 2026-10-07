// @vitest-environment jsdom
/**
 * A committed DOM snapshot of the demo navigator overview (step 5.4a): the Scene is built with the fake text measurer and the pure
 * fallback layout, so it is deterministic. A change of the drawing shows up here as a diff to review; update the file only on purpose
 * (`npx vitest run -u src/render/svg/scene-svg-snapshot.test.tsx`).
 */
import { cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { demoNavigatorScene, draw } from '@/test-support/svg-kit';

afterEach(cleanup);

/** React's `useId` counts across drawings in a file, so the id prefix of a drawing is not part of the snapshot. */
const stable = (text: string): string => text.replace(/orn_r_\d+_/g, 'orn-ID');

/** One element per line, two spaces per level, attributes in document order: stable and readable in a diff. */
function pretty(node: Element, depth = 0): string[] {
  const pad = '  '.repeat(depth);
  const attrs = [...node.attributes].map((a) => ` ${a.name}="${a.value}"`).join('');
  const tag = node.localName;
  if (node.children.length === 0) return [`${pad}<${tag}${attrs}>${node.textContent ?? ''}</${tag}>`];
  return [`${pad}<${tag}${attrs}>`, ...[...node.children].flatMap((child) => pretty(child, depth + 1)), `${pad}</${tag}>`];
}

it('the demo navigator overview at LOD 2 is drawn as the committed snapshot says', async () => {
  const { svg } = draw(demoNavigatorScene(false), { lod: 2, ariaLabel: 'Navigator: demo overview' });
  await expect(stable(pretty(svg).join('\n')) + '\n').toMatchFileSnapshot('./__snapshots__/demo-navigator-lod2.svg.txt');
});

it('the demo navigator with every hub expanded at LOD 1 is drawn as the committed snapshot says', async () => {
  const { svg } = draw(demoNavigatorScene(true), { lod: 1, ariaLabel: 'Navigator: demo, hubs expanded' });
  await expect(stable(pretty(svg).join('\n')) + '\n').toMatchFileSnapshot('./__snapshots__/demo-navigator-expanded-lod1.svg.txt');
});
