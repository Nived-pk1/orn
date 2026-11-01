/**
 * What the Syllabus view decides without drawing (7.6 D): the version choices grouped by exam, the default version, the status in words, the
 * totals line, the rows of a unit's tree as a flat list (for paging), and "Gaps only". Pure; the page itself is the core's (`@/core/syllabus`).
 */
import { plural } from '@/core/text';
import type { SyllabusTotals, TopicNode, UnitView } from '@/core/syllabus';
import type { CanonicalState, Exam, ExamVersion } from '@/core/schema';

/** Rows of a unit drawn at once (and rows of one group of "What changed"). */
export const ROWS_PAGE = 60;
/** Units drawn at once. */
export const UNITS_PAGE = 20;

export interface VersionGroup {
  readonly examId: string;
  readonly examName: string;
  /** Newest first (year, then label). */
  readonly versions: readonly { readonly id: string; readonly label: string; readonly examId: string }[];
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function versionGroups(state: CanonicalState): readonly VersionGroup[] {
  const exams = state.records.exam as Readonly<Record<string, Exam>>;
  const byExam = new Map<string, ExamVersion[]>();
  for (const version of Object.values(state.records.exam_version as Readonly<Record<string, ExamVersion>>)) byExam.set(version.examId, [...(byExam.get(version.examId) ?? []), version]);
  const nameOf = (examId: string): string => exams[examId]?.name ?? 'An exam that is not in this dataset';
  return [...byExam.entries()]
    .map(([examId, versions]) => ({
      examId,
      examName: nameOf(examId),
      versions: [...versions].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || cmp(a.label, b.label) || cmp(a.id, b.id)).map((v) => ({ id: v.id as string, label: v.label, examId })),
    }))
    .sort((a, b) => cmp(a.examName, b.examName) || cmp(a.examId, b.examId));
}

/** The active exam scope's version when it is in the data, else the newest version of the first exam; undefined when there is none. */
export function defaultVersionId(groups: readonly VersionGroup[], activeVersionId: string | undefined): string | undefined {
  const ids = groups.flatMap((g) => g.versions.map((v) => v.id));
  if (activeVersionId !== undefined && ids.includes(activeVersionId)) return activeVersionId;
  return groups[0]?.versions[0]?.id;
}

export function statusWords(status: ExamVersion['status']): string {
  return status === 'official' ? 'Official' : status === 'provisional' ? 'Provisional — not verified against the published syllabus' : 'Draft';
}

export function effectiveWords(from: string | undefined, to: string | undefined): string | undefined {
  if (from !== undefined && to !== undefined) return `Effective ${from} to ${to}`;
  if (from !== undefined) return `Effective from ${from}`;
  if (to !== undefined) return `Effective until ${to}`;
  return undefined;
}

export function totalsWords(totals: SyllabusTotals): string {
  return `${plural(totals.topics, 'topic', 'topics')} in this syllabus · ${totals.withContent} with content · ${totals.gaps} not covered yet`;
}

export interface Row {
  readonly node: TopicNode;
  readonly depth: number;
}

/** The unit's tree as rows in tree order (depth first), each with its depth. */
export function rowsOf(unit: UnitView): readonly Row[] {
  const rows: Row[] = [];
  const visit = (nodes: readonly TopicNode[], depth: number): void => {
    for (const node of nodes) {
      rows.push({ node, depth });
      visit(node.children, depth + 1);
    }
  };
  visit(unit.roots, 0);
  return rows;
}

/** "Gaps only": a unit that has a gap, with only its gap rows (flat, in tree order); units with no gap are left out. */
export function gapsOnly(units: readonly UnitView[]): readonly { readonly unit: UnitView; readonly rows: readonly Row[] }[] {
  return units.flatMap((unit) => {
    const rows = rowsOf(unit)
      .filter((row) => row.node.gap)
      .map((row) => ({ node: row.node, depth: 0 }));
    return rows.length === 0 ? [] : [{ unit, rows }];
  });
}
