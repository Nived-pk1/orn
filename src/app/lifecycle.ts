/**
 * Page lifecycle wiring (step 5.1d): `pagehide` writes the clean-shutdown marker, `pageshow` with `persisted = true` (a page
 * restored from the back/forward cache) marks the session as running again, and `beforeunload` warns while writes are pending.
 * The window is injected, so the test uses a plain event target.
 */
import type { AppServices } from './services';

export interface LifecycleTarget {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export type LifecycleServices = Pick<AppServices, 'shutdown' | 'resume' | 'pendingWrites'>;

export function installLifecycle(services: LifecycleServices, target: LifecycleTarget): () => void {
  const onPageHide = (): void => void services.shutdown();
  const onPageShow = (event: Event): void => {
    if ((event as Partial<PageTransitionEvent>).persisted === true) void services.resume();
  };
  const onBeforeUnload = (event: Event): void => {
    if (!services.pendingWrites()) return;
    event.preventDefault();
    (event as { returnValue?: unknown }).returnValue = '';
  };
  target.addEventListener('pagehide', onPageHide);
  target.addEventListener('pageshow', onPageShow);
  target.addEventListener('beforeunload', onBeforeUnload);
  return () => {
    target.removeEventListener('pagehide', onPageHide);
    target.removeEventListener('pageshow', onPageShow);
    target.removeEventListener('beforeunload', onBeforeUnload);
  };
}
