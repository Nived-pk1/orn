/** Writes the appearance choice onto the root element (step 8.4f, D2). `watchAppearance` runs before the first React render, so a stored Light or Dark is there at first paint; System writes nothing and the device decides by CSS. */
import { appearanceAttributes, type AppearanceStore, type AppearanceValues } from '@/ui/state';

export interface RootLike {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export function applyAppearance(root: RootLike, values: AppearanceValues): void {
  for (const [name, value] of Object.entries(appearanceAttributes(values))) {
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
  }
}

export function watchAppearance(root: RootLike, store: AppearanceStore): () => void {
  applyAppearance(root, store.getState());
  return store.subscribe((state) => applyAppearance(root, state));
}
