/**
 * The entry's side of Starred and Recent (step 8.4g Part B, size trim): a small holder. The rules and the store (`my-records.ts`: 500 stars, no
 * duplicates, deleted ids dropped) are a lazy chunk, loaded on idle after boot or on first use, whichever comes first. Until `records()` has
 * something there is nothing to show: no star button, no stars, nothing recent (never a wrong state). The late chunk attaches the star port
 * and the palette star command once the rules are ready. The `MyRecords` face the views read is built in `my-records-face.ts`.
 */
import type { StarsPort } from '@/features/inspector';
import type { AppServices } from '@/app/services';
import type { MyRecords } from './my-records';

/** What the late chunk hands to the window: the inspector star port and the palette star command. */
export interface MineLate {
  readonly port: StarsPort;
  readonly star: () => { readonly starred: boolean; readonly run: (() => void) | undefined } | undefined;
}

export interface LazyMine {
  /** The store, once loaded. */
  records(): MyRecords | undefined;
  late(): MineLate | undefined;
  load(): Promise<void>;
  attach(late: MineLate | undefined): void;
  subscribe(listener: () => void): () => void;
}

export function createLazyMine(services?: Partial<Pick<AppServices, 'bootReport' | 'persistence' | 'status'>>): LazyMine {
  let records: MyRecords | undefined;
  let late: MineLate | undefined;
  let loading: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const tell = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    records: () => records,
    late: () => late,
    load: () =>
      (loading ??=
        services === undefined
          ? Promise.resolve()
          : import('./my-records').then((m) => {
              records = m.createMyRecords(services);
              records.subscribe(tell);
              tell();
            })),
    attach(next) {
      late = next;
      tell();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
