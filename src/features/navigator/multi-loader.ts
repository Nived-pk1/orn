/**
 * The lazy loader of the map's multi-selection engine (step 6.8b, Y1; Studio only). Nothing loads until the first use (a Shift-click, a
 * marquee, a Select tap). One load serves every use; work asked while it runs waits and then runs in the order asked. A failed load is said
 * through `onError` (never silent), the waiting work is dropped, and the next use tries again. The loader function is injected, so a test
 * decides when (and whether) the engine arrives. React-free.
 */
export interface EngineLoader<E> {
  /** The engine, once it is loaded. */
  loaded(): E | undefined;
  /** Run the work with the engine: at once when it is there, else after the load (which this starts). */
  use(work: (engine: E) => void): void;
  /** Start the load now (a marquee began, Select was tapped) so that the engine is there by the time it is needed. */
  warm(): void;
}

export const LOAD_FAILED = 'The selection tools could not be loaded. Try again.';

export function createEngineLoader<E>(load: () => Promise<E>, onError: (message: string) => void, initial?: E): EngineLoader<E> {
  let engine: E | undefined = initial;
  let loading = false;
  let waiting: ((engine: E) => void)[] = [];

  const start = (): void => {
    if (loading) return;
    loading = true;
    load().then(
      (loadedEngine) => {
        engine = loadedEngine;
        loading = false;
        const work = waiting;
        waiting = [];
        for (const run of work) run(loadedEngine);
      },
      () => {
        loading = false;
        waiting = [];
        onError(LOAD_FAILED);
      },
    );
  };

  return {
    loaded: () => engine,
    use(work) {
      if (engine !== undefined) return work(engine);
      waiting.push(work);
      start();
    },
    warm() {
      if (engine === undefined) start();
    },
  };
}
