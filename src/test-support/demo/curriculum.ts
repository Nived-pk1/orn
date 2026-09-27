/**
 * Curriculum layer of the demo dataset: baseline topic tree (docs/JEE_ONTOLOGY.md §2), JEE Main and
 * JEE Advanced with one provisional version each, a mapping for every reaction, and one explicit override.
 * Everything here is REVIEW REQUIRED: exam coverage has not been checked against official syllabi.
 */
import type { Exam, ExamRelevance, ExamVersion, RecordRef, Topic, TopicMapping } from './types';
import { ident, meta, rec } from './kit';
import { rxnId } from './reaction-kit';

const UNVERIFIED = ['Exam coverage and the baseline topic tree are unverified against the official syllabi.'];
const review = { status: 'review_required', reasons: UNVERIFIED } as const;

const topicId = (body: string) => ident<Topic['id']>('top', body);
const ROOT = 'organic-chemistry';

type Kind = Topic['topicKind'];
const CHAPTERS: readonly (readonly [string, string, readonly string[]])[] = [
  ['goc', 'Some basic principles and techniques (GOC)', ['GOC']],
  ['stereochemistry', 'Stereochemistry', []],
  ['hydrocarbons', 'Hydrocarbons', []],
  ['haloalkanes-haloarenes', 'Haloalkanes and haloarenes', ['Alkyl and aryl halides']],
  ['alcohols-phenols-ethers', 'Alcohols, phenols and ethers', []],
  ['carbonyl-acids', 'Aldehydes, ketones and carboxylic acids', []],
  ['amines-diazonium', 'Amines and diazonium salts', ['Organic compounds containing nitrogen']],
  ['biomolecules', 'Biomolecules', []],
  ['polymers', 'Polymers', []],
  ['practical', 'Practical organic chemistry', []],
  ['rearrangements', 'Molecular rearrangements', []],
];
const SECTIONS: readonly (readonly [string, string, string])[] = [
  ['electronic-effects', 'Electronic effects', 'goc'],
  ['reactive-intermediates', 'Reactive intermediates and their stability', 'goc'],
  ['stereochemical-outcomes', 'Stereochemical outcomes of substitution and elimination', 'stereochemistry'],
  ['alkenes', 'Alkenes', 'hydrocarbons'],
  ['alkynes', 'Alkynes', 'hydrocarbons'],
  ['aromatic-hydrocarbons', 'Aromatic hydrocarbons', 'hydrocarbons'],
  ['substitution-elimination', 'Nucleophilic substitution and elimination', 'haloalkanes-haloarenes'],
  ['alcohol-oxidation-dehydration', 'Oxidation and dehydration of alcohols', 'alcohols-phenols-ethers'],
  ['phenols', 'Phenols', 'alcohols-phenols-ethers'],
  ['nucleophilic-addition', 'Nucleophilic addition to carbonyl compounds', 'carbonyl-acids'],
  ['aldol-cannizzaro', 'Aldol and Cannizzaro reactions', 'carbonyl-acids'],
  ['haloform-and-tests', 'Haloform reaction and tests', 'carbonyl-acids'],
  ['acid-derivatives', 'Carboxylic acids and their derivatives', 'carbonyl-acids'],
  ['diazonium-chemistry', 'Diazonium salts', 'amines-diazonium'],
  ['functional-group-tests', 'Tests for functional groups', 'practical'],
];

const topic = (body: string, name: string, kind: Kind, order: number, parent?: string, aliases: readonly string[] = []): Topic => ({
  id: topicId(body),
  kind: 'topic',
  name,
  aliases: [...aliases],
  ...(parent === undefined ? {} : { parentId: topicId(parent) }),
  topicKind: kind,
  order,
  ...meta(review),
});

export function demoTopics(): Topic[] {
  return [
    topic(ROOT, 'Organic chemistry', 'subject', 1),
    ...CHAPTERS.map(([body, name, aliases], i) => topic(body, name, 'chapter', i + 1, ROOT, aliases)),
    ...SECTIONS.map(([body, name, parent], i) => topic(body, name, 'section', i + 1, parent)),
  ];
}

const exam = (body: string, name: string, shortName: string): Exam => ({
  id: ident<Exam['id']>('exm', body), kind: 'exam', name, shortName, ...meta(review),
});
export const demoExams = (): Exam[] => [exam('jee-main', 'JEE Main', 'Main'), exam('jee-advanced', 'JEE Advanced', 'Advanced')];

type Coverage = 'included' | 'partial' | 'excluded';
function version(examBody: string, label: string, coverage: (chapter: string) => Coverage): ExamVersion {
  const body = `${examBody}-2026`;
  return {
    id: ident<ExamVersion['id']>('exv', body),
    kind: 'exam_version',
    examId: ident<ExamVersion['examId']>('exm', examBody),
    label,
    year: 2026,
    status: 'provisional',
    units: CHAPTERS.map(([chapter, name]) => ({
      id: ident<ExamVersion['units'][number]['id']>('unt', `${body}-${chapter}`),
      title: name,
      topicCoverage: [{ topicId: topicId(chapter), coverage: coverage(chapter) }],
    })),
    ...meta(review),
  };
}

export function demoExamVersions(): ExamVersion[] {
  return [
    version('jee-main', 'JEE Main 2026 (provisional)', (c) => (c === 'rearrangements' ? 'excluded' : c === 'polymers' ? 'partial' : 'included')),
    version('jee-advanced', 'JEE Advanced 2026 (provisional)', (c) => (c === 'rearrangements' || c === 'polymers' ? 'partial' : 'included')),
  ];
}

/** [reaction slug, topic body, role] — every reaction is mapped; the diazonium → phenol reaction is cross-chapter. */
const MAPPINGS: readonly (readonly [string, string, TopicMapping['role']])[] = [
  ['alcohol1-to-aldehyde-pcc', 'alcohol-oxidation-dehydration', 'core'],
  ['ethanol-to-ethanal-pcc', 'alcohol-oxidation-dehydration', 'core'],
  ['ethanal-to-ethanoic-acid', 'carbonyl-acids', 'supporting'],
  ['ethanol-to-ethanoic-acid', 'alcohol-oxidation-dehydration', 'core'],
  ['ethanol-to-ethanal-dichromate', 'alcohol-oxidation-dehydration', 'core'],
  ['fischer-esterification', 'acid-derivatives', 'core'],
  ['ethyl-ethanoate-hydrolysis', 'acid-derivatives', 'core'],
  ['ethanol-conc-h2so4', 'alcohol-oxidation-dehydration', 'core'],
  ['ethene-hydration', 'alkenes', 'core'],
  ['propene-hbr', 'alkenes', 'core'],
  ['propene-hbr-peroxide', 'alkenes', 'core'],
  ['r-2-bromobutane-aq-koh', 'substitution-elimination', 'core'],
  ['r-2-bromobutane-aq-koh', 'stereochemical-outcomes', 'supporting'],
  ['r-2-bromobutane-alc-koh', 'substitution-elimination', 'core'],
  ['benzaldehyde-cannizzaro', 'aldol-cannizzaro', 'core'],
  ['ethanal-aldol', 'aldol-cannizzaro', 'core'],
  ['haloform-ethanol', 'haloform-and-tests', 'core'],
  ['haloform-propanone', 'haloform-and-tests', 'core'],
  ['haloform-propanone', 'functional-group-tests', 'supporting'],
  ['aniline-diazotisation', 'diazonium-chemistry', 'core'],
  ['benzenediazonium-sandmeyer', 'diazonium-chemistry', 'core'],
  ['benzenediazonium-to-phenol', 'diazonium-chemistry', 'core'],
  ['benzenediazonium-to-phenol', 'phenols', 'core'],
  ['methylmgbr-propanone', 'nucleophilic-addition', 'core'],
  ['methylmgbr-ethanal', 'nucleophilic-addition', 'core'],
  ['but-2-yne-lindlar', 'alkynes', 'core'],
  ['benzene-friedel-crafts-acylation', 'aromatic-hydrocarbons', 'core'],
  ['ethene-baeyers', 'alkenes', 'core'],
  ['ethene-baeyers', 'functional-group-tests', 'supporting'],
  ['cyclohexanone-oxime-beckmann', 'rearrangements', 'core'],
  ['benzene-nitration-draft', 'aromatic-hydrocarbons', 'core'],
];

export function demoTopicMappings(): TopicMapping[] {
  return MAPPINGS.map(([slug, topicBody, role]) => ({
    id: ident<TopicMapping['id']>('tmp', `${slug}-${topicBody}`),
    kind: 'topic_mapping',
    topicId: topicId(topicBody),
    target: { kind: 'reaction', id: rxnId(slug) } satisfies RecordRef,
    role,
    ...meta(),
  }));
}

export function demoExamRelevance(): ExamRelevance[] {
  return [
    {
      id: ident<ExamRelevance['id']>('erl', 'beckmann-advanced'),
      kind: 'exam_relevance',
      target: rec('reaction', 'cyclohexanone-oxime-beckmann', 'rxn'),
      examId: ident<ExamRelevance['examId']>('exm', 'jee-advanced'),
      examVersionIds: [ident<ExamVersion['id']>('exv', 'jee-advanced-2026')],
      scope: 'enrichment',
      importance: 2,
      note: 'Explicit override for the demo: derived scope would be official, but the reaction is treated as enrichment. Unverified.',
      ...meta(review),
    },
  ];
}
