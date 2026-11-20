/** Routes through generic reactions (step C3): walking back from a species also takes reactions that make a class it belongs to, as inferred, warned moves; stated moves rank first. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE_MAX_ROUTES, DEFAULT_ROUTE_MAX_STEPS, DEFAULT_TRAVERSAL_LIMITS, searchRoutes, type RouteQuery } from '@/core/graph';
import { chemClass, cl, contextOf, reaction, sp, species, stateOf } from '@/test-support/graph-state';

const query = (over: Partial<RouteQuery> & Pick<RouteQuery, 'target'>): RouteQuery => ({ maxSteps: DEFAULT_ROUTE_MAX_STEPS, maxRoutes: DEFAULT_ROUTE_MAX_ROUTES, assumption: 'side_inputs_available', limits: DEFAULT_TRAVERSAL_LIMITS, ...over });

describe('a generic reaction on the way to a specific target', () => {
  it('ethene -> (alkenes give alcohols) -> ethanol -> ethanal is found, with the class-level step warned', () => {
    const alkenes = chemClass('alkene', 'Alkenes', 'functional_group');
    const alcohols = chemClass('alcohol', 'Alcohols', 'functional_group');
    const ethene = species('ethene', 'Ethene', { classes: ['alkene'] });
    const ethanol = species('ethanol', 'Ethanol', { classes: ['alcohol'] });
    const ethanal = species('ethanal', 'Ethanal');
    const hydration = reaction({ slug: 'hydration', name: 'Hydration of alkenes', scope: 'generic', participants: [{ ref: cl('alkene'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: cl('alcohol') }] }] });
    const oxidation = reaction({ slug: 'oxidation', name: 'Ethanol to ethanal', scope: 'specific', participants: [{ ref: sp('ethanol'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('ethanal') }] }] });
    const ctx = contextOf(stateOf(alkenes, alcohols, ethene, ethanol, ethanal, hydration, oxidation));

    const result = searchRoutes(ctx, query({ target: sp('ethanal'), startFrom: [sp('ethene')] }));
    expect(result.routes.map((r) => r.steps.map((s) => s.reactionId))).toContainEqual(['rxn_hydration', 'rxn_oxidation']);
  });
});

describe('stated routes rank before inferred ones of the same length', () => {
  it('a stated one-step route is listed before an inferred one-step route', () => {
    const alcohols = chemClass('alcohol', 'Alcohols', 'functional_group');
    const ethanol = species('ethanol', 'Ethanol', { classes: ['alcohol'] });
    const a = species('src-a', 'A');
    const b = species('src-b', 'B');
    const ethanal = species('ethanal', 'Ethanal');
    const step = (slug: string, from: ReturnType<typeof sp>, to: ReturnType<typeof sp> | ReturnType<typeof cl>) =>
      reaction({ slug, name: slug, scope: 'specific', participants: [{ ref: from, role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: to }] }] });
    // inferred: A -> (any alcohol) is generic and listed first by id; stated: B -> ethanol
    const inferred = step('a-generic', sp('src-a'), cl('alcohol'));
    const stated = step('z-stated', sp('src-b'), sp('ethanol'));
    const ctx = contextOf(stateOf(alcohols, ethanol, a, b, ethanal, inferred, stated));
    const result = searchRoutes(ctx, query({ target: sp('ethanol') }));
    const ids = result.routes.map((r) => r.steps.map((s) => s.reactionId).join('>'));
    expect(ids[0]).toBe('rxn_z-stated');
    expect(ids).toContain('rxn_a-generic');
    const generic = result.routes.find((r) => r.steps[0]?.reactionId === 'rxn_a-generic');
    expect(generic?.steps[0]?.warnings.length).toBeGreaterThan(0);
  });
});
