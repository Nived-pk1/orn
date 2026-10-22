/**
 * The syllabus units of an exam version (exams step part 2, X2): each unit a summary line ("<unit> · <n> topics") with Open / Close and
 * Remove, ONE open at a time; the open unit shows its title, code, official wording and its topic coverage rows (a topic through the topic
 * list and a coverage, both "Choose ..." with no default). Removing a unit or a row asks first. The rule CUR-002 (a topic twice in one
 * version) is the findings panel's; this component only edits the draft.
 */
import { useState } from 'react';
import { COVERAGE_LEVELS } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { TextField } from './exam-fields';
import { addRow, addUnit, COVERAGE_WORDS, removeRow, removeUnit, rowsWord, setRowChoice, setUnitText, unitsOf } from './exam-model';
import type { PickerSectionProps } from './knowledge-sections';
import { RichTextField } from './rich-text-field';
import { SummaryLine } from './summary-line';
import rows from './exam-rows.module.css';
import styles from './editor.module.css';

type Asking = { readonly unit: number; readonly row?: number } | null;

const unitName = (title: string, index: number): string => (title === '' ? `unit ${index + 1}` : title);

function Rows(props: PickerSectionProps & { readonly unit: number; readonly asking: Asking; readonly ask: (value: Asking) => void }) {
  const [changing, setChanging] = useState<number | null>(null); // the row whose topic is being chosen again
  const unit = unitsOf(props.draft)[props.unit];
  const topics = props.picker?.topics?.() ?? [];
  const locked = props.unavailable !== undefined;
  const bad = (path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);
  return (
    <div>
      {(unit?.rows ?? []).map((row, index) => {
        const n = index + 1;
        const base = `units[${props.unit}].topicCoverage[${index}]`;
        return (
          <div key={index} className={rows.coverageRow} role="group" aria-label={`Coverage row ${n}`}>
            {row.topicId !== '' && changing !== index ? (
              <>
                <span className={rows.topicName} data-topic-name="">
                  {topics.find((t) => t.id === row.topicId)?.name ?? `${row.topicId} (not in this dataset)`}
                </span>
                <Button aria-label={`Change topic of row ${n}`} data-field-path={`${base}.topicId`} {...(locked ? { unavailable: props.unavailable as string } : { onClick: () => setChanging(index) })}>
                  Change topic
                </Button>
              </>
            ) : (
              <select
                aria-label={`Topic of row ${n}`}
                value={row.topicId}
                disabled={locked}
                aria-invalid={bad(`${base}.topicId`)}
                data-field-path={`${base}.topicId`}
                onChange={(event) => {
                  props.onEdit(setRowChoice(props.unit, index, 'topicId', event.target.value));
                  if (event.target.value !== '') setChanging(null);
                }}
              >
                <option value="">Choose a topic</option>
                {row.topicId === '' || topics.some((t) => t.id === row.topicId) ? null : <option value={row.topicId}>{row.topicId} (not in this dataset)</option>}
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {`${'– '.repeat(topic.depth)}${topic.name}`}
                  </option>
                ))}
              </select>
            )}
            <select aria-label={`Coverage of row ${n}`} value={row.coverage} disabled={locked} aria-invalid={bad(`${base}.coverage`)} data-field-path={`${base}.coverage`} onChange={(event) => props.onEdit(setRowChoice(props.unit, index, 'coverage', event.target.value))}>
              <option value="">Choose coverage</option>
              {COVERAGE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {COVERAGE_WORDS[level]}
                </option>
              ))}
            </select>
            <Button aria-label={`Remove row ${n}`} {...(locked ? { unavailable: props.unavailable as string } : { onClick: () => props.ask({ unit: props.unit, row: index }) })}>
              Remove
            </Button>
            {props.asking?.unit === props.unit && props.asking.row === index ? (
              <div className={styles.confirm} role="group" aria-label={`Remove row ${n}?`}>
                <Button
                  onClick={() => {
                    props.onEdit(removeRow(props.unit, index));
                    props.ask(null);
                  }}
                >
                  Remove the row
                </Button>
                <Button onClick={() => props.ask(null)}>Keep</Button>
              </div>
            ) : null}
          </div>
        );
      })}
      <Button {...(locked ? { unavailable: props.unavailable as string } : { onClick: () => props.onEdit(addRow(props.unit)) })}>Add a topic</Button>
    </div>
  );
}

export function ExamUnits(props: PickerSectionProps & { readonly newId: (prefix: string) => string }) {
  const units = unitsOf(props.draft);
  const [open, setOpen] = useState<number | null>(null);
  const [asking, ask] = useState<Asking>(null);
  const locked = props.unavailable !== undefined;
  const bad = (path: string): boolean => props.invalid?.has(path) === true;
  return (
    <div>
      {units.length === 0 ? <p className={styles.hint}>No syllabus units yet. A unit groups the topics a version covers.</p> : null}
      {units.length === 0 ? null : (
        <ul aria-label="Syllabus units" className={styles.list}>
          {units.map((unit, index) => {
            const name = unitName(unit.title, index);
            const isOpen = open === index;
            return (
              <li key={unit.id || index}>
                <SummaryLine text={`${name} · ${rowsWord(unit.rows.length)}`} />{' '}
                <Button aria-label={`${isOpen ? 'Close' : 'Open'} unit ${name}`} onClick={() => setOpen(isOpen ? null : index)}>
                  {isOpen ? 'Close' : 'Open'}
                </Button>
                <Button aria-label={`Remove unit ${name}`} {...(locked ? { unavailable: props.unavailable as string } : { onClick: () => ask({ unit: index }) })}>
                  Remove
                </Button>
                {asking?.unit === index && asking.row === undefined ? (
                  <div className={styles.confirm} role="group" aria-label={`Remove unit ${name}?`}>
                    <span>{`Remove ${name} and its ${unit.rows.length} coverage ${unit.rows.length === 1 ? 'row' : 'rows'}?`}</span>
                    <Button
                      onClick={() => {
                        props.onEdit(removeUnit(index));
                        setOpen(null);
                        ask(null);
                      }}
                    >
                      Remove the unit
                    </Button>
                    <Button onClick={() => ask(null)}>Keep</Button>
                  </div>
                ) : null}
                {isOpen ? (
                  <div>
                    <TextField id="unit-title" label="Unit title (required)" path={`units[${index}].title`} value={unit.title} required make={(value) => setUnitText(index, 'title', value)} invalid={bad(`units[${index}].title`)} unavailable={props.unavailable} onEdit={props.onEdit} />
                    <TextField id="unit-code" label="Code" path={`units[${index}].code`} value={unit.code} make={(value) => setUnitText(index, 'code', value)} hint="Optional: the number or code of the unit in the syllabus." invalid={bad(`units[${index}].code`)} unavailable={props.unavailable} onEdit={props.onEdit} />
                    <RichTextField id="unit-official" label="Official wording" path={`units[${index}].officialText`} value={unit.officialText} invalid={bad(`units[${index}].officialText`)} unavailable={props.unavailable} phone={props.phone} onChange={(value) => props.onEdit(setUnitText(index, 'officialText', value), `units[${index}].officialText`)} />
                    <Rows {...props} unit={index} asking={asking} ask={ask} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Button
        {...(locked
          ? { unavailable: props.unavailable as string }
          : {
              onClick: () => {
                props.onEdit(addUnit(props.newId('unt')));
                setOpen(units.length);
              },
            })}
      >
        Add a unit
      </Button>
    </div>
  );
}
