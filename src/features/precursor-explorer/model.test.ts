/**
 * The Precursors view's bookkeeping (step 7.2a D3, D4, D5, D6), pure: the engine query from the choices, the words of a found route and of a
 * stored one, and dropping saved choices that name nothing any more.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE_MAX_STEPS, DEFAULT_TRAVERSAL_LIMITS, searchRoutes } from '@/core/graph';
import { DEFAULT_PRECURSOR_STEPS } from '@/ui/state';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import { outsideReactionIds, pruneChoices, queryOf, routeViewOf, savedRoutesFor } from './model';

const ctx = contextOf(demoState());
const choices = { target: { kind: 'species', id: 'spc_propan-2-ol' }, startFrom: [{ kind: 'species', id: 'spc_ethanol' }], maxSteps: 3, onlyListed: false, onlyInScope: false } as const;

describe('queryOf', () => {
  it('the view\'s default steps are the engine\'s default', () => {
    expect(DEFAULT_PRECURSOR_STEPS).toBe(DEFAULT_ROUTE_MAX_STEPS);
  });
  it('is the choices as the engine asks: target, steps, start-from, the engine\'s own limits', () => {
    const query = queryOf(choices, []);
    expect(query).toMatchObject({ target: choices.target, startFrom: choices.startFrom, maxSteps: 3, assumption: 'side_inputs_available', limits: DEFAULT_TRAVERSAL_LIMITS });
    expect(query.excludeReactionIds).toBeUndefined();
  });
  it('"only the listed" is the engine\'s only_listed_inputs, and only with a start-from', () => {
    expect(queryOf({ ...choices, onlyListed: true }, []).assumption).toBe('only_listed_inputs');
    expect(queryOf({ ...choices, startFrom: [], onlyListed: true }, []).assumption).toBe('side_inputs_available');
    expect(queryOf({ ...choices, startFrom: [] }, []).startFrom).toBeUndefined();
  });
  it('outside reactions are excluded through the engine when "only <exam version>" is on', () => {
    expect(queryOf({ ...choices, onlyInScope: true }, ['rxn_a', 'rxn_b']).excludeReactionIds).toEqual(['rxn_a', 'rxn_b']);
    expect(queryOf(choices, ['rxn_a']).excludeReactionIds).toBeUndefined();
  });
});

describe('outsideReactionIds', () => {
  it('the reactions the scope calls outside, in ID order', () => {
    const ids = Object.keys(ctx.state.records.reaction).sort();
    expect(outsideReactionIds(ctx.state, (ref) => (ref.id === ids[2] || ref.id === ids[0] ? 'outside' : 'official'))).toEqual([ids[0], ids[2]]);
    expect(outsideReactionIds(ctx.state, undefined)).toEqual([]);
  });
});

describe('pruneChoices', () => {
  it('drops a target and starting materials that name nothing, and says so', () => {
    const result = pruneChoices({ ...choices, target: { kind: 'species', id: 'spc_gone' }, startFrom: [{ kind: 'species', id: 'spc_ethanol' }, { kind: 'class', id: 'cls_gone' }] }, ctx.state);
    expect(result.dropped).toBe(true);
    expect(result.choices.target).toBeNull();
    expect(result.choices.startFrom).toEqual([{ kind: 'species', id: 'spc_ethanol' }]);
  });
  it('whole choices are kept and not dropped', () => {
    expect(pruneChoices(choices, ctx.state)).toEqual({ dropped: false, choices });
  });
});

describe('routeViewOf (a found route)', () => {
  const found = searchRoutes(ctx, { ...queryOf(choices, []), maxRoutes: 10, limits: DEFAULT_TRAVERSAL_LIMITS });
  it('says "n steps from <first substance>" and numbers the steps with names and the arrow text', () => {
    const route = routeViewOf(found.routes[0] as never, ctx);
    expect(route.heading).toBe('2 steps from Ethanol');
    expect(route.steps.map((s) => `${s.n}. ${s.from} → ${s.to}`)).toEqual(['1. Ethanol → Ethanal', '2. Ethanal → Propan-2-ol']);
    expect(route.steps[0]?.reactionName).toMatch(/ethanol/i);
    expect(route.steps.every((s) => s.warnings.length === 0)).toBe(true);
    expect(route.steps[0]?.arrow.length).toBeGreaterThan(0);
  });
  it('a class-level match carries its plain words, never the engine\'s text', () => {
    const flagged = { ...(found.routes[0] as object), steps: (found.routes[0]?.steps ?? []).map((s) => ({ ...s, warnings: ['class-level match, verify substrate scope'] })) };
    const route = routeViewOf(flagged as never, ctx);
    expect(route.steps[0]?.warnings).toEqual(['Matched through a class: check that this compound fits.']);
  });
});

describe('savedRoutesFor (stored routes that end at the target)', () => {
  it('lists the demo\'s curated route for phenol, name first, steps in order, nothing else', () => {
    const routes = savedRoutesFor({ kind: 'species', id: 'spc_phenol' }, ctx);
    expect(routes.map((r) => r.name)).toEqual(['Aniline → phenol']);
    expect(routes[0]?.steps.map((s) => s.n)).toEqual([1, 2]);
    expect(routes[0]?.heading).toBe('2 steps');
  });
  it('a target no stored route ends at has none', () => {
    expect(savedRoutesFor({ kind: 'species', id: 'spc_ethanol' }, ctx)).toEqual([]);
  });
});

describe('"Continue from here" (step C6)', () => {
  const link = (slug: string, from: string, to: string) =>
    reaction({ slug, name: slug, scope: 'specific', participants: [{ ref: sp(from), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp(to) }] }] });
  /** src -> s0 -> s1 -> s2 -> s3 -> s4 -> s5: six levels back from s5. */
  const chain = (withSource: boolean) => {
    const names = ['src', 's0', 's1', 's2', 's3', 's4', 's5'];
    const records = names.slice(withSource ? 0 : 1).map((n) => species(n, n));
    const links = names.slice(withSource ? 0 : 1, -1).map((n) => link(`l-${n}`, n, names[names.indexOf(n) + 1] as string));
    return contextOf(stateOf(...records, ...links));
  };
  const routeOf = (ctx: ReturnType<typeof chain>, maxSteps: number) =>
    routeViewOf(searchRoutes(ctx, { target: sp('s5'), maxSteps, maxRoutes: 10, assumption: 'side_inputs_available', limits: DEFAULT_TRAVERSAL_LIMITS }).routes.at(-1) as never, ctx);
  it('the first step of a 5-step route whose starting compound has its own makers offers Continue from here, with that compound', () => {
    const view = routeOf(chain(true), 5);
    expect(view.steps).toHaveLength(5);
    expect(view.steps[0]?.continueFrom).toEqual({ kind: 'species', id: 'spc_s0' });
    expect(view.steps.slice(1).every((s) => s.continueFrom === undefined)).toBe(true);
  });
  it('no offer when the starting compound has no makers, or the route is shorter than 5 steps', () => {
    expect(routeOf(chain(false), 5).steps[0]?.continueFrom).toBeUndefined();
    expect(routeOf(chain(true), 4).steps[0]?.continueFrom).toBeUndefined();
  });
});
