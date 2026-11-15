/** The fallback of every lazy view of the canvas (7.6 A4; 8.4f D4): the skeleton of a page (title, filter row, cards) while its chunk loads, so a page is never silently empty and nothing moves when it arrives. Its words are "Loading…" for a screen reader. */
import { PageSkeleton } from '@/ui/primitives';

export function LoadingLine() {
  return <PageSkeleton label="Loading…" />;
}
