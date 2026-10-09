// @vitest-environment jsdom
/** A hub card with a tone (step 5.5c; ADR-037) in the DOM: the tone on the card and its rule, rounded 8 px, neutral without a tone, the group in the title, the stylesheet from tokens. */
import { cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { draw, node, sceneOf } from '@/test-support/svg-kit';
import { HUB_RADIUS } from './geometry';

afterEach(cleanup);

const all = (root: Element, selector: string): Element[] => [...root.querySelectorAll(selector)];
const nodeEl = (root: Element, id: string): Element => root.querySelector(`[data-node-id="${id}"]`) as Element;

describe('a hub card with a tone (ADR-037, step 5.5c)', () => {
  const tones = ['blue', 'green', 'amber', 'violet', 'teal', 'rose', 'slate'] as const;
  const scene = sceneOf([
    ...tones.map((tone) => node(`cls_${tone}`, { kind: 'class', role: 'anchor', arrangement: { group: `Group ${tone}`, tone } })),
    node('cls_plain', { kind: 'class', role: 'anchor' }),
    node('virtual:unclassified', { kind: 'virtual', role: 'unclassified' }),
  ]);
  const shapes = (container: Element, id: string): Element[] => all(nodeEl(container, id), ':scope > rect');
  const css = readFileSync(resolve(__dirname, 'scene-svg.module.css'), 'utf8');

  it('is rounded 8 px (an rx attribute), the tone is on the card and on its rule, and the rule is clipped to the rounded card', () => {
    const { container } = draw(scene, { lod: 0 });
    for (const tone of tones) {
      const [block, rule] = shapes(container, `cls_${tone}`) as [Element, Element];
      expect(block.getAttribute('rx')).toBe('8');
      expect(block.getAttribute('data-tone')).toBe(tone);
      expect(rule.getAttribute('data-tone')).toBe(tone);
      const ref = /^url\(#(.+)\)$/.exec(rule.getAttribute('clip-path') ?? '')?.[1] as string;
      expect(container.querySelector(`clipPath[id="${ref}"] rect`)?.getAttribute('rx')).toBe('8');
    }
  });

  it('a hub without a tone is neutral (no tone attribute), still rounded; Unclassified is the neutral dashed box', () => {
    const { container } = draw(scene, { lod: 0 });
    const [block, rule] = shapes(container, 'cls_plain') as [Element, Element];
    expect(block.hasAttribute('data-tone')).toBe(false);
    expect(rule.hasAttribute('data-tone')).toBe(false);
    expect(block.getAttribute('rx')).toBe('8');
    const unclassified = shapes(container, 'virtual:unclassified')[0] as Element;
    expect(unclassified.hasAttribute('data-tone')).toBe(false);
    expect(unclassified.getAttribute('stroke-dasharray')).toBe('2 3');
  });

  it('colour is not the only carrier: the title carries the group', () => {
    const { container } = draw(scene, { lod: 0 });
    expect(nodeEl(container, 'cls_blue').querySelector('title')?.textContent).toContain('Group blue');
    expect(nodeEl(container, 'cls_plain').querySelector('title')?.textContent ?? '').not.toContain('Group');
  });

  it('the stylesheet gives each tone its tint and border (card) and its ink (rule), from tokens only', () => {
    for (const tone of tones) {
      const card = new RegExp(String.raw`\.hubBlock\[data-tone='${tone}'\] \{[^}]*var\(--color-tone-${tone}-tint\)[^}]*var\(--color-tone-${tone}-border\)`);
      const rule = new RegExp(String.raw`\.hubRule\[data-tone='${tone}'\] \{[^}]*var\(--color-tone-${tone}-ink\)`);
      expect(css, tone).toMatch(card);
      expect(css, tone).toMatch(rule);
    }
  });

  it('the corner radius is the card radius token', () => {
    const tokens = readFileSync(resolve(__dirname, '../../ui/design/tokens.css'), 'utf8');
    expect(HUB_RADIUS).toBe(Number(/--radius-card:\s*(\d+)px;/.exec(tokens)?.[1]));
  });
});
