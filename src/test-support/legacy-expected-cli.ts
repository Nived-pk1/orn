/** Writes the expected outputs of the legacy dry run (see `legacy-expected.ts`). Run through `node scripts/legacy-expected.mjs`. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildLegacyExpected } from './legacy-expected';

const dir = new URL('../../data/fixtures/legacy-expected/', import.meta.url);
mkdirSync(dir, { recursive: true });
const files = await buildLegacyExpected();
for (const [name, text] of files) {
  writeFileSync(new URL(name, dir), text, 'utf8');
  process.stdout.write(`wrote ${name} (${text.length} characters)\n`);
}
