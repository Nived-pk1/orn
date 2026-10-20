/**
 * The editor host (ADR-040, step 6.1a part 4): the existing Dialog around one session. Header: the record's name and kind and the draft's
 * own Undo and Redo. Body: the form with the findings panel beside it (live L1 on every change, debounced 300 ms; each finding moves the
 * focus to its field). Footer: the draft's storage line, Save, Close (keeps the draft) and Discard draft (asks first). Esc is Close.
 * Inside the editor Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y are the DRAFT's undo and redo. L2-L3 run at Save, in the store's gate: an
 * ERROR keeps the dialog open with its findings; a conflict shows the conflict view. The host knows no chemistry: it renders the core's words.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { compareForConflict, type ConflictChoice, type ConflictChoices, type DraftRecipe, type EditMeta, type FieldComparison } from '@/core/editing';
import type { AnyRecord, RecordRef } from '@/core/schema';
import { parseRecord } from '@/core/validation';
import type { Finding } from '@/core/validation';
import { useLayoutMode } from '@/ui/hooks';
import { Button, Dialog, RESULT_TOAST_MS, useToasts } from '@/ui/primitives';
import { ConflictView, DeletedView } from './conflict-view';
import { DuplicateDialog } from './duplicate-dialog';
import type { DuplicateOutcome } from './duplicate-contracts';
import { draftStatusText, editingUnavailableReason, type FormatTime } from './draft-text';
import type { EditorPort } from './editor-contracts';
import { fieldFor, FindingsPanel } from './findings-panel';
import { useLiveChecks, type LiveChecks } from './live-validation';
import { formOwns, labelOfField, sectionOf, titleOf } from './form-kinds';
import { namesFieldLabel } from './names-section';
import { PreviewPanel } from './reaction-preview';
import { RecordForm } from './record-form';
import styles from './editor.module.css';

export const LIVE_DEBOUNCE_MS = 300;

/** Live L1 of the draft: computed at once for a new draft, again `LIVE_DEBOUNCE_MS` after the last change. */
function useLiveFindings(kind: Parameters<typeof parseRecord>[0], draft: unknown, timers: EditorPort['timers']): readonly Finding[] {
  const compute = useCallback((): readonly Finding[] => {
    const parsed = parseRecord(kind, draft);
    return parsed.ok ? [] : parsed.findings;
  }, [kind, draft]);
  const [findings, setFindings] = useState<readonly Finding[]>(compute);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    return timers.after(LIVE_DEBOUNCE_MS, () => setFindings(compute()));
  }, [compute, timers]);
  return findings;
}

const nameOfBase = (record: AnyRecord | null, fallback: string): string => {
  const fields = record as { names?: { canonical?: unknown }; name?: unknown } | null;
  const own = fields?.names?.canonical ?? fields?.name; // a reaction has `name`, the others `names.canonical`
  return typeof own === 'string' && own !== '' ? own : fallback;
};

/** The findings of the three sources, once each (the same problem keeps its ID), in the order they arrive: schema, then L2-L3, then L4. */
function mergeFindings(...sources: readonly (readonly Finding[])[]): readonly Finding[] {
  const seen = new Set<string>();
  return sources.flat().filter((finding) => !seen.has(finding.id) && seen.add(finding.id));
}

export function checkNotes(checks: LiveChecks): readonly { readonly id: string; readonly text: string }[] {
  const notes: { id: string; text: string }[] = [];
  if (checks.dry.phase === 'checking') notes.push({ id: 'checking-dry', text: 'Checking references and names...' });
  if (checks.dry.phase === 'unavailable') notes.push({ id: 'dry-unavailable', text: checks.dry.message ?? 'The references and names were not checked.' });
  if (checks.structure.phase === 'checking') notes.push({ id: 'checking-structure', text: 'Checking the structure...' });
  if (checks.structure.phase === 'unavailable') notes.push({ id: 'structure-unavailable', text: checks.structure.message ?? 'The structure was not checked.' });
  notes.push({ id: 'others', text: 'Other records are checked when you save.' });
  return notes;
}

type View =
  | { readonly kind: 'form' }
  | { readonly kind: 'conflict'; readonly current: AnyRecord; readonly choices: ConflictChoices }
  | { readonly kind: 'deleted' };

export interface EditorHostProps {
  readonly port: EditorPort;
  readonly sessionId: string;
  readonly open: boolean;
  /** The editor was closed (kept, saved or discarded). */
  readonly onClose: () => void;
  /** The window's injected local-time formatter. */
  readonly formatTime: FormatTime;
}

export function EditorHost(props: EditorHostProps) {
  const { port, sessionId, onClose } = props;
  const toasts = useToasts();
  const phone = useLayoutMode() === 'phone';
  const entry = useSyncExternalStore(port.subscribe, () => port.entry(sessionId));
  const keeping = useSyncExternalStore(port.subscribe, () => port.keeping());
  const [view, setView] = useState<View>({ kind: 'form' });
  const [refusal, setRefusal] = useState<{ readonly findings: readonly Finding[]; readonly message: string | null } | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateOutcome | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const closing = useRef(false);
  const kind = entry?.session.kind ?? 'species';
  const draft = entry?.session.draft;
  const live = useLiveFindings(kind, draft, port.timers);
  const checks = useLiveChecks(kind, draft, live.some((finding) => finding.severity === 'error'), port);
  const unavailable = editingUnavailableReason(keeping);

  // the session is gone (saved or discarded): the editor goes with it
  useEffect(() => {
    if (entry === undefined && !closing.current) {
      closing.current = true;
      onClose();
    }
  }, [entry, onClose]);

  const edit = useCallback(
    (recipe: DraftRecipe, path?: string) => {
      setRefusal(null);
      const meta: EditMeta = path === undefined ? {} : { path };
      port.edit(sessionId, recipe, meta);
    },
    [port, sessionId],
  );
  const invalid = useMemo(() => new Set((refusal?.findings ?? [...live, ...checks.dry.findings, ...checks.structure.findings]).flatMap((f) => (f.path === undefined ? [] : [f.path]))), [live, refusal, checks.dry.findings, checks.structure.findings]);
  const focusField = useCallback((path: string | undefined) => {
    if (root.current === null) return;
    const container = root.current;
    const field = fieldFor(container, path);
    if (field === null) return;
    const reveal = (found: HTMLElement): void => {
      const details = found.closest('details');
      if (details !== null) details.open = true; // an "Advanced" area holding the field
      found.focus();
    };
    // a field in a closed section: open the section first (its toggle), then the field can take the focus
    const closed = field.closest('[data-collapsed="true"]');
    if (closed !== null) closed.parentElement?.querySelector<HTMLElement>('button[data-section-toggle]')?.click();
    // a collapsed row (a participant): its Edit button stands in for its fields; open the row, then look for the field again once it is drawn
    const collapsedRow = field.dataset.openRow !== undefined && field.getAttribute('aria-expanded') === 'false';
    if (collapsedRow) field.click();
    reveal(field);
    if (collapsedRow) queueMicrotask(() => { const opened = fieldFor(container, path); if (opened !== null && opened !== field) reveal(opened); });
  }, []);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    // dirty: something was changed in this session (or the draft is already stored); a never-edited session is dropped without a word
    if (entry !== undefined && (entry.canUndo || entry.canRedo || ['saving', 'saved', 'failed'].includes(entry.save.state))) toasts.push({ kind: 'info', text: 'Draft kept', autoDismissMs: RESULT_TOAST_MS });
    port.release(sessionId);
    onClose();
  }, [entry, onClose, port, sessionId, toasts]);

  const refTarget = (): RecordRef | null => {
    const session = entry?.session;
    if (session === undefined) return null;
    if (session.target !== null) return session.target;
    const id = (session.draft as { id?: unknown } | null)?.id;
    return typeof id === 'string' ? ({ kind: session.kind, id } as RecordRef) : null;
  };

  const save = async (choices?: ConflictChoices, duplicatesAnswered = false): Promise<void> => {
    if (entry === undefined || busy) return;
    const target = refTarget();
    setBusy(true);
    // after L1 passes and before the store's gate: does this repeat a record we already have? (advice; the gate still runs)
    if (!duplicatesAnswered && choices === undefined && port.duplicates !== undefined && parseRecord(entry.session.kind, entry.session.draft).ok) {
      const outcome = await port.duplicates.check(entry.session.kind, entry.session.draft);
      if (outcome.matches.length > 0) {
        setBusy(false);
        setDuplicates(outcome);
        return;
      }
      if (!outcome.structureChecked) toasts.push({ kind: 'warning', text: 'Structure duplicates could not be checked' });
    }
    const result = await port.commit(sessionId, choices, sectionOf(entry.session.kind));
    setBusy(false);
    if (result.ok) {
      closing.current = true;
      const warnings = target === null ? 0 : port.warningsOf(target);
      toasts.push({ kind: warnings > 0 ? 'warning' : 'info', text: warnings > 0 ? `Saved, ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}` : 'Saved', autoDismissMs: RESULT_TOAST_MS });
      onClose();
      return;
    }
    if (result.reason === 'gone') return;
    if (result.reason === 'invalid') {
      setView({ kind: 'form' });
      setRefusal({ findings: result.findings, message: null });
      return;
    }
    if (result.reason === 'conflict') {
      setRefusal(null);
      setView(result.current === null ? { kind: 'deleted' } : { kind: 'conflict', current: result.current, choices: choices ?? {} });
      return;
    }
    setRefusal({ findings: [], message: result.error.code === 'EMPTY_COMMAND' ? 'Nothing to save: the draft is the same as the saved record.' : `The record was not saved (${result.error.code}): ${result.error.message}` });
  };

  const openExisting = (ref: RecordRef): void => {
    setDuplicates(null);
    close(); // the draft stays a draft
    port.duplicates?.openRecord(ref);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || unavailable !== undefined) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      port.undo(sessionId);
    } else if ((key === 'z' && event.shiftKey) || key === 'y') {
      event.preventDefault();
      port.redo(sessionId);
    }
  };

  if (entry === undefined) return null;
  const session = entry.session;
  const baseName = nameOfBase(session.baseRecord, session.target?.id ?? `new ${session.kind}`);
  const comparisons: readonly FieldComparison[] = view.kind === 'conflict' ? compareForConflict(session.baseRecord, view.current, session.draft) : [];
  const refused = refusal !== null && refusal.findings.length > 0;
  const shown = refused ? refusal.findings : mergeFindings(live, checks.dry.findings, checks.structure.findings);
  const notes = refused ? [] : checkNotes(checks);
  const inForm = (path: string | undefined): boolean => formOwns(session.kind, path);
  const title = titleOf(session.kind, session.target === null, baseName);

  const footer = (
    <div className={styles.footer}>
      <p className={styles.status} role="status" aria-live="polite" aria-label="Draft status">
        {draftStatusText(entry.save, keeping, props.formatTime)}
      </p>
      {asking ? (
        <div className={styles.confirm} role="group" aria-label="Discard this draft?">
          <span>Discard this draft? It cannot be undone.</span>
          <Button
            variant="primary"
            onClick={() => {
              setAsking(false);
              closing.current = true;
              void port.discard(sessionId).then(() => {
                toasts.push({ kind: 'info', text: 'Draft discarded', autoDismissMs: RESULT_TOAST_MS });
                onClose();
              });
            }}
          >
            Discard
          </Button>
          <Button onClick={() => setAsking(false)}>Keep it</Button>
        </div>
      ) : (
        <>
          {view.kind !== 'form' ? null : (
            <Button variant="primary" {...(unavailable !== undefined ? { unavailable } : busy ? { unavailable: 'saving' } : { onClick: () => void save() })}>
              Save
            </Button>
          )}
          <Button onClick={close}>Close (keeps the draft)</Button>
          {view.kind !== 'form' ? null : <Button onClick={() => setAsking(true)}>Discard draft</Button>}
        </>
      )}
    </div>
  );

  return (
    <>
    <Dialog open={props.open} onClose={close} title={title} size={phone ? 'screen' : 'wide'} footer={footer}>
      {/* the key handler is the draft's own undo and redo; the dialog's focus stays inside it */}
      <div ref={root} onKeyDown={onKeyDown} data-testid="editor-root">
        <p className={styles.hint}>{session.kind}</p>
        {unavailable === undefined ? null : <p className={styles.notice}>{unavailable}</p>}
        <div className={styles.toolbar} role="toolbar" aria-label="Draft history">
          <Button aria-keyshortcuts="Control+Z Meta+Z" {...(unavailable !== undefined ? { unavailable } : entry.canUndo ? { onClick: () => port.undo(sessionId) } : { unavailable: 'nothing to undo in this draft' })}>
            Undo
          </Button>
          <Button aria-keyshortcuts="Control+Shift+Z Control+Y Meta+Shift+Z" {...(unavailable !== undefined ? { unavailable } : entry.canRedo ? { onClick: () => port.redo(sessionId) } : { unavailable: 'nothing to redo in this draft' })}>
            Redo
          </Button>
        </div>
        {view.kind === 'conflict' ? (
          <ConflictView
            comparisons={comparisons}
            choices={view.choices}
            saving={busy}
            labelOf={(path) => namesFieldLabel(path) ?? labelOfField(session.kind, path)}
            onChoose={(path: string, choice: ConflictChoice) => setView({ ...view, choices: { ...view.choices, [path]: choice } })}
            onSave={() => void save(view.choices)}
            onBack={() => setView({ kind: 'form' })}
          />
        ) : view.kind === 'deleted' ? (
          <DeletedView onBack={() => setView({ kind: 'form' })} onDiscard={() => setAsking(true)} />
        ) : (
          <div className={phone ? styles.bodyPhone : styles.body}>
            <PreviewPanel kind={session.kind} draft={draft} port={port.preview} phone={phone} where="top" />
            <RecordForm
              kind={session.kind}
              draft={draft}
              onEdit={edit}
              invalid={invalid}
              phone={phone}
              structure={port.structure}
              timers={port.timers}
              newId={port.newId}
              links={port.links}
              pictures={port.pictures}
              saved={session.baseRecord !== null}
              suggestions={checks.structure.suggestions}
              {...(port.records === undefined ? {} : { picker: port.records })}
              {...(unavailable === undefined ? {} : { unavailable })}
            />
            <div className={phone ? undefined : styles.aside}>
              {refusal?.message === null || refusal === null ? null : (
                <p className={styles.notice} role="alert">
                  {refusal.message}
                </p>
              )}
              <FindingsPanel
                heading={refusal !== null && refusal.findings.length > 0 ? 'Save was refused' : 'Findings'}
                findings={shown}
                inForm={inForm}
                onFocusField={focusField}
                emptyText="No problems found in this draft."
                notes={notes}
              />
              <PreviewPanel kind={session.kind} draft={draft} port={port.preview} phone={phone} where="aside" />
            </div>
          </div>
        )}
      </div>
    </Dialog>
    {duplicates === null ? null : (
      <DuplicateDialog
        outcome={duplicates}
        structure={port.structure}
        timers={port.timers}
        onOpenExisting={(match) => openExisting(match.ref)}
        onKeepBoth={() => {
          setDuplicates(null);
          void save(undefined, true);
        }}
        onClose={() => setDuplicates(null)}
      />
    )}
    </>
  );
}
