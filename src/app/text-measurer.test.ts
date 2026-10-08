import { describe, expect, it } from 'vitest';
import type { FormattedText, TextStyle } from '@/render/scene';
import { createTextMeasurer, FACES_IN_USE, FONT_WAIT_MS, MEASURE_CACHE_SIZE, type MeasuringContext } from './text-measurer';

// The real canvas and the real fonts belong to the browser (the e2e proves no label is wider than its box); here the context is a stub
// that makes a width from the font string so the font choice is visible.
function stubContext(): MeasuringContext {
  return {
    font: '',
    measureText(this: MeasuringContext, text: string) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
      return { width: text.length * size * (this.font.includes('Mono') ? 0.6 : 0.5) * (this.font.startsWith('600') ? 1.1 : 1) };
    },
  };
}

function rig(options: { load?: (font: string) => Promise<unknown>; noCanvas?: boolean } = {}) {
  const logs: string[] = [];
  const loads: string[] = [];
  let timer: (() => void) | undefined;
  let cancelled = false;
  const measurer = createTextMeasurer({
    fonts: { load: options.load ?? ((font) => (loads.push(font), Promise.resolve([]))) },
    context: () => (options.noCanvas === true ? undefined : stubContext()),
    timers: {
      after: (_ms, run) => {
        timer = run;
        return () => {
          cancelled = true;
        };
      },
    },
    log: (type, message) => logs.push(`${type}: ${message}`),
  });
  return { measurer, logs, loads, fire: () => timer?.(), cancelled: () => cancelled };
}

const sans: TextStyle = { size: 12, weight: 'regular', mono: false };
const runs = (text: string, extra: Partial<FormattedText[number]> = {}): FormattedText => [{ text, ...extra }];

describe('the text measurer', () => {
  it('is ready once every bundled face has loaded, and then cancels its timer', async () => {
    const { measurer, loads, cancelled, logs } = rig();
    await measurer.ready();
    expect(loads).toEqual([...FACES_IN_USE]);
    expect(cancelled()).toBe(true);
    expect(logs).toEqual([]);
  });

  it('after the bounded wait it is ready anyway and logs an event', async () => {
    const { measurer, fire, logs } = rig({ load: () => new Promise(() => undefined) });
    const ready = measurer.ready();
    fire();
    await ready;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('fonts_timeout');
    expect(logs[0]).toContain(String(FONT_WAIT_MS));
  });

  it('a font that fails to load is reported and does not block', async () => {
    const { measurer, logs } = rig({ load: () => Promise.reject(new Error('404')) });
    await measurer.ready();
    expect(logs[0]).toContain('fonts_failed');
  });

  it('measures by size, weight and mono, and scales sub and superscripts to 75%', () => {
    const { measurer } = rig();
    const plain = measurer.measure(runs('abcd'), sans);
    expect(plain.width).toBe(4 * 12 * 0.5);
    expect(measurer.measure(runs('abcd'), { ...sans, weight: 'strong' }).width).toBeCloseTo(plain.width * 1.1);
    expect(measurer.measure(runs('abcd'), { ...sans, mono: true }).width).toBe(4 * 12 * 0.6);
    expect(measurer.measure(runs('abcd', { script: 'sub' }), sans).width).toBe(4 * 9 * 0.5);
    expect(plain.height).toBeCloseTo(12 * 1.3);
  });

  it('caches per (text, size, weight, mono) and stays bounded', () => {
    const { measurer } = rig();
    measurer.measure(runs('same'), sans);
    measurer.measure(runs('same'), sans);
    expect(measurer.cacheSize()).toBe(1);
    for (let i = 0; i < MEASURE_CACHE_SIZE + 50; i += 1) measurer.measure(runs(`text ${i}`), sans);
    expect(measurer.cacheSize()).toBeLessThanOrEqual(MEASURE_CACHE_SIZE);
  });

  it('with no canvas it estimates and says so once', () => {
    const { measurer, logs } = rig({ noCanvas: true });
    expect(measurer.measure(runs('abcd'), sans).width).toBeGreaterThan(0);
    measurer.measure(runs('other'), sans);
    expect(logs.filter((line) => line.startsWith('measurer_no_canvas'))).toHaveLength(1);
  });
});
