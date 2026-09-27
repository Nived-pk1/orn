/**
 * Gate A invariants that no other test names: INV-03, INV-06, INV-16, INV-17, INV-25. The rest of the
 * Phase 1 invariants are tested next to the code that enforces them (each test cites its INV ID).
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createIdFactory, documentToState } from '@/core/dataset';
import { coreIndexEngine } from '@/core/indexes/engine';
import { ANY_ID_PATTERN, LAYER_OF_KIND, REFERENCE_SPECS, type CanonicalState } from '@/core/schema';
import { validator } from '@/core/validation';
import { buildDemoDocument } from '@/test-support/demo';
import { edit } from '@/test-support/rule-harness';
import { must } from '@/test-support/state-fixture';

const demo = (() => {
  const result = documentToState(buildDemoDocument());
  if (!result.ok) throw new Error('duplicate IDs');
  return result.state;
})();
const findings = (state: CanonicalState) => validator.validateAll(state, coreIndexEngine.build(state, 0));

describe('INV-03 generated IDs are deterministic ULIDs and never derived from names', () => {
  const make = () => {
    let step = 0;
    return createIdFactory({ nowMs: () => 1_700_000_000_000 }, { next: () => ((step += 1) * 0.0137) % 1 });
  };
  it('the same clock and RNG give the same IDs; IDs are strictly increasing and well formed', () => {
    const [a, b] = [make(), make()];
    const first = ['spc', 'rxn', 'spc', 'cls'].map((prefix) => a.newId(prefix));
    expect(['spc', 'rxn', 'spc', 'cls'].map((prefix) => b.newId(prefix))).toEqual(first);
    for (const id of first) expect(id).toMatch(ANY_ID_PATTERN);
    expect(new Set(first).size).toBe(first.length);
    expect(first.map((id) => id.slice(4))).toEqual([...first.map((id) => id.slice(4))].sort());
  });
});

describe('INV-06 a published reaction has a reactant and an outcome with a product', () => {
  it('holds for every published reaction of the demo dataset', () => {
    for (const reaction of Object.values(demo.records.reaction)) {
      if (reaction.review.lifecycle !== 'published') continue;
      expect(reaction.participants.some((p) => p.role === 'reactant'), reaction.id).toBe(true);
      expect(reaction.outcomes.some((o) => o.products.length > 0), reaction.id).toBe(true);
    }
  });

  it('removing the last reactant of a published reaction is an ERROR (RXN-001); of a draft only a WARNING', () => {
    const published = edit(demo, 'reaction', 'rxn_ethanol-to-ethanal-pcc', (r) => {
      r.participants = r.participants.filter((p) => p.role !== 'reactant');
      r.stages = [];
    });
    const rxn001 = findings(published).find((f) => f.ruleId === 'RXN-001' && f.subject.id === 'rxn_ethanol-to-ethanal-pcc');
    expect(rxn001?.severity).toBe('error');
    const draft = edit(demo, 'reaction', 'rxn_benzene-nitration-draft', (r) => {
      r.participants = r.participants.filter((p) => p.role !== 'reactant');
    });
    expect(findings(draft).find((f) => f.ruleId === 'RXN-001')?.severity).toBe('warning');
  });
});

describe('INV-16 outcome → mechanism variant links resolve (ADV-055)', () => {
  it('the demo links resolve; a variant that is not in the linked mechanism is a blocking REF-005', () => {
    expect(findings(demo).filter((f) => f.ruleId === 'REF-005')).toEqual([]);
    const broken = edit(demo, 'reaction', 'rxn_r-2-bromobutane-aq-koh', (r) => {
      const link = must(r.outcomes[0]?.mechanism);
      link.variantId = 'mvr_no-such-variant' as typeof link.variantId;
    });
    const hit = findings(broken).find((f) => f.ruleId === 'REF-005' && f.subject.id === 'rxn_r-2-bromobutane-aq-koh');
    expect(hit?.severity).toBe('error');
  });
});

describe('INV-17 assets are optional and chemistry never depends on them', () => {
  it('no chemistry, knowledge or curriculum record can reference an asset', () => {
    const toAsset = REFERENCE_SPECS.filter(
      (spec) => LAYER_OF_KIND[spec.owner] <= 3 && (spec.target.type === 'id' ? spec.target.kind === 'asset' : spec.target.type === 'ref' && spec.target.kinds.includes('asset')),
    );
    expect(toAsset).toEqual([]);
  });

  it('the demo dataset has no assets and validates without ERROR', () => {
    expect(Object.keys(demo.records.asset)).toEqual([]);
    expect(findings(demo).filter((f) => f.severity === 'error')).toEqual([]);
  });
});

describe('INV-25 code never branches on specific record IDs or names', () => {
  it('the hardcode guard passes against the demo dataset and counts its names', () => {
    const out = execFileSync(process.execPath, ['scripts/check-hardcode.mjs'], { cwd: new URL('../../', import.meta.url), encoding: 'utf8' });
    const match = /(\d+) ids, (\d+) names checked/.exec(out);
    expect(Number(match?.[1])).toBeGreaterThan(500);
    expect(Number(match?.[2])).toBeGreaterThan(150);
  });
});
