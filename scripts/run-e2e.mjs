// Step T (T1.1): `npm run e2e` = the parallel projects of the three engines, THEN the serial (timing-sensitive) ones, so a serial spec never shares the
// machine with another test. Any other Playwright argument is passed on to both passes. With an explicit --project the arguments go through as they are.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const run = (extra) => spawnSync('npx', ['playwright', 'test', ...extra, ...args], { stdio: 'inherit', shell: true }).status ?? 1;

if (args.some((arg) => arg === '--project' || arg.startsWith('--project='))) process.exit(run([]));
const parallel = run(['--project=chromium', '--project=firefox', '--project=webkit']);
const serial = run(['--project=chromium-serial', '--project=firefox-serial', '--project=webkit-serial']);
process.exit(parallel !== 0 ? parallel : serial);
