/**
 * Is this storage persistent? (step 5.5d, item k). `navigator.storage.persist()` is asked once, after the first import. A reload of a
 * dataset that is already saved never imports again, so without this check the status would say nothing about it. At boot, in a
 * writer tab whose dataset already has data, the browser is asked `persisted()` (it never prompts): a `false` is the same answer as a
 * refusal (the banner can be dismissed and the status line keeps "Storage: not persistent"), a `true` is `persisted`. A failing or
 * absent question changes nothing. Never awaited by boot; its answer only updates `AppStatus.storage`.
 */
import type { AppEnv } from './contracts';
import type { EventLogWriter, StatusWriter } from './status';

const NOT_PERSISTENT = 'the browser has not made this storage persistent; it may clear this data when space is short, so export a backup';

export function checkStorageAtBoot(options: { readonly env: Pick<AppEnv, 'storage'>; readonly status: StatusWriter; readonly log: EventLogWriter; readonly hasData: boolean; readonly writer: boolean }): void {
  const { env, status, log } = options;
  const persisted = env.storage?.persisted;
  if (persisted === undefined || !options.hasData || !options.writer) return;
  void (async () => {
    try {
      const yes = await persisted.call(env.storage);
      // an answer the first import's request has given meanwhile is newer than this one
      if (status.get().storage.persistence !== 'unknown') return;
      status.update({ storage: { persistence: yes ? 'persisted' : 'refused', message: yes ? null : NOT_PERSISTENT } });
      log.add({ source: 'app', event: { type: 'persistent_storage', message: yes ? 'storage is persistent' : NOT_PERSISTENT } });
    } catch {
      // the question is optional: no answer, no change
    }
  })();
}
