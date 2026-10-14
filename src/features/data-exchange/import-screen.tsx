/**
 * The import screen (step 5.9a): ONE native Dialog that follows the model's phase: reading (Cancel), refused (the reason in words, an
 * offer when there is one), preview (everything the file would do, Cancel / Confirm; Confirm says why when it cannot), applying
 * (the stage in words; Cancel until the commit). It is its own chunk, loaded when the first import opens (`lazy-screen.tsx`).
 */
import { useStore } from 'zustand';
import { Button, Dialog } from '@/ui/primitives';
import type { DataExchangePorts } from './contracts';
import type { ImportModel, ImportState, Offer } from './import-model';
import { PreviewBody } from './preview-body';
import { blockedReason } from './plan-request';
import { shownName, stageWords } from './words';
import styles from './import.module.css';

const OFFER_LABEL: Readonly<Record<Offer, string>> = {
  merge: 'Merge instead',
  in_process: 'Read it on this page',
  preview_again: 'Preview the file again',
};

const TITLES: Readonly<Record<ImportState['phase'], string>> = {
  closed: 'Import a file',
  reading: 'Reading the file',
  refused: 'The file was not imported',
  preview: 'Import summary',
  applying: 'Importing',
  undoing: 'Undo import',
};

/** The long wait (step 5.11b): shown once an apply has run over 2 s and the writer has reported. Not a live region: it changes up to 4 times a second. */
const showsCount = (state: ImportState): state is ImportState & { readonly progress: { readonly done: number; readonly total: number } } =>
  state.phase === 'applying' && state.long === true && state.progress !== null && state.progress !== undefined && state.progress.total !== null;

function ApplyBar(props: { readonly done: number; readonly total: number }) {
  const { done, total } = props;
  return (
    <div className={styles.body}>
      <p className={styles.progress}>
        Applying the records... {done} of {total}
      </p>
      <div className={styles.bar} role="progressbar" aria-label="Applying the records" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div className={styles.barFill} style={{ width: `${total === 0 ? 100 : Math.min(100, (done / total) * 100)}%` }} />
      </div>
    </div>
  );
}

function Progress(props: { readonly state: ImportState }) {
  const { state } = props;
  const verb = state.phase === 'reading' ? 'Reading' : state.phase === 'undoing' ? 'Undoing the import of' : 'Importing';
  const counting = showsCount(state);
  const undoCount = state.phase === 'undoing' && state.progress !== null && state.progress !== undefined ? ` (${state.progress.done}${state.progress.total === null ? '' : ` of ${state.progress.total}`})` : '';
  // The live region holds the file, the stage and (once) the long-wait sentence; the moving count sits outside it, so a reader hears
  // the start of the long wait and the end (the result toast), never every update.
  return (
    <>
      <div className={styles.body} role="status">
        <p className={styles.file}>
          {verb} <span className={styles.word}>{shownName(state.fileName)}</span>
        </p>
        {state.phase === 'reading' || counting ? null : (
          <p className={styles.progress}>
            {stageWords(state.stage)}
            {undoCount}…
          </p>
        )}
        {state.phase === 'applying' && state.cancellable !== true && state.long !== true ? <p className={styles.muted}>This step can no longer be cancelled; it will finish and then say so.</p> : null}
      </div>
      {counting ? <ApplyBar done={state.progress.done} total={state.progress.total} /> : null}
      {/* mounted empty from the start of the apply, so the sentence is announced once when the long wait begins */}
      {state.phase === 'applying' ? (
        <div className={styles.body} role="status">
          {state.long === true ? <p className={styles.progress}>Keep this tab open until it finishes.</p> : null}
        </div>
      ) : null}
    </>
  );
}

export function ImportScreen(props: { readonly model: ImportModel; readonly ports: Pick<DataExchangePorts, 'nameOf'> }) {
  const { model, ports } = props;
  const state = useStore(model.store);
  const { phase, plan } = state;
  const reason = plan === undefined ? undefined : blockedReason(plan);
  const cancelReason = phase === 'applying' && !state.cancellable ? 'it is past the point where it can be stopped' : undefined;
  // while the records are being applied past the commit the dialog cannot be dismissed: no Close button, Esc and the backdrop do nothing
  const closable = !(phase === 'applying' && state.long === true && !state.cancellable);
  let footer = null;
  if (phase === 'applying' && state.long === true && !state.cancellable) {
    footer = null; // no Cancel during a long apply (decision of step 5.11b): the writes are one transaction past the commit
  } else if (phase === 'reading' || phase === 'applying') {
    footer = <Button {...(cancelReason === undefined ? { onClick: model.cancel } : { unavailable: cancelReason })}>Cancel</Button>;
  } else if (phase === 'refused') {
    footer = (
      <>
        {state.offer === undefined ? null : (
          <Button variant="primary" onClick={model.acceptOffer}>
            {OFFER_LABEL[state.offer]}
          </Button>
        )}
        <Button onClick={model.close}>Dismiss</Button>
      </>
    );
  } else if (phase === 'preview') {
    footer = (
      <>
        <Button onClick={model.cancel}>Cancel</Button>
        <Button
          variant="primary"
          {...(reason === undefined && !state.revising ? { onClick: model.confirm } : { unavailable: reason ?? 'the preview is updating' })}
        >
          Confirm
        </Button>
      </>
    );
  }
  return (
    <Dialog open={phase !== 'closed'} onClose={model.cancel} title={TITLES[phase]} size="wide" footer={footer} closable={closable}>
      {phase === 'reading' || phase === 'applying' || phase === 'undoing' ? <Progress state={state} /> : null}
      {phase === 'refused' && state.refusal !== undefined ? (
        <div className={styles.body}>
          <p className={styles.file} title={state.fileName}>
            <span className={styles.word}>{shownName(state.fileName)}</span>
          </p>
          <h3 className={styles.error}>{state.refusal.title}</h3>
          <p role="alert">{state.refusal.text}</p>
        </div>
      ) : null}
      {phase === 'preview' && plan !== undefined ? (
        <PreviewBody plan={plan} fileName={state.fileName} earlier={state.earlier} note={state.note} busy={state.revising} ports={ports} onChange={model.change} />
      ) : null}
    </Dialog>
  );
}
