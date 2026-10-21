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

/** One "New <kind>" palette command. */
export interface NewKindCommand {
  readonly id: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly reason: string | undefined;
  run(): void;
}

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
  /** The "New ..." commands (one per editor entry, from the lazy entries table): why each cannot run now, and what it does. Absent or empty: none are listed. */
  readonly newKinds?: readonly NewKindCommand[] | undefined;
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
    ...(deps.newKinds ?? []).map((command) => withReason({ id: command.id, title: command.title, keywords: command.keywords, run: command.run }, command.reason)),
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
