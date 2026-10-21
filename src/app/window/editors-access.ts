/**
 * What the Study-safe parts of the window (top bar, status line, phone More, the window itself) read of the editors. In Studio these are
 * the hooks of `drafts-ui.tsx`; in Study they are inert stand-ins, and because `EDITING` is a build-time literal the bundler drops
 * `drafts-ui.tsx` (an editing module, scripts/editor-modules.json) from the Study output. Nothing here is editing logic.
 */
import { EDITING } from '@/app/edition';
import type { DraftsView } from '@/app/services/drafts-types';
import * as ui from './drafts-ui';
import type { EditorsApi } from './drafts-ui';

const NO_DRAFTS: DraftsView = { items: [], count: 0, keeping: 'stored' };

export const useEditors: () => EditorsApi | null = EDITING ? ui.useEditors : () => null;
export const useDraftsOpen: () => (() => void) | null = EDITING ? ui.useDraftsOpen : () => null;
export const useDraftsView: () => DraftsView = EDITING ? ui.useDraftsView : () => NO_DRAFTS;
