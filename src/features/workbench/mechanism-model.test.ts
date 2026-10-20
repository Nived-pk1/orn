/** The mechanism editor's identity, summary and variants as recipes (step 6.5a part 3): text exactly as typed, an empty optional text is ABSENT. */
import { describe, expect, it } from 'vitest';
import { addVariant, mechanismViewOf, moveVariant, removeVariant, setSummary, setVariantApplicability, setVariantLabel, setVariantRateLaw, variantsViewOf, variantSummary } from './mechanism-model';

type Fields = Record<string, unknown>;
const base = (): Fields => ({
  kind: 'mechanism',
  id: 'mec_x',
  name: 'X',
  aliases: [],
  variants: [
    { id: 'mvr_a', label: 'Acid', applicability: 'Dilute *acid*\nsecond line', steps: [{ id: 'mst_1' }, { id: 'mst_2' }], rateLaw: 'rate = k[A]' },
    { id: 'mvr_b', label: 'Base', steps: [] },
  ],
  review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] },
});
const run = (recipe: (draft: Fields) => void, draft: Fields = base()): Fields => {
  const copy = structuredClone(draft);
  recipe(copy);
  return copy;
};

describe('summary', () => {
  it('is stored exactly as typed and an empty text removes the field', () => {
    expect(run(setSummary('  *x*  \n'))['summary']).toBe('  *x*  \n');
    expect(Object.hasOwn(run(setSummary(''), { ...base(), summary: 'old' }), 'summary')).toBe(false);
  });
});

describe('variants', () => {
  it('a new variant has its ID, its label as typed and no steps', () => {
    const next = run(addVariant('mvr_new', 'SN1 pathway'));
    expect((next['variants'] as Fields[]).at(-1)).toEqual({ id: 'mvr_new', label: 'SN1 pathway', steps: [] });
  });
  it('label, applicability and rate law: as typed; empty optional texts are absent', () => {
    const next = run((d) => {
      setVariantLabel(1, ' Base ')(d);
      setVariantApplicability(1, 'when hot')(d);
      setVariantRateLaw(1, 'rate = k')(d);
    });
    expect((next['variants'] as Fields[])[1]).toEqual({ id: 'mvr_b', label: ' Base ', applicability: 'when hot', rateLaw: 'rate = k', steps: [] });
    const cleared = run((d) => {
      setVariantApplicability(0, '')(d);
      setVariantRateLaw(0, '')(d);
    });
    expect(Object.hasOwn((cleared['variants'] as Fields[])[0] as Fields, 'applicability')).toBe(false);
    expect(Object.hasOwn((cleared['variants'] as Fields[])[0] as Fields, 'rateLaw')).toBe(false);
  });
  it('move swaps neighbours and ignores the ends; remove takes one out', () => {
    expect((run(moveVariant(0, 1))['variants'] as Fields[]).map((v) => v['id'])).toEqual(['mvr_b', 'mvr_a']);
    expect((run(moveVariant(0, -1))['variants'] as Fields[]).map((v) => v['id'])).toEqual(['mvr_a', 'mvr_b']);
    expect((run(removeVariant(0))['variants'] as Fields[]).map((v) => v['id'])).toEqual(['mvr_b']);
  });
  it('the summary line is "<label> · <n> steps · <applicability>" with the applicability on one line, cut at 80 characters', () => {
    const views = variantsViewOf(base());
    expect(variantSummary(views[0] as never)).toBe('Acid · 2 steps · Dilute *acid* second line');
    expect(variantSummary(views[1] as never)).toBe('Base · 0 steps');
    const one = variantsViewOf(run((d) => ((d['variants'] as Fields[])[1] = { id: 'mvr_b', label: 'B', steps: [{}], applicability: 'x'.repeat(100) })));
    expect(variantSummary(one[1] as never)).toBe(`B · 1 step · ${'x'.repeat(79)}…`);
  });
});

describe('view', () => {
  it('reads name, aliases, summary and review words with empty defaults', () => {
    expect(mechanismViewOf({})).toMatchObject({ name: '', aliases: [], summary: '', lifecycle: 'draft', status: 'unreviewed' });
    expect(mechanismViewOf({ name: 'N', summary: 'S', aliases: ['a'] })).toMatchObject({ name: 'N', summary: 'S', aliases: ['a'] });
  });
});
