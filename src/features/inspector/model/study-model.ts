/**
 * The Study inspector's view-model (step 8.1 Part C). ONE layout for every kind, filled per kind: the kind chip and title, the hero (what
 * to draw first), the lead (the one-paragraph idea), the key facts as chips, the watch-out callouts, the go-next actions, the connected cards
 * and the closed Notes. Pure: it reads a snapshot and returns values; the components only draw them and the host performs the actions.
 * Nothing here is chemistry: names, enum words and the references the records already hold.
 */
import { isPictureKind, picturesOf } from '@/core/editing/picture-kinds';
import type { AnchorTone, Caveat, ChemicalClass, Concept, Mechanism, NamedReaction, Reaction, Reagent, RecordRef, Species } from '@/core/schema';
import { nameOf, nameOfRecord, recordOf } from './describe';
import { parameterPhrases } from './conditions';
import { connectedOf, type CardGroup, type Snapshot } from './study-connected';
import { plain, STUDY_LAYOUT_KINDS, studyKindWord } from './study-words';

export type { Card, CardGroup, Snapshot } from './study-connected';
export { MAX_CARDS } from './study-connected';

export interface Chip {
  readonly label: string;
  /** Set when the chip points at a record: it is drawn as a link. */
  readonly ref?: RecordRef;
}
export type Hero =
  | { readonly type: 'reaction'; readonly reactionId: string }
  | { readonly type: 'species'; readonly ref: RecordRef; readonly formula: string | undefined; readonly charge: number | undefined }
  | { readonly type: 'class'; readonly ref: RecordRef; readonly formula: string | undefined }
  | { readonly type: 'formula'; readonly text: string }
  | { readonly type: 'picture'; readonly ref: RecordRef }
  | { readonly type: 'step-species'; readonly mechanismId: string };
export interface WatchOut {
  readonly ref: RecordRef;
  readonly title: string;
  readonly statement: string;
}
export interface StudyModel {
  readonly kindChip: { readonly word: string; readonly tone: AnchorTone | undefined };
  readonly title: string;
  readonly hero: Hero | undefined;
  /** The idea in one paragraph: the first of summary, study notes, description (a caveat: its statement). */
  readonly lead: { readonly source: string; readonly from: 'summary' | 'notes' | 'description' } | undefined;
  readonly facts: readonly Chip[];
  readonly watchOut: readonly WatchOut[];
  readonly connected: readonly CardGroup[];
  /** Study notes kept for the closed "Notes" section (set only when the lead was something else). */
  readonly notes: string | undefined;
  /** True in Studio: the layout is followed by the closed "For authors" section. */
  readonly forAuthors: boolean;
}

const MAX_TONE_DEPTH = 6;

/** The soft colour of the family a record belongs to: the tone of the anchor on its class (or on itself), nearest first. */
function toneOf(snapshot: Snapshot, ref: RecordRef): AnchorTone | undefined {
  const tones = new Map<string, AnchorTone>();
  for (const anchor of snapshot.indexes.anchors()) if (anchor.tone !== undefined) tones.set(anchor.target.id, anchor.tone);
  if (tones.size === 0) return undefined;
  const { state, indexes } = snapshot;
  const seeds: string[] = [];
  const record = recordOf(state, ref);
  if (record === undefined) return undefined;
  if (ref.kind === 'reaction') {
    const first = (record as Reaction).participants.find((p) => p.isPrimarySubstrate === true) ?? (record as Reaction).participants.find((p) => p.role === 'reactant');
    if (first !== undefined) seeds.push(first.ref.id, ...classesOf(snapshot, first.ref));
  } else if (ref.kind === 'species') seeds.push(ref.id, ...(record as Species).classIds);
  else if (ref.kind === 'class') seeds.push(ref.id);
  for (const seed of seeds) {
    const own = tones.get(seed);
    if (own !== undefined) return own;
    if (seed.startsWith('cls_')) {
      for (const up of indexes.classAncestors(seed as never).slice(0, MAX_TONE_DEPTH)) {
        const found = tones.get(up);
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
}
const classesOf = (snapshot: Snapshot, ref: RecordRef): readonly string[] => (ref.kind === 'species' ? ((recordOf(snapshot.state, ref) as Species | undefined)?.classIds ?? []) : []);

type Rich = { readonly summary?: string; readonly studyNotes?: string; readonly description?: string };

function leadOf(record: unknown, kind: string): { lead: StudyModel['lead']; notes: string | undefined } {
  const r = record as Rich;
  if (kind === 'caveat') {
    const c = record as Caveat;
    return { lead: c.statement === '' ? undefined : { source: c.statement, from: 'summary' }, notes: undefined };
  }
  if (r.summary !== undefined && r.summary !== '') return { lead: { source: r.summary, from: 'summary' }, notes: r.studyNotes === '' ? undefined : r.studyNotes };
  if (r.studyNotes !== undefined && r.studyNotes !== '') return { lead: { source: r.studyNotes, from: 'notes' }, notes: undefined };
  if (r.description !== undefined && r.description !== '') return { lead: { source: r.description, from: 'description' }, notes: undefined };
  return { lead: undefined, notes: undefined };
}

const conceptChip = (snapshot: Snapshot, id: string, prefix = ''): Chip => ({ label: `${prefix}${nameOf(snapshot.state, { kind: 'concept', id } as RecordRef)}`, ref: { kind: 'concept', id } as RecordRef });

function conditionChips(reaction: Reaction): Chip[] {
  const seen = new Set<string>();
  const out: Chip[] = [];
  for (const stage of reaction.stages) {
    for (const phrase of parameterPhrases(stage.parameters)) {
      if (phrase.startsWith('as written') || seen.has(phrase)) continue;
      seen.add(phrase);
      out.push({ label: phrase });
    }
  }
  return out;
}

function factsOf(snapshot: Snapshot, ref: RecordRef, record: unknown): Chip[] {
  const { state, indexes } = snapshot;
  const name = (kind: string, id: string): string => nameOf(state, { kind, id } as RecordRef);
  const link = (kind: string, id: string, prefix = ''): Chip => ({ label: `${prefix}${name(kind, id)}`, ref: { kind, id } as RecordRef });
  switch (ref.kind) {
    case 'reaction': {
      const r = record as Reaction;
      return [
        ...r.reactionTypes.map((c) => conceptChip(snapshot, c.conceptId)),
        ...(r.instanceOfId === undefined ? [] : [link('reaction', r.instanceOfId, 'Example of ')]),
        ...r.namedReactionIds.map((id) => link('named_reaction', id)),
        ...conditionChips(r),
        ...(r.reversibility.kind === 'equilibrium' || r.reversibility.kind === 'reversible_under_other_conditions' ? [{ label: 'Reversible' }] : []),
      ];
    }
    case 'species': {
      const s = record as Species;
      return [...s.classIds.map((id) => link('class', id)), ...s.names.common.filter((n) => n !== s.names.canonical).map((n) => ({ label: `also ${n}` }))];
    }
    case 'class':
      return (record as ChemicalClass).parentIds.map((id) => link('class', id, 'A kind of '));
    case 'reagent': {
      const g = record as Reagent;
      return [...g.families.map((f) => ({ label: plain(f) })), ...g.profiles.map((p) => ({ label: p.label }))];
    }
    case 'concept': {
      const c = record as Concept;
      return [...c.parentIds.map((id) => link('concept', id, 'Part of ')), ...(c.conceptKind === 'general' ? [] : [{ label: plain(c.conceptKind) }])];
    }
    case 'named_reaction': {
      const n = record as NamedReaction;
      const mechanism = indexes.reactionsByNamedReaction(n.id as never, { includeDescendants: false }).flatMap((id) => (recordOf(state, { kind: 'reaction', id } as RecordRef) as Reaction | undefined)?.mechanismIds ?? [])[0];
      return [...n.parentIds.map((id) => link('named_reaction', id, 'Part of ')), ...(mechanism === undefined ? [] : [link('mechanism', mechanism, 'Mechanism: ')])];
    }
    case 'mechanism': {
      const m = record as Mechanism;
      const steps = m.variants[0]?.steps.length ?? 0;
      return [...m.mechanismClasses.map((c) => conceptChip(snapshot, c.conceptId)), ...(steps === 0 ? [] : [{ label: `${steps} step${steps === 1 ? '' : 's'}` }])];
    }
    case 'transformation': {
      const t = record as { fromClassIds: readonly string[]; toClassIds: readonly string[] };
      return [...t.fromClassIds.map((id) => link('class', id, 'From ')), ...t.toClassIds.map((id) => link('class', id, 'To '))];
    }
    case 'caveat':
      return (record as Caveat).importance === 'high' ? [{ label: 'Important' }] : [];
    case 'route':
      return [{ label: plain((record as { purpose: string }).purpose) }];
    default:
      return [];
  }
}

function heroOf(snapshot: Snapshot, ref: RecordRef, record: unknown): Hero | undefined {
  const { state, indexes } = snapshot;
  switch (ref.kind) {
    case 'reaction':
      return (record as Reaction).outcomes.length === 0 ? undefined : { type: 'reaction', reactionId: ref.id };
    case 'species': {
      const s = record as Species;
      return { type: 'species', ref, formula: s.formula, charge: s.charge };
    }
    case 'class': {
      const g = (record as ChemicalClass).generic;
      return g?.generalFormula !== undefined || g?.formulaText !== undefined || g?.structure !== undefined ? { type: 'class', ref, formula: g?.generalFormula ?? g?.formulaText } : undefined;
    }
    case 'reagent': {
      const text = (record as Reagent).formulaText;
      return text === undefined || text === '' ? undefined : { type: 'formula', text };
    }
    case 'named_reaction': {
      const generic = indexes.reactionsByNamedReaction(ref.id as never, { includeDescendants: false }).find((id) => (recordOf(state, { kind: 'reaction', id } as RecordRef) as Reaction | undefined)?.scope === 'generic');
      return generic === undefined ? undefined : { type: 'reaction', reactionId: generic };
    }
    default:
      break;
  }
  if (isPictureKind(ref.kind) && picturesOf(state, ref).length > 0) return { type: 'picture', ref };
  if (ref.kind === 'mechanism' && ((record as Mechanism).variants[0]?.steps[0]?.species.length ?? 0) > 0) return { type: 'step-species', mechanismId: ref.id };
  return undefined;
}

function watchOutOf(snapshot: Snapshot, ref: RecordRef): WatchOut[] {
  if (ref.kind === 'caveat') return [];
  return snapshot.indexes.caveatsFor(ref).flatMap((c) => {
    const caveat = recordOf(snapshot.state, c) as Caveat | undefined;
    return caveat === undefined ? [] : [{ ref: c, title: caveat.title, statement: caveat.statement }];
  });
}

/** The model of a record, or undefined when the record is not in the snapshot. */
export function studyInspectorModel(ref: RecordRef, snapshot: Snapshot, edition: 'study' | 'studio'): StudyModel | undefined {
  const record = recordOf(snapshot.state, ref);
  if (record === undefined) return undefined;
  const forAuthors = edition === 'studio';
  const header = { kindChip: { word: studyKindWord(ref.kind), tone: toneOf(snapshot, ref) }, title: nameOfRecord(record), forAuthors };
  if (!STUDY_LAYOUT_KINDS.has(ref.kind)) return { ...header, hero: undefined, lead: undefined, facts: [], watchOut: [], connected: [], notes: undefined };
  const { lead, notes } = leadOf(record, ref.kind);
  return { ...header, hero: heroOf(snapshot, ref, record), lead, facts: factsOf(snapshot, ref, record), watchOut: watchOutOf(snapshot, ref), connected: connectedOf(snapshot, ref), notes };
}
