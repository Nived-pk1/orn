/**
 * The relationship form (step 6.6b part 4, decision N5): Type and ends (the type has no default; each end is picked from the records the
 * type allows; "A <-> B" for a symmetric type, "A -> B" with Swap for a directed one; the reverse kind only for "reverse of", and a stray one
 * is shown with the reason and removed only by the person), Note, Tags, Citations and Review. Collapsible and keyboard-navigable
 * (SectionFrame). The rules (REL-001 to REL-006) are the store's and the live panel's; this form only keeps the choices honest.
 */
import { RELATIONSHIP_TYPES, RELATIONSHIP_TYPE_SPECS, REVERSE_KINDS, type RelationshipType } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { RecordList, RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import { allowedKinds, relationshipViewOf, REVERSE_KIND_WORDS, setEnd, setRelationshipType, setReverseKind, swapEnds, TYPE_WORDS } from './relationship-model';
import { SectionFrame } from './section-frame';
import type { SectionProps } from './section-props';
import { SharedFieldsSection } from './shared-bundle';
import { ReviewSection } from './species-sections';
import styles from './editor.module.css';

export interface RelationshipFormProps extends SectionProps {
  readonly picker?: RecordPickerPort | undefined;
}

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

function EndField(props: RelationshipFormProps & { readonly end: 'from' | 'to' }) {
  const view = relationshipViewOf(props.draft);
  const { picker, end } = props;
  const chosen = view[end];
  const other = end === 'from' ? view.to : view.from;
  const kinds = allowedKinds(view.type);
  const label = end === 'from' ? 'From' : 'To';
  if (chosen !== undefined) {
    const kindOk = kinds.length === 0 || (kinds as readonly string[]).includes(chosen.kind);
    return (
      <div data-field-path={end} aria-invalid={bad(props, end)}>
        <RecordList label={`${label} record`} fieldPath={end} items={[{ kind: chosen.kind as never, id: chosen.id }]} port={picker} unavailable={props.unavailable} onRemove={() => props.onEdit(setEnd(end, undefined))} />
        {kindOk ? null : <p className={styles.notice}>This record is a {chosen.kind.replace(/_/g, ' ')}, which this type does not allow (REL-001): remove it and choose another.</p>}
      </div>
    );
  }
  if (kinds.length === 0) return <p className={styles.hint}>{label}: Choose a type first, because the type decides which records can be linked.</p>;
  return (
    <RecordPicker
      id={`relationship-${end}-search`}
      label={`Find the ${end} record by name`}
      kinds={kinds}
      port={picker}
      noun="record"
      resultsLabel="Records found"
      unavailable={props.unavailable}
      isListed={() => false}
      refusal={(choice) => (other !== undefined && other.kind === choice.kind && other.id === choice.id ? 'A record cannot be related to itself.' : undefined)}
      onPick={(choice) => props.onEdit(setEnd(end, { kind: choice.kind, id: choice.id }))}
    />
  );
}

function TypeAndEnds(props: RelationshipFormProps) {
  const view = relationshipViewOf(props.draft);
  const { picker } = props;
  const locked = props.unavailable !== undefined;
  const spec = Object.hasOwn(RELATIONSHIP_TYPE_SPECS, view.type) ? RELATIONSHIP_TYPE_SPECS[view.type as RelationshipType] : undefined;
  const name = (ref: { readonly kind: string; readonly id: string } | undefined): string => (ref === undefined ? '...' : (picker?.describe(ref.kind as never, ref.id)?.name ?? ref.id));
  const reverseShown = view.type === 'reverse_of' || view.reverseKind !== '';
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="relationship-type">Type of relationship</label>
        <select id="relationship-type" value={view.type} disabled={locked} aria-invalid={bad(props, 'type')} data-field-path="type" onChange={(event) => props.onEdit(setRelationshipType(event.target.value), 'type')}>
          <option value="">Choose a type</option>
          {RELATIONSHIP_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_WORDS[type]}
            </option>
          ))}
        </select>
      </div>
      {spec === undefined ? null : (
        <p>
          <strong>{`${name(view.from)} ${spec.symmetric ? '<->' : '->'} ${name(view.to)}`}</strong>
          {spec.symmetric ? null : (
            <>
              {' '}
              <Button {...(locked ? { unavailable: props.unavailable } : view.from === undefined || view.to === undefined ? { unavailable: 'choose both records first' } : { onClick: () => props.onEdit(swapEnds()) })}>Swap</Button>
            </>
          )}
        </p>
      )}
      <EndField {...props} end="from" />
      <EndField {...props} end="to" />
      {!reverseShown ? null : (
        <div className={styles.field}>
          <label htmlFor="relationship-reverse-kind">Reverse kind</label>
          <select id="relationship-reverse-kind" value={view.reverseKind} disabled={locked} aria-invalid={bad(props, 'reverseKind')} data-field-path="reverseKind" onChange={(event) => props.onEdit(setReverseKind(event.target.value), 'reverseKind')}>
            <option value="">Choose a reverse kind</option>
            {REVERSE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {REVERSE_KIND_WORDS[kind]}
              </option>
            ))}
          </select>
          {view.type === 'reverse_of' ? null : <p className={styles.notice}>Only "reverse of" has a reverse kind (REL-004). Choose "Choose a reverse kind" to remove it, or change the type back.</p>}
        </div>
      )}
    </div>
  );
}

export function RelationshipForm(props: RelationshipFormProps) {
  const open = props.phone !== true;
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="type" title="Type and records">
        <TypeAndEnds {...common} picker={props.picker} />
      </SectionFrame>
      <SectionFrame id="shared" title="Note, tags and citations" initiallyOpen={open}>
        <SharedFieldsSection {...common} notes={['note']} picker={props.picker} />
      </SectionFrame>
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
    </div>
  );
}
