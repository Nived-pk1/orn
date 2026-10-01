/**
 * A hand-made `SearchDocument` for the search tests (step 4.5): every required field, overridable. Test-only.
 */
import type { SearchDocument } from '@/search/contracts';

export function doc(id: string, over: Partial<SearchDocument> & { readonly name?: string } = {}): SearchDocument {
  const { name, ...rest } = over;
  const title = name ?? over.title ?? id;
  return {
    id,
    kind: 'species',
    title,
    names: [title],
    aliases: [],
    text: '',
    textTruncated: false,
    tags: [],
    lifecycle: 'published',
    scopeRanks: {},
    facets: { reagentFamilies: [], topicIds: [], scopes: [], reviewStatus: 'unreviewed' },
    ...rest,
  };
}
