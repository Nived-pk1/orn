/**
 * The editors' entry points as DATA (entry room, exams step part A): one table drives the Workbench buttons, the phone More buttons and the
 * palette's "New ..." commands. This module is a lazy chunk, loaded by `EditorsProvider` after the first paint, so the titles, the palette
 * words and the list of full-editor kinds are not in the entry chunk. A new kind with an editor is one row here. Studio only. No chemistry.
 */
import type { RecordKind } from '@/core/schema';
import { NAMES_KINDS } from '@/core/editing/names';

export interface NewEntry {
  readonly kind: RecordKind;
  /** The button and the palette title ("New species"). */
  readonly title: string;
  /** The palette command id: the title in lower case with dashes. */
  readonly paletteId: string;
  readonly keywords: readonly string[];
  /** The first Workbench button is drawn as the primary one. */
  readonly primary?: true;
}

const AUTHOR = ['author', 'workbench', 'draft'];
const entry = (kind: RecordKind, title: string, words: readonly string[], primary?: true): NewEntry => ({
  kind,
  title,
  paletteId: title.toLowerCase().replace(/ /g, '-'),
  keywords: [...words, ...AUTHOR],
  ...(primary === undefined ? {} : { primary }),
});

export const NEW_ENTRIES: readonly NewEntry[] = [
  entry('species', 'New species', ['create', 'add', 'compound'], true),
  entry('class', 'New class', ['create', 'add', 'group', 'functional group', 'family']),
  entry('reagent', 'New reagent', ['create', 'add', 'catalyst', 'oxidant']),
  entry('reaction', 'New reaction', ['create', 'add', 'equation', 'participants', 'stages']),
  entry('mechanism', 'New mechanism', ['create', 'add', 'steps', 'pathway', 'variants', 'arrow pushing']),
  entry('reference', 'New source', ['create', 'add', 'reference', 'textbook', 'book', 'citation', 'cite']),
  entry('concept', 'New concept', ['create', 'add', 'topic idea', 'reaction type', 'mechanism class', 'rule']),
  entry('named_reaction', 'New named reaction', ['create', 'add', 'name reaction']),
  entry('transformation', 'New transformation', ['create', 'add', 'conversion', 'functional group', 'class to class']),
  entry('relationship', 'New relationship', ['create', 'add', 'link', 'commonly confused', 'prerequisite', 'reverse of', 'competes']),
  entry('caveat', 'New caveat', ['create', 'add', 'exception', 'trap', 'limitation', 'common mistake', 'special case']),
  entry('route', 'New route', ['create', 'add', 'synthesis', 'steps', 'multi-step', 'sequence', 'how to make']),
  entry('topic', 'New topic', ['create', 'add', 'syllabus', 'chapter', 'subject', 'section', 'curriculum']),
  entry('topic_mapping', 'New topic mapping', ['create', 'add', 'map', 'place', 'syllabus', 'topic', 'curriculum']),
  entry('exam_relevance', 'New exam relevance', ['create', 'add', 'exam', 'scope', 'official', 'outside', 'enrichment', 'syllabus']),
  entry('exam', 'New exam', ['create', 'add', 'board', 'entrance', 'syllabus', 'curriculum']),
  entry('exam_version', 'New exam version', ['create', 'add', 'year', 'syllabus', 'units', 'coverage', 'curriculum']),
  entry('navigator_anchor', 'New map family', ['create', 'add', 'hub', 'anchor', 'overview', 'map', 'group', 'class']),
];

/** The kinds whose editor is the full one (the others edit names only). */
export const FULL_EDITOR_KINDS: readonly string[] = NEW_ENTRIES.map((e) => e.kind);

/** The Quick entry command (step 6.7b): one text line becomes a reaction draft. The Workbench button, phone More and the palette read this one row. */
export interface QuickEntryRow {
  readonly title: string;
  readonly paletteId: string;
  readonly keywords: readonly string[];
}
export const QUICK_ENTRY: QuickEntryRow = { title: 'Quick entry', paletteId: 'quick-entry', keywords: ['reaction', 'line', 'type', 'text', 'parse', 'fast', ...AUTHOR] };

/** What the provider hands the window once this chunk has loaded. */
export interface EditorEntries {
  readonly entries: readonly NewEntry[];
  readonly fullEditorKinds: readonly string[];
  readonly namesKinds: readonly string[];
  readonly quickEntry: QuickEntryRow;
}
export const EDITOR_ENTRIES: EditorEntries = { entries: NEW_ENTRIES, fullEditorKinds: FULL_EDITOR_KINDS, namesKinds: NAMES_KINDS, quickEntry: QUICK_ENTRY };
