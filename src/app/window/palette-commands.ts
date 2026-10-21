/**
 * The palette's command registry (step 5.8): `src/app` fills it with ONLY what exists now. A command that cannot run now is listed with
 * its reason, never hidden and never a silent no-op. Everything a command does is a call on a UI store, the map's registered view
 * commands, or the import flow that the buttons of the Dataset screen use.
 */
import { STRUCTURE_MODES, type StructureMode } from '@/chem/contracts';
import type { PaletteCommand } from '@/features/search';
import type { NavigatorUiStores } from '@/ui/state';
import { undoUnavailableReason } from './dataset-actions';
import { ALL_LABEL, type ExamOptions } from './exam-scope';
import { NAVIGATOR_MODE } from './modes';

export interface CommandDeps {
  readonly mode: string;
  setMode(mode: string): void;
  readonly hasData: boolean;
  readonly writerMode: string | null;
  readonly writerReason: string | null;
  /** Why an import cannot start now (undefined: it can). */
  readonly importReason: string | undefined;
  /** The title of the replace command ("Replace with the demo dataset" or "... the study dataset"). Absent: the demo's. */
  readonly replaceTitle?: string | undefined;
  askReplace(): void;
  undoImport(): void;
  pickFile(): void;
  openExport(): void;
  /** "Edit the selected record" (ADR-040): why it cannot run now, and what it does. Absent: no such command. */
  readonly editNames?: { readonly reason: string | undefined; run(): void } | undefined;
  /** "New species" (step 6.2a): why it cannot run now, and what it does. Absent: no such command. */
  readonly newSpecies?: { readonly reason: string | undefined; run(): void } | undefined;
  /** "New class" (step 6.2b): why it cannot run now, and what it does. Absent: no such command. */
  readonly newClass?: { readonly reason: string | undefined; run(): void } | undefined;
  /** "New reagent" (step 6.2b): why it cannot run now, and what it does. Absent: no such command. */
  readonly newReagent?: { readonly reason: string | undefined; run(): void } | undefined;
  /** "New reaction" (step 6.3a): why it cannot run now, and what it does. Absent: no such command. */
  readonly newReaction?: { readonly reason: string | undefined; run(): void } | undefined;
  /** "New mechanism" (step 6.5a): why it cannot run now, and what it does. Absent: no such command. */
  readonly newMechanism?: { readonly reason: string | undefined; run(): void } | undefined;
  /** "New source" (step 6.6a): why it cannot run now, and what it does. Absent: no such command. */
  readonly newSource?: { readonly reason: string | undefined; run(): void } | undefined;
  /** "New concept", "New named reaction" and "New transformation" (step 6.6b): why they cannot run now, and what they do. Absent: no such command. */
  readonly newConcept?: { readonly reason: string | undefined; run(): void } | undefined;
  readonly newNamedReaction?: { readonly reason: string | undefined; run(): void } | undefined;
  readonly newTransformation?: { readonly reason: string | undefined; run(): void } | undefined;
  /** "New relationship" (step 6.6b part 4). */
  readonly newRelationship?: { readonly reason: string | undefined; run(): void } | undefined;
  /** How structures are drawn (equation step, part 4). Absent: no Structures commands. */
  readonly structures?: { mode(): StructureMode; set(mode: StructureMode): void } | undefined;
  readonly ui: NavigatorUiStores;
  readonly exams: ExamOptions;
}

/** Why the map's commands (fit, zoom, the Unanchored panel) cannot run now. */
function mapReason(deps: CommandDeps): string | undefined {
  if (!deps.hasData) return 'there is no data';
  if (deps.mode !== NAVIGATOR_MODE) return 'the Navigator is not shown';
  if (deps.ui.family.getState().open !== null) return 'a family page is open; Overview shows the map';
  if (deps.ui.viewCommands.getState().commands === null) return 'the map is not shown';
  return undefined;
}

const MODE_WORDS: Readonly<Record<StructureMode, string>> = { skeletal: 'Skeletal', condensed: 'Condensed', full: 'Full' };

export function buildCommands(deps: CommandDeps): readonly PaletteCommand[] {
  const { ui } = deps;
  const navigatorShown = deps.hasData && deps.mode === NAVIGATOR_MODE;
  const navigatorReason = !deps.hasData ? 'there is no data' : deps.mode !== NAVIGATOR_MODE ? 'the Navigator is not shown' : undefined;
  const view = ui.viewCommands.getState().commands;
  const onMap = mapReason(deps);
  const zoomReason = onMap ?? view?.zoomReason;
  const importReason = deps.importReason;
  const undoReason = undoUnavailableReason(deps.writerMode, deps.writerReason) ?? importReason;
  const listing = ui.overview.getState().mode === 'list';
  const familyOpen = ui.family.getState().open !== null;
  const withReason = (command: Omit<PaletteCommand, 'unavailable'>, reason: string | undefined): PaletteCommand =>
    reason === undefined ? command : { ...command, unavailable: reason };

  const scope = ui.exam.getState().active;
  const scopeCommands: PaletteCommand[] = [
    withReason(
      { id: 'scope:all', title: `Choose the exam scope: ${ALL_LABEL}`, keywords: ['exam', 'scope', 'syllabus'], run: () => ui.exam.getState().setActive(null) },
      scope === null ? 'it is already chosen' : undefined,
    ),
    ...deps.exams.options.map((option) =>
      withReason(
        {
          id: `scope:${option.examVersionId}`,
          title: `Choose the exam scope: ${option.label}`,
          keywords: ['exam', 'scope', 'syllabus'],
          run: () => ui.exam.getState().setActive({ examId: option.examId, examVersionId: option.examVersionId }),
        },
        scope?.examVersionId === option.examVersionId ? 'it is already chosen' : undefined,
      ),
    ),
  ];

  const structures = deps.structures;
  const structureCommands: PaletteCommand[] =
    structures === undefined
      ? []
      : STRUCTURE_MODES.map((mode) =>
          withReason(
            { id: `structures:${mode}`, title: `Structures: ${MODE_WORDS[mode]}`, keywords: ['structures', 'draw', 'drawing', ...(mode === 'full' ? ['show all atoms', 'hydrogens'] : mode === 'condensed' ? ['chain'] : ['lines'])], run: () => structures.set(mode) },
            structures.mode() === mode ? 'it is already chosen' : undefined,
          ),
        );

  return [
    withReason({ id: 'import-file', title: 'Import a file...', keywords: ['import', 'open', 'file', 'v6', 'load', 'package'], run: deps.pickFile }, importReason),
    { id: 'export', title: 'Export...', keywords: ['export', 'backup', 'save', 'download', 'share', 'package'], run: deps.openExport },
    withReason({ id: 'replace-demo', title: deps.replaceTitle ?? 'Replace with the demo dataset', keywords: ['load', 'import', 'demo', 'study'], run: deps.askReplace }, importReason),
    withReason({ id: 'undo-import', title: 'Undo import', keywords: ['restore', 'snapshot'], run: deps.undoImport }, undoReason),
    ...(deps.editNames === undefined ? [] : [withReason({ id: 'edit-names', title: 'Edit the selected record', keywords: ['rename', 'alias', 'name', 'edit', 'draft', 'author'], run: deps.editNames.run }, deps.editNames.reason)]),
    ...(deps.newSpecies === undefined ? [] : [withReason({ id: 'new-species', title: 'New species', keywords: ['create', 'add', 'compound', 'author', 'workbench', 'draft'], run: deps.newSpecies.run }, deps.newSpecies.reason)]),
    ...(deps.newClass === undefined ? [] : [withReason({ id: 'new-class', title: 'New class', keywords: ['create', 'add', 'group', 'functional group', 'family', 'author', 'workbench', 'draft'], run: deps.newClass.run }, deps.newClass.reason)]),
    ...(deps.newReagent === undefined ? [] : [withReason({ id: 'new-reagent', title: 'New reagent', keywords: ['create', 'add', 'catalyst', 'oxidant', 'author', 'workbench', 'draft'], run: deps.newReagent.run }, deps.newReagent.reason)]),
    ...(deps.newReaction === undefined ? [] : [withReason({ id: 'new-reaction', title: 'New reaction', keywords: ['create', 'add', 'equation', 'participants', 'stages', 'author', 'workbench', 'draft'], run: deps.newReaction.run }, deps.newReaction.reason)]),
    ...(deps.newMechanism === undefined ? [] : [withReason({ id: 'new-mechanism', title: 'New mechanism', keywords: ['create', 'add', 'steps', 'pathway', 'variants', 'arrow pushing', 'author', 'workbench', 'draft'], run: deps.newMechanism.run }, deps.newMechanism.reason)]),
    ...(deps.newSource === undefined ? [] : [withReason({ id: 'new-source', title: 'New source', keywords: ['create', 'add', 'reference', 'textbook', 'book', 'citation', 'cite', 'author', 'workbench', 'draft'], run: deps.newSource.run }, deps.newSource.reason)]),
    ...(deps.newConcept === undefined ? [] : [withReason({ id: 'new-concept', title: 'New concept', keywords: ['create', 'add', 'topic idea', 'reaction type', 'mechanism class', 'rule', 'author', 'workbench', 'draft'], run: deps.newConcept.run }, deps.newConcept.reason)]),
    ...(deps.newNamedReaction === undefined ? [] : [withReason({ id: 'new-named-reaction', title: 'New named reaction', keywords: ['create', 'add', 'name reaction', 'author', 'workbench', 'draft'], run: deps.newNamedReaction.run }, deps.newNamedReaction.reason)]),
    ...(deps.newTransformation === undefined ? [] : [withReason({ id: 'new-transformation', title: 'New transformation', keywords: ['create', 'add', 'conversion', 'functional group', 'class to class', 'author', 'workbench', 'draft'], run: deps.newTransformation.run }, deps.newTransformation.reason)]),
    ...(deps.newRelationship === undefined ? [] : [withReason({ id: 'new-relationship', title: 'New relationship', keywords: ['create', 'add', 'link', 'commonly confused', 'prerequisite', 'reverse of', 'competes', 'author', 'workbench', 'draft'], run: deps.newRelationship.run }, deps.newRelationship.reason)]),
    ...structureCommands,
    withReason({ id: 'fit', title: 'Fit', keywords: ['zoom', 'map', 'view'], run: () => view?.fit() }, zoomReason),
    withReason({ id: 'zoom-in', title: 'Zoom in', keywords: ['map', 'view'], run: () => view?.zoomIn() }, zoomReason),
    withReason({ id: 'zoom-out', title: 'Zoom out', keywords: ['map', 'view'], run: () => view?.zoomOut() }, zoomReason),
    withReason(
      {
        id: 'overview-mode',
        title: listing ? 'Show the map' : 'Show the List view',
        keywords: ['map', 'list', 'view', 'overview'],
        run: () => {
          ui.family.getState().closeFamily();
          ui.overview.getState().setMode(listing ? 'map' : 'list');
        },
      },
      navigatorReason,
    ),
    withReason(
      {
        id: 'overview',
        title: 'Overview',
        keywords: ['back', 'families', 'map'],
        run: () => {
          deps.setMode(NAVIGATOR_MODE);
          ui.family.getState().closeFamily();
        },
      },
      !deps.hasData ? 'there is no data' : navigatorShown && !familyOpen ? 'the overview is already shown' : undefined,
    ),
    withReason({ id: 'unanchored', title: 'Open the Unanchored reactions', keywords: ['unclassified', 'reactions', 'panel'], run: () => view?.openUnanchored() }, onMap ?? view?.unanchoredReason),
    ...scopeCommands,
  ];
}
