/**
 * A species' properties (step 6.6a, decision C4 as decided in the Part 1 review): summary lines "<property> · <value>", one open at a time.
 * An open property edits what the schema types: the property (no default, "Choose a property"), its name (required, shown only for
 * "Other"), the value (free text with the unit written in it, a hint under it per key that is never a finding and never changes the
 * value), a note, and citations (the shared component). No chemistry.
 */
import { useState } from 'react';
import { PROPERTY_KEYS } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { addProperty, movePropertyBy, PROPERTY_HINTS, PROPERTY_KEY_WORDS, propertiesOf, propertyLine, propertyName, removeProperty, setPropertyKey, setPropertyText } from './properties-model';
import type { RecordPickerPort } from './record-picker-contracts';
import { RichTextField } from './rich-text-field';
import type { SectionProps } from './section-props';
import { CitationsSection } from './shared-sections';
import styles from './editor.module.css';

const MAX_PROPERTIES = 64;

export function PropertiesSection(props: SectionProps & { readonly picker: RecordPickerPort | undefined }) {
  const properties = propertiesOf(props.draft);
  const locked = props.unavailable;
  const [openAt, setOpenAt] = useState<number | null>(null);
  const bad = (path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);
  return (
    <div className={styles.list} role="group" aria-label="Properties section">
      {properties.length === 0 ? <p className={styles.hint}>None.</p> : null}
      <ul aria-label="Properties">
        {properties.map((property, index) => {
          const name = property.key === '' ? `${index + 1}` : propertyName(property);
          const base = `properties[${index}]`;
          const open = openAt === index;
          const hint = property.key === '' ? undefined : PROPERTY_HINTS[property.key as keyof typeof PROPERTY_HINTS];
          return (
            <li key={index} data-phone={props.phone === true ? 'true' : undefined} className={props.phone === true ? `${styles.row} ${styles.rowPhone}` : styles.row}>
              <span>{propertyLine(property)}</span>
              <Button aria-label={`Edit property ${name}`} aria-expanded={open} onClick={() => setOpenAt(open ? null : index)}>
                Edit
              </Button>
              <Button aria-label={`Move property ${name} up`} {...(locked !== undefined ? { unavailable: locked } : index === 0 ? { unavailable: 'it is the first' } : { onClick: () => { setOpenAt(null); props.onEdit(movePropertyBy(index, -1)); } })}>
                Up
              </Button>
              <Button aria-label={`Move property ${name} down`} {...(locked !== undefined ? { unavailable: locked } : index === properties.length - 1 ? { unavailable: 'it is the last' } : { onClick: () => { setOpenAt(null); props.onEdit(movePropertyBy(index, 1)); } })}>
                Down
              </Button>
              <Button aria-label={`Remove property ${name}`} {...(locked !== undefined ? { unavailable: locked } : { onClick: () => { setOpenAt(null); props.onEdit(removeProperty(index)); } })}>
                Remove
              </Button>
              {!open ? null : (
                <div className={styles.field}>
                  <label htmlFor={`property-key-${index}`}>Property</label>
                  <select id={`property-key-${index}`} value={property.key} disabled={locked !== undefined} aria-invalid={bad(`${base}.key`)} data-field-path={`${base}.key`} onChange={(event) => props.onEdit(setPropertyKey(index, event.target.value), `${base}.key`)}>
                    <option value="">Choose a property</option>
                    {PROPERTY_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {PROPERTY_KEY_WORDS[key]}
                      </option>
                    ))}
                  </select>
                  {property.key !== 'other' ? null : (
                    <>
                      <label htmlFor={`property-label-${index}`}>Name of the property (required)</label>
                      <input id={`property-label-${index}`} type="text" value={property.label} readOnly={locked !== undefined} aria-invalid={bad(`${base}.label`)} data-field-path={`${base}.label`} autoComplete="off" onChange={(event) => props.onEdit(setPropertyText(index, 'label', event.target.value), `${base}.label`)} />
                    </>
                  )}
                  <label htmlFor={`property-value-${index}`}>Value</label>
                  <input id={`property-value-${index}`} type="text" value={property.value} readOnly={locked !== undefined} aria-invalid={bad(`${base}.value`)} data-field-path={`${base}.value`} autoComplete="off" onChange={(event) => props.onEdit(setPropertyText(index, 'value', event.target.value), `${base}.value`)} />
                  {hint === undefined ? null : <p className={styles.hint}>{hint}</p>}
                  <RichTextField id={`property-note-${index}`} label="Note of the property" path={`${base}.note`} value={property.note} invalid={props.invalid?.has(`${base}.note`) === true} unavailable={locked} phone={props.phone} rows={2} onChange={(value) => props.onEdit(setPropertyText(index, 'note', value), `${base}.note`)} />
                  <CitationsSection draft={props.draft} onEdit={props.onEdit} invalid={props.invalid} unavailable={locked} phone={props.phone} picker={props.picker} path={`properties.${index}.citations`} label="Citations of this property" />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Button
        {...(locked !== undefined
          ? { unavailable: locked }
          : properties.length >= MAX_PROPERTIES
            ? { unavailable: `at most ${MAX_PROPERTIES} properties` }
            : { onClick: () => { props.onEdit(addProperty()); setOpenAt(properties.length); } })}
      >
        Add property
      </Button>
    </div>
  );
}
