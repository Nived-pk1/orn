/** Scope cost: one pass over 5,000 mapped reactions with a 600-row syllabus, median of 5 runs at most 20 ms (the coverage table and parent map are built once per createScopeOf). */
import { describe, expect, it } from 'vitest';
import { examId, examVersion, examVersionId, topic, topicMapping } from '@/test-support/curriculum-kit';
import { contextOf, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import { createScopeOf } from '@/core/graph/scope';

describe('scope of every reaction', () => {
  it('one pass over 5,000 mapped reactions under a 600-row syllabus stays under 20 ms median', () => {
    const TOPICS = 600;
    const REACTIONS = 5000;
    const records: Parameters<typeof stateOf>[number][] = [species('sp-a', 'A'), species('sp-b', 'B')];
    const coverage: { topic: string; coverage: 'included' | 'excluded' }[] = [];
    for (let t = 0; t < TOPICS; t += 1) {
      records.push(topic(`t${t}`, `Topic ${t}`));
      coverage.push({ topic: `t${t}`, coverage: t % 7 === 0 ? 'excluded' : 'included' });
    }
    for (let r = 0; r < REACTIONS; r += 1) {
      records.push(reaction({ slug: `r${r}`, name: `R${r}`, scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] }));
      records.push(topicMapping(`m${r}`, `t${r % TOPICS}`, { kind: 'reaction', id: `rxn_r${r}` }, 'core'));
    }
    records.push(examVersion('v1', 'jee-main', coverage));
    const ctx = contextOf(stateOf(...records));
    const scopeOf = createScopeOf(ctx.indexes, examId('jee-main'), examVersionId('v1'));
    const times: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const t0 = performance.now();
      let outside = 0;
      for (let r = 0; r < REACTIONS; r += 1) if (scopeOf({ kind: 'reaction', id: `rxn_r${r}` }) === 'outside') outside += 1;
      times.push(performance.now() - t0);
      expect(outside).toBeGreaterThan(0);
    }
    times.sort((a, b) => a - b);
    const median = times[2] as number;
    console.log(`scope pass over ${REACTIONS} reactions, ${TOPICS} coverage rows: median ${median.toFixed(1)} ms (runs: ${times.map((t) => t.toFixed(1)).join(', ')})`);
    expect(median).toBeLessThan(20);
  });
});
