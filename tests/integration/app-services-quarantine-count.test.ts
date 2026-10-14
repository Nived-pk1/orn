/**
 * Step 5.11b part 2: the stored quarantine count is in AppStatus on every boot (not only the rows THIS boot moved), and an import that
 * sets records aside raises it. The status line says "N records set aside" from it (src/app/window/banners.ts).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createBooter, demoState, tamper } from '@/test-support/app-boot-kit';
import { testEnv, worldHolding } from '@/test-support/app-env-kit';
import { demoFile, importFile } from '@/test-support/app-flow-kit';
import type { QuarantineRow } from '@/persistence/contracts';

const booter = createBooter();
afterEach(() => booter.disposeAll());

const row = (id: string): QuarantineRow => ({ id, createdAt: '2026-10-01T00:00:00.000Z', source: 'boot_integrity', claimedKind: 'species', issues: ['planted by the test'], raw: { id: 'spc_x', broken: true } });

describe('the stored quarantine count in AppStatus (5.11b)', () => {
  it('is 0 for a database with nothing set aside', async () => {
    const world = await worldHolding(demoState());
    const t = testEnv({ world });
    const services = await booter.bootEnv(t);
    expect(services.status.get().quarantinedCount).toBe(0);
  });

  it('survives boots: planted rows are counted on the first boot and again on the next, though no row is moved either time', async () => {
    const world = await worldHolding(demoState());
    await tamper(world, (db) => db.quarantine.bulkAdd([row('q1'), row('q2'), row('q3')]));
    for (let boot = 1; boot <= 2; boot += 1) {
      const services = await booter.bootEnv(testEnv({ world }));
      expect(services.status.get().quarantinedCount, `boot ${boot}`).toBe(3);
      expect(services.status.get().notices?.quarantinedRows, `boot ${boot}: nothing was moved by this boot`).toBe(0);
      await services.dispose();
    }
  });

  it('an import that sets records aside raises the count by the rows the store really added', async () => {
    const world = await worldHolding(demoState());
    await tamper(world, (db) => db.quarantine.bulkAdd([row('q1')]));
    const services = await booter.bootEnv(testEnv({ world }));
    expect(services.status.get().quarantinedCount).toBe(1);
    const doc = JSON.parse(await (await demoFile()).text()) as { records: Record<string, unknown> };
    const species = doc.records.species;
    const first = (Array.isArray(species) ? species[0] : Object.values(species as Record<string, unknown>)[0]) as { names: unknown };
    first.names = 'not an object';
    const applied = await importFile(services, new Blob([JSON.stringify(doc)]), 'one-bad-record.orn.json');
    expect(applied.report.quarantinedCount).toBeGreaterThan(0);
    expect(services.status.get().quarantinedCount).toBe(1 + applied.report.quarantinedCount);
    const tdbCount = await (async () => {
      let n = 0;
      await tamper(world, async (db) => {
        n = await db.quarantine.count();
      });
      return n;
    })();
    expect(services.status.get().quarantinedCount).toBe(tdbCount);
  });
});
