/**
 * What the navigator says out loud (step 5.7, item h): ONE message at a time for the screen's one polite live region. `say` replaces
 * the message and bumps a serial, so the same words twice (zoom 100 percent, then 100 percent again) are announced again. A tiny
 * external store (React reads it with `useSyncExternalStore`); it holds words, never data.
 */
export interface Announcement {
  readonly message: string;
  readonly serial: number;
}

export interface Announcer {
  say(message: string): void;
  get(): Announcement;
  subscribe(listener: () => void): () => void;
}

export function createAnnouncer(): Announcer {
  let current: Announcement = { message: '', serial: 0 };
  const listeners = new Set<() => void>();
  return {
    say(message) {
      current = { message, serial: current.serial + 1 };
      for (const listener of [...listeners]) listener();
    },
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
