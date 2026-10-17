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

export type LifecycleServices = Pick<AppServices, 'shutdown' | 'resume' | 'pendingWrites'> & { readonly drafts?: Pick<AppServices['drafts'], 'flush'> };

/** The page whose visibility is watched (the document); optional so a plain event target still works. */
export interface VisibilitySource {
  readonly visibilityState?: string;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export function installLifecycle(services: LifecycleServices, target: LifecycleTarget, visibility?: VisibilitySource): () => void {
  const onPageHide = (): void => void services.shutdown();
  const onPageShow = (event: Event): void => {
    if ((event as Partial<PageTransitionEvent>).persisted === true) void services.resume();
  };
  const onBeforeUnload = (event: Event): void => {
    if (!services.pendingWrites()) return;
    event.preventDefault();
    (event as { returnValue?: unknown }).returnValue = '';
  };
  // Best effort: a phone may kill a background tab, so dirty drafts are saved when the page is hidden. Nothing depends on this write.
  const onVisibility = (): void => {
    if (visibility?.visibilityState === 'hidden') void services.drafts?.flush();
  };
  visibility?.addEventListener('visibilitychange', onVisibility);
  target.addEventListener('pagehide', onPageHide);
  target.addEventListener('pageshow', onPageShow);
  target.addEventListener('beforeunload', onBeforeUnload);
  return () => {
    visibility?.removeEventListener('visibilitychange', onVisibility);
    target.removeEventListener('pagehide', onPageHide);
    target.removeEventListener('pageshow', onPageShow);
    target.removeEventListener('beforeunload', onBeforeUnload);
  };
}
