/**
 * The real text measurer (step 5.5a, note E6): canvas `measureText` with the bundled faces, a bounded cache per
 * (text, size, weight, mono). It is trusted only after `document.fonts` has loaded the faces in use; the wait is bounded
 * (`FONT_WAIT_MS`, an injected timer), and after a timeout it measures anyway and says so in the event log. Node and jsdom tests use
 * the fake measurer instead (src/test-support/scene-kit.ts); the browser behaviour is proved by the e2e (no label wider than its box).
 * Browser objects arrive through `MeasurerDeps` (note E1): this file reads no global.
 */
import type { FormattedText, TextStyle } from '@/render/scene';

export const FONT_WAIT_MS = 3000;
/** Entries kept; at the limit the oldest quarter is dropped (a Map keeps insertion order). */
export const MEASURE_CACHE_SIZE = 4000;
/** Sub and superscripts are drawn at this fraction of the font size (scene-svg.module.css). */
const SCRIPT_SCALE = 0.75;
/** The line height of a label, as the renderer lays it out (src/render/svg/geometry.ts textSlots). */
const LINE_HEIGHT = 1.3;

const SANS = '"IBM Plex Sans", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';

/** The faces the drawing uses: a font shorthand each, as `FontFaceSet.load` takes it. */
export const FACES_IN_USE: readonly string[] = ['400 13px "IBM Plex Sans"', '600 14px "IBM Plex Sans"', '400 12px "IBM Plex Mono"'];

export interface MeasuringContext {
  font: string;
  measureText(text: string): { readonly width: number };
}

export interface MeasurerDeps {
  readonly fonts: { load(font: string): Promise<unknown> };
  /** A 2D canvas context, or undefined when the environment has none (then widths are estimated and the log says so). */
  readonly context: () => MeasuringContext | undefined;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly log: (type: string, message: string) => void;
}

export interface TextMeasurer {
  readonly measure: (runs: FormattedText, style: TextStyle) => { readonly width: number; readonly height: number };
  /** Resolves when measuring is trustworthy (all faces loaded) or the bounded wait is over. Never rejects; the same promise every time. */
  readonly ready: () => Promise<void>;
  readonly cacheSize: () => number;
}

export function createTextMeasurer(deps: MeasurerDeps): TextMeasurer {
  const cache = new Map<string, number>();
  let context: MeasuringContext | undefined;
  let contextAsked = false;
  const canvas = (): MeasuringContext | undefined => {
    if (!contextAsked) {
      contextAsked = true;
      context = deps.context();
      if (context === undefined) deps.log('measurer_no_canvas', 'no canvas context: text widths are estimated');
    }
    return context;
  };

  function widthOf(text: string, size: number, weight: number, mono: boolean): number {
    const key = `${mono ? 'm' : 's'}|${size}|${weight}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const ctx = canvas();
    let width: number;
    if (ctx === undefined) {
      width = text.length * size * (mono ? 0.6 : 0.52);
    } else {
      ctx.font = `${weight} ${size}px ${mono ? MONO : SANS}`;
      width = ctx.measureText(text).width;
    }
    if (cache.size >= MEASURE_CACHE_SIZE) {
      let drop = Math.ceil(MEASURE_CACHE_SIZE / 4);
      for (const old of cache.keys()) {
        cache.delete(old);
        drop -= 1;
        if (drop <= 0) break;
      }
    }
    cache.set(key, width);
    return width;
  }

  let waited: Promise<void> | undefined;
  function ready(): Promise<void> {
    waited ??= new Promise<void>((resolve) => {
      let done = false;
      let cancel: () => void = () => undefined;
      const finish = (): void => {
        if (done) return;
        done = true;
        cancel();
        resolve();
      };
      cancel = deps.timers.after(FONT_WAIT_MS, () => {
        if (done) return;
        deps.log('fonts_timeout', `the bundled fonts did not load within ${FONT_WAIT_MS} ms: text is measured with the fonts the browser has`);
        finish();
      });
      Promise.all(FACES_IN_USE.map((face) => deps.fonts.load(face))).then(finish, (error: unknown) => {
        deps.log('fonts_failed', `a bundled font could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
        finish();
      });
    });
    return waited;
  }

  return {
    measure(runs, style) {
      const weight = style.weight === 'strong' ? 600 : 400;
      let width = 0;
      for (const run of runs) {
        const size = run.script === undefined ? style.size : style.size * SCRIPT_SCALE;
        width += widthOf(run.text, size, run.emphasis === 'strong' ? 600 : weight, style.mono);
      }
      return { width, height: style.size * LINE_HEIGHT };
    },
    ready,
    cacheSize: () => cache.size,
  };
}
