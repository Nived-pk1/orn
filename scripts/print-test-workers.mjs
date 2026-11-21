// Step T (T2): says at the start of `npm run check` how many test workers it uses and how big the machine is, so a timeout is read as "busy machine" at once.
import { availableParallelism, loadavg, totalmem } from 'node:os';

const raw = process.env.ORN_TEST_WORKERS;
const workers = raw === undefined || raw === '' ? '4 (default)' : raw;
const load = process.platform === 'win32' ? 'n/a on Windows' : loadavg()[0].toFixed(2);
console.log(`check: ${workers} test workers (ORN_TEST_WORKERS), ${availableParallelism()} cores, ${Math.round(totalmem() / 2 ** 30)} GB, load ${load}`);
