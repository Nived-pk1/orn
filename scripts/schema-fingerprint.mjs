// The fingerprint of the canonical schema files (step 8.4s, S6; audit DA-08): SHA-256 over the files of src/core/schema (not the tests, not the
// fingerprint file itself), in name order, line endings normalised. `npm run check` fails when the files changed and the fingerprint did not.
// Usage: node scripts/schema-fingerprint.mjs          prints the current fingerprint
//        node scripts/schema-fingerprint.mjs --write  writes it into src/core/schema/fingerprint.ts (do this only with a note in PROGRESS)
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_DIR = fileURLToPath(new URL('../src/core/schema/', import.meta.url));
const FINGERPRINT_FILE = 'fingerprint.ts';

/** The files the fingerprint covers: every .ts file in the schema folder except tests and the fingerprint file. */
export function schemaFiles() {
  return readdirSync(SCHEMA_DIR)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== FINGERPRINT_FILE)
    .sort();
}

export function schemaFingerprint() {
  const hash = createHash('sha256');
  for (const name of schemaFiles()) {
    hash.update(`${name}\0${readFileSync(join(SCHEMA_DIR, name), 'utf8').replace(/\r\n/g, '\n')}\0`);
  }
  return hash.digest('hex');
}

export const FINGERPRINT_PATH = join(SCHEMA_DIR, FINGERPRINT_FILE);

export function fingerprintSource(value) {
  return `/**\n * The fingerprint of src/core/schema/*.ts (step 8.4s, S6): a change to those files without a new fingerprint fails \`npm run check\`.\n * Change it only with the schema version bump, or with a note in docs/PROGRESS.md saying why the version stays.\n * Update: \`node scripts/schema-fingerprint.mjs --write\`.\n */\nexport const SCHEMA_FINGERPRINT = '${value}';\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const value = schemaFingerprint();
  if (process.argv.includes('--write')) {
    writeFileSync(FINGERPRINT_PATH, fingerprintSource(value));
    console.log(`written ${value}`);
  } else console.log(value);
}
