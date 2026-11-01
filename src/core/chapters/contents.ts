/**
 * One chapter's contents (7.3b C2): its records grouped by kind in the fixed study order; in each group the core records first, then
 * "Also used here" (supporting), then "Extra" (enrichment); inside each part the section-topic order, then the folded name, then the id.
 * The reactions of a group fold their examples (7.3a `foldExamples`, the whole group is one list). Pure and derived.
 */
import { foldExamples } from '../graph/family/examples';
import { fold } from '../text/normalizer';
import type { CanonicalState, RecordRef } from '../schema';
import { isUnwrittenConcept } from './written';
import type { ChapterContents, ChapterGroup, ChapterIndex, ChapterPart, MappingRole } from './types';
import { CHAPTER_GROUPS, NO_CHAPTER } from './types';

export interface ContentsOptions {
  /** The record's display name (the app knows how names are shown); used for the order inside a part. */
  readonly nameOf: (ref: RecordRef) => string;
  /** Studio: keep the concepts with no text apart in `unwritten`. Study (the default): they are left out altogether. */
  readonly showUnwritten?: boolean;
}

const PARTS: readonly { readonly part: MappingRole; readonly title: string | undefined }[] = [
  { part: 'core', title: undefined },
  { part: 'supporting', title: 'Also used here' },
  { part: 'enrichment', title: 'Extra' },
];

interface Entry {
  readonly ref: RecordRef;
  readonly role: MappingRole;
  readonly sectionPos: number;
}

export function chapterContents(state: CanonicalState, index: ChapterIndex, chapterId: string, options: ContentsOptions): ChapterContents {
  const known = chapterId === NO_CHAPTER || index.chapters.some((chapter) => chapter.id === chapterId);
  if (!known) return { chapterId, groups: [] };
  const groups: ChapterGroup[] = [];
  for (const group of CHAPTER_GROUPS) {
    const entries: Entry[] = [];
    const unwritten: Entry[] = [];
    for (const kind of group.kinds) {
      for (const id of Object.keys(state.records[kind] as Record<string, unknown>)) {
        const ref = { kind, id } as RecordRef;
        const memberships = index.membershipsOf(ref);
        const into = isUnwrittenConcept(state, ref) ? unwritten : entries;
        if (chapterId === NO_CHAPTER) {
          if (memberships.length === 0) into.push({ ref, role: 'core', sectionPos: 0 });
          continue;
        }
        const mine = memberships.find((membership) => membership.chapterId === chapterId);
        if (mine !== undefined) into.push({ ref, role: mine.role, sectionPos: mine.sectionPos });
      }
    }
    const kept = options.showUnwritten === true ? unwritten : [];
    if (entries.length === 0 && kept.length === 0) continue;
    const names = new Map([...entries, ...kept].map((entry) => [entry.ref.id, fold(options.nameOf(entry.ref))]));
    const inOrder = (list: readonly Entry[]): Entry[] => [...list].sort((a, b) => a.sectionPos - b.sectionPos || ((names.get(a.ref.id) ?? '') < (names.get(b.ref.id) ?? '') ? -1 : (names.get(a.ref.id) ?? '') > (names.get(b.ref.id) ?? '') ? 1 : a.ref.id < b.ref.id ? -1 : a.ref.id > b.ref.id ? 1 : 0));
    const ordered = inOrder(entries);

    let shown: ReadonlySet<string> | undefined;
    let folding: ReturnType<typeof foldExamples> | undefined;
    if (group.key === 'reactions') {
      const reactions = state.records.reaction;
      folding = foldExamples(
        PARTS.flatMap((p) => ordered.filter((entry) => entry.role === p.part).map((entry) => entry.ref.id)),
        { instanceOf: (id) => reactions[id]?.instanceOfId, isGeneric: (id) => reactions[id]?.scope === 'generic', sortKey: (id) => fold(reactions[id]?.name ?? id) },
      );
      shown = new Set(folding.shown);
    }
    const parts: ChapterPart[] = [];
    for (const { part, title } of PARTS) {
      const refs = ordered.filter((entry) => entry.role === part && (shown === undefined || shown.has(entry.ref.id))).map((entry) => entry.ref);
      if (refs.length > 0) parts.push({ part, title, refs });
    }
    const count = parts.reduce((sum, p) => sum + p.refs.length, 0);
    groups.push({
      key: group.key,
      title: group.title,
      count,
      parts,
      ...(kept.length === 0 ? {} : { unwritten: inOrder(kept).map((entry) => entry.ref) }),
      ...(folding === undefined ? {} : { examplesOf: folding.examplesOf, exampleOf: folding.exampleOf, exampleCount: folding.folded }),
    });
  }
  return { chapterId, groups };
}
