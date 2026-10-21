/**
 * The curriculum questions of the record pickers' port (step 6.6c): the topics in tree order, the topic mappings and exam relevance of a
 * record in words, the records mapped to a topic, the exams with their versions, and the navigator anchors (map families). Derived at
 * the moment it is asked from the canonical state; nothing is stored. Bounded; no chemistry.
 */
import type { CanonicalState, ExamVersion, NavigatorAnchor, Topic } from '@/core/schema';
import type { CurriculumLine, MapFamilyChoice, RecordPickerPort, TopicChoice } from '@/features/workbench';

/** Most topics, lines and families one list holds (a bound, not a truncation: the demo has 27 topics). */
export const MAX_CURRICULUM_LINES = 500;

type Curriculum = Pick<RecordPickerPort, 'topics' | 'topicLinesOf' | 'mappedRecordsOf' | 'exams' | 'versionsOf' | 'relevanceLinesOf' | 'mapFamilies' | 'mapFamilyOf'>;

const byId = <T extends { readonly id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byOrder = (a: Topic, b: Topic): number => a.order - b.order || byId(a, b);

export function createCurriculumPort(state: () => CanonicalState, nameOf: (kind: string, id: string) => string, kindWordsOf: (kind: string, id: string) => string): Curriculum {
  const topicName = (id: string): string => state().records.topic[id as never]?.name ?? id;
  const versionLabel = (version: ExamVersion): string => version.label;
  return {
    topics() {
      const all = Object.values(state().records.topic);
      const children = new Map<string, Topic[]>();
      for (const topic of all) {
        const parent = topic.parentId !== undefined && Object.hasOwn(state().records.topic, topic.parentId) ? topic.parentId : '';
        children.set(parent, [...(children.get(parent) ?? []), topic]);
      }
      const out: TopicChoice[] = [];
      const seen = new Set<string>();
      const walk = (parent: string, depth: number): void => {
        for (const topic of (children.get(parent) ?? []).sort(byOrder)) {
          if (seen.has(topic.id) || out.length >= MAX_CURRICULUM_LINES || depth > 32) continue;
          seen.add(topic.id);
          out.push({ id: topic.id, name: topic.name, topicKind: topic.topicKind, depth, order: topic.order, ...(topic.parentId === undefined ? {} : { parentId: topic.parentId }) });
          walk(topic.id, depth + 1);
        }
      };
      walk('', 0);
      return out;
    },
    topicLinesOf(ref) {
      return Object.values(state().records.topic_mapping)
        .filter((m) => m.target.kind === ref.kind && m.target.id === ref.id)
        .sort(byId)
        .slice(0, MAX_CURRICULUM_LINES)
        .map((m) => ({ id: m.id, topicId: m.topicId, words: `${topicName(m.topicId)} · ${m.role}` }));
    },
    mappedRecordsOf(topicId) {
      return Object.values(state().records.topic_mapping)
        .filter((m) => m.topicId === topicId)
        .sort(byId)
        .slice(0, MAX_CURRICULUM_LINES)
        .map((m) => ({ id: m.id, target: { kind: m.target.kind, id: m.target.id }, words: `${nameOf(m.target.kind, m.target.id)} (${kindWordsOf(m.target.kind, m.target.id)}) · ${m.role}` }));
    },
    exams: () =>
      Object.values(state().records.exam)
        .map((e) => ({ id: e.id as string, name: e.name }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || byId(a, b)),
    versionsOf: (examId) =>
      Object.values(state().records.exam_version)
        .filter((v) => v.examId === examId)
        .map((v) => ({ id: v.id as string, label: versionLabel(v) }))
        .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0) || byId(a, b)),
    relevanceLinesOf(ref) {
      const { exam, exam_version: versions } = state().records;
      return Object.values(state().records.exam_relevance)
        .filter((r) => r.target.kind === ref.kind && r.target.id === ref.id)
        .sort(byId)
        .slice(0, MAX_CURRICULUM_LINES)
        .map((r): CurriculumLine => {
          const examName = exam[r.examId]?.name ?? r.examId;
          const which = r.examVersionIds.length === 0 ? `${examName} (all versions)` : r.examVersionIds.map((v) => versions[v]?.label ?? v).join(', ');
          return { id: r.id, words: `${which} · ${r.scope}` };
        });
    },
    mapFamilies() {
      return Object.values(state().records.navigator_anchor)
        .sort(byId)
        .slice(0, MAX_CURRICULUM_LINES)
        .map(
          (a: NavigatorAnchor): MapFamilyChoice => ({
            id: a.id,
            targetId: a.target.id,
            name: a.label ?? nameOf(a.target.kind, a.target.id),
            order: a.order,
            ...(a.group === undefined ? {} : { group: a.group }),
            ...(a.tone === undefined ? {} : { tone: a.tone }),
            ...(a.cell === undefined ? {} : { cell: { column: a.cell.column, row: a.cell.row } }),
          }),
        );
    },
    mapFamilyOf: (classId) =>
      Object.values(state().records.navigator_anchor)
        .filter((a) => a.target.id === classId)
        .sort(byId)[0]?.id,
  };
}
