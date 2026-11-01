/**
 * The nine group keys of a chapter page, in study order (7.3c A1). Alone in a tiny module so the saved Chapters state can name them
 * without pulling the chapter index or the list code into the first paint.
 */
export type GroupKey = 'concepts' | 'reactions' | 'named' | 'mechanisms' | 'caveats' | 'compounds' | 'reagents' | 'routes' | 'transformations';

export const CHAPTER_GROUP_KEYS: readonly GroupKey[] = ['concepts', 'reactions', 'named', 'mechanisms', 'caveats', 'compounds', 'reagents', 'routes', 'transformations'];
