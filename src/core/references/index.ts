import { createReferenceEngine } from './engine';

export type { DeleteImpact, ExtractedReference, ReferenceEngine, Referrer } from './contracts';
export { createReferenceEngine } from './engine';
export { formatPath, matchPath, parsePath } from './paths';
export type { PathMatch, PathSegment, PathToken } from './paths';

/** The engine over the canonical registry. */
export const referenceEngine = createReferenceEngine();
