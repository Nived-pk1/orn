/**
 * Step 5.1d, item j (informal; run once, alone; REPORTED, nothing decided): what `FindingStore.counts()` costs after a commit at the
 * design tier. `counts()` itself returns a tally kept by the store; the tally is recomputed over EVERY finding whenever a commit
 * changes any finding, so the cost of a commit is in the recount (a second subscription reads `counts()` on each notification, so
 * the UI pays it once per commit). Run: `npx tsx tests/measure/findings-counts.measure.ts`.
 */
import { createCanonicalStore } from '@/core/commands';
import { tierState } from '@/test-support/perf-kit';
import { withFields } from '@/test-support/command-kit';
import { must } from '@/test-support/state-fixture';

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] as number;
const now = (): number => performance.now();

const store = createCanonicalStore({ initial: tierState('design', 'dense'), validateInitial: true });
const total = store.findings.all().length;
console.log(`findings in the store after the initial validation: ${total}; counts ${JSON.stringify(store.findings.counts())}`);

let notified = 0;
store.findings.subscribe(() => {
  notified += 1;
  store.findings.counts();
});

const ids = Object.keys(store.getState().records.species);
const edit = (n: number): number => {
  const record = must(store.getState().records.species[ids[n % ids.length] as string]);
  const began = now();
  const answer = store.dispatch({ label: `measure-${n}`, commands: [{ type: 'record.update', record: withFields(record, { notes: `n${n}` }) }] });
  const took = now() - began;
  if (!answer.ok) throw new Error('the commit was refused');
  return took;
};

const dispatches = Array.from({ length: 30 }, (_, i) => edit(i));
console.log(`commit of one species edit (dispatch, with the findings subscription): median ${median(dispatches).toFixed(2)} ms, max ${Math.max(...dispatches).toFixed(2)} ms; finding notifications ${notified} of 30 commits`);

const reads = Array.from({ length: 1_000 }, () => {
  const began = now();
  store.findings.counts();
  return now() - began;
});
console.log(`counts() read after a commit: median ${(median(reads) * 1000).toFixed(2)} us over 1,000 reads`);

const sample = must(store.findings.all()[0]);
const sameLevel = store.findings.bySubject(sample.subject).filter((finding) => finding.level === sample.level);
const recounts = Array.from({ length: 30 }, (_, i) => {
  const began = now();
  store.findings.replaceForSubjects([sample.subject], i % 2 === 0 ? [] : sameLevel, sample.level);
  return now() - began;
});
console.log(`replaceForSubjects of one subject (the recount over ${total} findings runs when anything changes): median ${median(recounts).toFixed(3)} ms`);
