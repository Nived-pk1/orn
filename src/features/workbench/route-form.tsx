/**
 * The route form (7.2b C1): Identity (name, purpose), Target (a species or class through the picker), Steps, the texts (description,
 * notes, concepts, tags, citations), Pictures and Review. RTE-001 to RTE-004 are the real rules, shown live by the host.
 */
import { Button } from '@/ui/primitives';
import { ROUTE_PURPOSES } from '@/core/schema';
import { ROUTE_PURPOSES_WORDS, routeViewOf, setPurpose, setRouteName, setTarget } from './route-model';
import { RouteStepsSection } from './route-steps';
import { choiceLine, RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import { PicturesFrame } from './pictures-frame';
import { SectionFrame } from './section-frame';
import type { SectionProps } from './section-props';
import { NotesSection } from './shared-sections';
import { SharedFieldsSection } from './shared-bundle';
import { ReviewSection } from './species-sections';
import styles from './editor.module.css';

export interface RouteFormProps extends SectionProps {
  readonly picker?: RecordPickerPort | undefined;
  readonly newId: (prefix: string) => string;
}

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

function IdentitySection(props: SectionProps) {
  const view = routeViewOf(props.draft);
  const locked = props.unavailable !== undefined;
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="route-name">Name (required)</label>
        <input id="route-name" type="text" value={view.name} readOnly={locked} aria-invalid={bad(props, 'name')} data-field-path="name" autoComplete="off" spellCheck={false} onChange={(event) => props.onEdit(setRouteName(event.target.value), 'name')} />
        {view.name.trim() === '' ? <p className={styles.hint}>Choose a name.</p> : null}
      </div>
      <div className={styles.field}>
        <label htmlFor="route-purpose">What this route is</label>
        <select id="route-purpose" value={view.purpose} disabled={locked} aria-invalid={bad(props, 'purpose')} data-field-path="purpose" onChange={(event) => props.onEdit(setPurpose(event.target.value))}>
          {ROUTE_PURPOSES.map((purpose) => (
            <option key={purpose} value={purpose}>
              {ROUTE_PURPOSES_WORDS[purpose]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function TargetSection(props: RouteFormProps) {
  const view = routeViewOf(props.draft);
  const locked = props.unavailable;
  const { picker } = props;
  return (
    <div>
      {view.target === undefined ? (
        <p className={styles.hint}>No target chosen: say what this route makes (RTE-004 checks the last step).</p>
      ) : (
        <p>
          <span>{choiceLine(picker?.describe(view.target.kind as 'species', view.target.id), view.target.id)}</span>{' '}
          <Button aria-label="Remove the target" {...(locked === undefined ? { onClick: () => props.onEdit(setTarget(undefined)) } : { unavailable: locked })}>
            Remove
          </Button>
        </p>
      )}
      <RecordPicker
        id="route-target-search"
        label="Find the target compound by name"
        kinds={['species', 'class']}
        port={picker}
        noun="compound"
        resultsLabel="Compounds found"
        unavailable={locked}
        isListed={(choice) => view.target?.id === choice.id}
        onPick={(choice) => props.onEdit(setTarget({ kind: choice.kind, id: choice.id }))}
      />
    </div>
  );
}

export function RouteForm(props: RouteFormProps) {
  const open = props.phone !== true;
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="identity" title="Identity">
        <IdentitySection {...common} />
      </SectionFrame>
      <SectionFrame id="target" title="Target">
        <TargetSection {...common} picker={props.picker} newId={props.newId} />
      </SectionFrame>
      <SectionFrame id="steps" title="Steps">
        <RouteStepsSection {...common} picker={props.picker} newId={props.newId} />
      </SectionFrame>
      <SectionFrame id="description" title="Description" initiallyOpen={open}>
        <NotesSection {...common} fields={['description']} />
      </SectionFrame>
      <PicturesFrame kind="route" form={props} />
      <SectionFrame id="shared" title="Concepts, notes, tags and citations" initiallyOpen={open}>
        <SharedFieldsSection {...common} notes={['notes']} concepts picker={props.picker} />
      </SectionFrame>
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
    </div>
  );
}
