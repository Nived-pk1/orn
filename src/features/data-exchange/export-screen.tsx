/**
 * The export screen (step 5.9b): ONE native Dialog that follows the model's phase: the options (format, what to include, images, file
 * name, each choice with a sentence), running (progress in words, Cancel), done (what was written and every gap), cancelled (no file,
 * said so) and refused (the reason, and the offer to build on this page when the worker is down). It is its own chunk, loaded when the
 * first export opens (`lazy-export.tsx`).
 */
import { useId } from 'react';
import { useStore } from 'zustand';
import { Button, Dialog } from '@/ui/primitives';
import type { ExportModel, ExportState } from './export-model';
import { EXTENSION, FORMATS, IMAGES, SCOPES, fileNameOf, imagesNote, imagesUnavailable, type Choice } from './export-words';
import { shownName } from './words';
import styles from './import.module.css';

const TITLES: Readonly<Record<ExportState['phase'], string>> = {
  closed: 'Export your data',
  options: 'Export your data',
  running: 'Exporting',
  done: 'Export finished',
  cancelled: 'Export cancelled',
  refused: 'The data was not exported',
};

function Group<T extends string>(props: {
  readonly legend: string;
  readonly name: string;
  readonly choices: readonly Choice<T>[];
  readonly value: T;
  readonly onChange: (id: T) => void;
  readonly unavailable?: (id: T) => string | undefined;
  readonly note?: string;
}) {
  return (
    <fieldset className={styles.section}>
      <legend>{props.legend}</legend>
      {props.choices.map((choice) => {
        const why = props.unavailable?.(choice.id);
        return (
          <label key={choice.id} className={styles.choice}>
            <input type="radio" name={props.name} checked={props.value === choice.id} disabled={why !== undefined} onChange={() => props.onChange(choice.id)} />
            <span>
              <span className={styles.word}>{choice.label}</span>
              {' — '}
              {choice.text}
              {why === undefined ? null : <span className={styles.muted}> (Not with the chosen format: {why}.)</span>}
            </span>
          </label>
        );
      })}
      {props.note === undefined ? null : <p className={styles.muted}>{props.note}</p>}
    </fieldset>
  );
}

function Options(props: { readonly model: ExportModel; readonly state: ExportState }) {
  const { model, state } = props;
  const nameId = useId();
  const finalName = fileNameOf(state.base, state.format);
  return (
    <div className={styles.body}>
      <p className={styles.muted}>
        An export is your backup, and how you share data. Your browser may clear its stored data, so keep a copy of the file somewhere else too.
      </p>
      <Group legend="File format" name="export-format" choices={FORMATS} value={state.format} onChange={model.setFormat} />
      <Group legend="What to include" name="export-scope" choices={SCOPES} value={state.scope} onChange={model.setScope} />
      <Group
        legend="Images"
        name="export-images"
        choices={IMAGES}
        value={state.images}
        onChange={model.setImages}
        unavailable={(id) => imagesUnavailable(id, state.format)}
        note={imagesNote(state.imageInfo)}
      />
      <div className={styles.section}>
        <label htmlFor={nameId}>File name</label>
        <input id={nameId} type="text" value={state.base} maxLength={120} onChange={(event) => model.setBase(event.target.value)} spellCheck={false} autoComplete="off" />
        <p className={styles.muted}>
          It will be saved as <span className={styles.word}>{finalName}</span> (made safe for a file system: letters, digits, dots, dashes and underscores). The extension {EXTENSION[state.format]} is added for you.
        </p>
      </div>
    </div>
  );
}

function Lines(props: { readonly label: string; readonly lines: readonly string[] }) {
  if (props.lines.length === 0) return null;
  return (
    <section className={styles.section} aria-label={props.label}>
      <h3>{props.label}</h3>
      <ul className={styles.counts}>
        {props.lines.map((line, index) => (
          <li key={`${index}:${line}`}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

function Done(props: { readonly state: ExportState }) {
  const written = props.state.written;
  if (written === undefined) return null;
  const gaps = written.missingAssets.length + written.missingReferences.length;
  return (
    <div className={styles.body} role="status">
      <p className={styles.file}>
        Saved <span className={styles.word}>{shownName(written.fileName)}</span> ({written.size}) to your downloads.
      </p>
      <p>
        It holds {written.total} record{written.total === 1 ? '' : 's'}: {written.counts}.
      </p>
      {gaps === 0 ? <p>Nothing is missing from it.</p> : <p>Some things are missing from it; they are listed below.</p>}
      <Lines label="Images without their picture" lines={written.missingAssets} />
      <Lines label="References that leave the file" lines={written.missingReferences} />
      {written.inProcess ? <p className={styles.muted}>It was built on this page, not by the background worker.</p> : null}
      <p className={styles.muted}>To restore it later, use File, Import a file, and choose it.</p>
    </div>
  );
}

export function ExportScreen(props: { readonly model: ExportModel }) {
  const { model } = props;
  const state = useStore(model.store);
  const { phase } = state;
  let footer = null;
  let body = null;
  if (phase === 'options') {
    body = <Options model={model} state={state} />;
    footer = (
      <>
        <Button onClick={model.close}>Cancel</Button>
        <Button variant="primary" {...(state.blocked === undefined ? { onClick: () => model.start() } : { unavailable: state.blocked })}>
          Export
        </Button>
      </>
    );
  } else if (phase === 'running') {
    body = (
      <div className={styles.body} role="status">
        <p className={styles.progress}>{state.progress ?? 'Starting'}…</p>
        <p className={styles.muted}>Cancel stops the export and no file is made.</p>
      </div>
    );
    footer = <Button onClick={model.cancel}>Cancel</Button>;
  } else if (phase === 'done') {
    body = <Done state={state} />;
    footer = (
      <>
        <Button onClick={model.saveAgain}>Save the file again</Button>
        <Button variant="primary" onClick={model.close}>
          Close
        </Button>
      </>
    );
  } else if (phase === 'cancelled') {
    body = (
      <div className={styles.body} role="status">
        <p>Cancelled. No file was made and nothing was changed.</p>
      </div>
    );
    footer = (
      <>
        <Button onClick={model.again}>Back to the options</Button>
        <Button variant="primary" onClick={model.close}>
          Close
        </Button>
      </>
    );
  } else if (phase === 'refused' && state.refusal !== undefined) {
    body = (
      <div className={styles.body} role="alert">
        <h3>{state.refusal.title}</h3>
        <p>{state.refusal.text}</p>
      </div>
    );
    footer = (
      <>
        {state.offerInProcess ? (
          <Button variant="primary" onClick={() => model.start(true)}>
            Build it on this page
          </Button>
        ) : (
          <Button onClick={model.again}>Back to the options</Button>
        )}
        <Button onClick={model.close}>Close</Button>
      </>
    );
  }
  return (
    <Dialog open={phase !== 'closed'} onClose={model.cancel} title={TITLES[phase]} size="wide" {...(footer === null ? {} : { footer })}>
      {body}
    </Dialog>
  );
}
