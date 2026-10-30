/**
 * The Review page's saved choices as a port (7.3a E1): the `uiState` entry boot read, and a save that goes through the persistence adapter.
 * Tiny on purpose: it is made at boot, so it must not pull the lazy Review page into the entry chunk.
 */
import type { AppServices } from '@/app/services';
import type { JsonValue } from '@/core/schema';

export const REVIEW_KEY = 'review';

export interface ReviewUiPort {
  readonly stored: unknown;
  save(value: unknown): void;
}

export function createReviewUiPort(services: Pick<AppServices, 'bootReport' | 'persistence'>): ReviewUiPort {
  return {
    stored: services.bootReport?.uiState[REVIEW_KEY],
    save: (value) => void services.persistence?.setUiState(REVIEW_KEY, value as JsonValue).catch(() => undefined),
  };
}
