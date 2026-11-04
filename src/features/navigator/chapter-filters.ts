/**
 * The map's chapter as a request filter (step 8.2a, D2). A chapter's reactions are the ones the topic filter already finds (`recordsInTopic`,
 * transitive): the reactions mapped to the chapter topic or to a topic below it, which is the 7.3b chapter rule on a tree where chapters
 * are not nested. No contract or schema change: `ViewFilters.topicIds` exists and was unused by the map.
 */
import type { ViewFilters } from '@/core/schema';

export function chapterFilters(filters: ViewFilters, chapterId: string | null): ViewFilters {
  return chapterId === null ? filters : { ...filters, topicIds: [chapterId as ViewFilters['topicIds'][number]] };
}
