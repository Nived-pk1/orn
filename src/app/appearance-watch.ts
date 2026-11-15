/** Keeps the root element in step with the appearance store (step 8.4f). Its own file: only the lazy Settings chunk needs it, so the page boot does not carry it. */
import type { AppearanceStore } from '@/ui/state';
import { applyAppearance, type RootLike } from './appearance-dom';

export function watchAppearance(root: RootLike, store: AppearanceStore): () => void {
  applyAppearance(root, store.getState());
  return store.subscribe((state) => applyAppearance(root, state));
}
