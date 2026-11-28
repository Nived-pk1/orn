/**
 * The state of one step's drawing (step 8.5): loads through `loadStep` once the step is near the screen (D7), makes the object URLs of the
 * structure drawings and revokes them when the step goes away or is replaced by a newer load. A step that changes (the Studio editor's draft) is loaded
 * again after a short wait; the answer of a load that was replaced is dropped.
 */
import { useEffect, useRef, useState } from 'react';
import type { DrawableStep, StepDrawingPort } from './contracts';
import { loadStep, type DrawnPart, type LoadedStep } from './step-model';

export type DrawingState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | Exclude<LoadedStep, { status: 'ready' }>
  | { readonly status: 'ready'; readonly before: readonly Shown[]; readonly after: readonly Shown[]; readonly noMovements: boolean };

export interface Shown extends DrawnPart {
  readonly url?: string;
}

/** True once the element is within `margin` pixels of the screen; always true without IntersectionObserver (tests, old engines). */
export function useNearScreen(enabled: boolean, margin = 400): { readonly ref: (node: Element | null) => void; readonly near: boolean } {
  const [near, setNear] = useState(!enabled || typeof IntersectionObserver === 'undefined');
  const observer = useRef<IntersectionObserver | undefined>(undefined);
  const ref = (node: Element | null): void => {
    observer.current?.disconnect();
    if (node === null || near || typeof IntersectionObserver === 'undefined') return;
    observer.current = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: `${margin}px` });
    observer.current.observe(node);
  };
  useEffect(() => () => observer.current?.disconnect(), []);
  return { ref, near };
}

/** The key of what a drawing depends on: a step that did not change is not loaded again. */
const keyOf = (step: DrawableStep): string => JSON.stringify([step.species, step.electronMovements, step.reversible, step.previous]);

export function useStepDrawing(step: DrawableStep, port: StepDrawingPort, active: boolean, attempt: number): DrawingState {
  const [state, setState] = useState<DrawingState>({ status: 'idle' });
  const key = keyOf(step);
  const latest = useRef(step);
  latest.current = step;
  // the object URLs on show; a load that replaces them revokes them after its own are made, so a changing step never shows a broken image
  const onShow = useRef<string[]>([]);
  useEffect(() => () => onShow.current.splice(0).forEach((url) => port.revokeUrl(url)), [port]);
  useEffect(() => {
    if (!active) return undefined;
    let current = true;
    setState((was) => (was.status === 'ready' ? was : { status: 'loading' }));
    void loadStep(latest.current, port).then((loaded) => {
      if (!current) return;
      if (loaded.status !== 'ready') {
        setState(loaded);
        return;
      }
      const made: string[] = [];
      const show = (parts: readonly DrawnPart[]): Shown[] =>
        parts.map((part) => {
          if (part.svg === undefined) return part;
          const url = port.createUrl(part.svg);
          made.push(url);
          return { ...part, url };
        });
      const next: DrawingState = { status: 'ready', before: show(loaded.before), after: show(loaded.after), noMovements: loaded.noMovements };
      const old = onShow.current;
      onShow.current = made;
      setState(next);
      old.forEach((url) => port.revokeUrl(url));
    });
    return () => {
      current = false;
    };
  }, [key, port, active, attempt]);
  return state;
}
