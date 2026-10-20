/**
 * The mechanism editor's Variants section (step 6.5a decision D3 and D7): each variant is ONE summary line ("<label> · <n> steps ·
 * <applicability>") with Edit, Up, Down and Remove; the open one (one at a time) holds its label, applicability (rich text), rate law and
 * steps. Remove asks first; a variant an outcome of any reaction uses is refused in words ("Outcome 1 of <reaction> uses this pathway; change
 * that link first"). Text only; the recipes decide.
 */
import { useState, type ReactNode } from 'react';
import { Button } from '@/ui/primitives';
import conditionStyles from './condition.module.css';
import type { MechanismLinksPort, VariantUse } from './mechanism-contracts';
import { addVariant, moveVariant, removeVariant, setVariantApplicability, setVariantLabel, setVariantRateLaw, variantSummary, variantsViewOf } from './mechanism-model';
import { RichTextField } from './rich-text-field';
import type { SectionProps } from './section-props';
import { SummaryLine } from './summary-line';
import styles from './editor.module.css';
import fields from './step-fields.module.css';
import own from './participant.module.css';

export interface MechanismVariantsProps extends SectionProps {
  /** A fresh variant ID ('mvr'). */
  readonly newId: (prefix: string) => string;
  readonly links?: MechanismLinksPort | undefined;
  /** The steps of the open variant (step 6.5a part 4). */
  readonly renderSteps?: ((variantIndex: number) => ReactNode) | undefined;
}

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

/** "Outcome 1 of X uses this pathway; change that link first" (one use) or the same for several; undefined when nothing uses it. */
export function usageWords(uses: readonly VariantUse[]): string | undefined {
  if (uses.length === 0) return undefined;
  const items = uses.map((use) => `Outcome ${use.outcomeNumber} of ${use.reactionName}`);
  return uses.length === 1 ? `${items[0]} uses this pathway; change that link first` : `${items.join('; ')} use this pathway; change those links first`;
}

export function MechanismVariantsSection(props: MechanismVariantsProps) {
  const variants = variantsViewOf(props.draft);
  const rawId = (props.draft as { id?: unknown } | null)?.id;
  const mechanismId = typeof rawId === 'string' ? rawId : '';
  const { onEdit } = props;
  const locked = props.unavailable;
  const [openId, setOpenId] = useState<string | null>(null);
  const [asking, setAsking] = useState<number | null>(null);
  const [said, setSaid] = useState('');
  const [label, setLabel] = useState('');
  const off = (action: () => void, why?: string) => (locked !== undefined ? { unavailable: locked } : why !== undefined ? { unavailable: why } : { onClick: action });
  return (
    <div>
      {variants.length === 0 ? <p className={styles.hint}>No variants yet. A mechanism with only a summary is fine; add a variant (for example an acid-catalysed and a base-catalysed pathway) to describe its steps.</p> : null}
      <ul className={styles.list} aria-label="Variants" data-field-path="variants">
        {variants.map((variant, index) => {
          const n = index + 1;
          const base = `variants[${index}]`;
          const open = openId === variant.id;
          const refusal = usageWords(props.links?.variantUses(mechanismId, variant.id) ?? []);
          return (
            <li key={variant.id || index} className={`${styles.panel} ${props.phone === true ? fields.nestedVariant : ''}`} data-testid="mech-variant-row" data-phone={props.phone === true ? 'true' : undefined}>
              <div role="group" aria-label={`Variant ${n}`} className={`${own.participantBody} ${props.phone === true ? own.participantPhone : ''}`}>
                <div className={own.participantHead}>
                  <span className={conditionStyles.summary} data-testid="mech-variant-summary" aria-invalid={bad(props, base)}>
                    <SummaryLine text={`${n}. ${variantSummary(variant)}`} />
                  </span>
                  <div className={own.participantActions}>
                    <Button aria-label={`${open ? 'Close' : 'Edit'} variant ${n}`} aria-expanded={open} data-field-path={base} data-open-row="" onClick={() => setOpenId(open ? null : variant.id)}>
                      {open ? 'Close' : 'Edit'}
                    </Button>
                    <Button aria-label={`Move variant ${n} up`} {...off(() => onEdit(moveVariant(index, -1)), index === 0 ? 'it is first' : undefined)}>
                      Up
                    </Button>
                    <Button aria-label={`Move variant ${n} down`} {...off(() => onEdit(moveVariant(index, 1)), index === variants.length - 1 ? 'it is last' : undefined)}>
                      Down
                    </Button>
                    <Button aria-label={`Remove variant ${n}`} {...off(() => setAsking(index), refusal)}>
                      Remove
                    </Button>
                  </div>
                </div>
                {refusal === undefined ? null : <p className={styles.hint}>{refusal}</p>}
                {asking === index ? (
                  <div className={styles.confirm} role="group" aria-label={`Remove variant ${n}?`}>
                    <span>
                      No outcome uses variant {n}.{variant.stepCount > 0 ? ` Its ${variant.stepCount} ${variant.stepCount === 1 ? 'step is' : 'steps are'} removed with it.` : ''}
                    </span>
                    <Button
                      variant="primary"
                      onClick={() => {
                        onEdit(removeVariant(index));
                        setAsking(null);
                        if (open) setOpenId(null);
                        setSaid(`Variant ${n} was removed.`);
                      }}
                    >
                      Remove the variant
                    </Button>
                    <Button onClick={() => setAsking(null)}>Cancel</Button>
                  </div>
                ) : null}
                {open ? (
                  <>
                    <div className={styles.field}>
                      <label htmlFor={`mech-variant-label-${index}`}>Label (required)</label>
                      <input id={`mech-variant-label-${index}`} type="text" aria-label={`Label of variant ${n}`} value={variant.label} readOnly={locked !== undefined} aria-invalid={bad(props, `${base}.label`)} data-field-path={`${base}.label`} autoComplete="off" onChange={(event) => onEdit(setVariantLabel(index, event.target.value), `${base}.label`)} />
                    </div>
                    <RichTextField
                      id={`mech-variant-app-${index}`}
                      label={`Applicability of variant ${n}`}
                      path={`${base}.applicability`}
                      value={variant.applicability}
                      invalid={props.invalid?.has(`${base}.applicability`) === true}
                      unavailable={locked}
                      phone={props.phone}
                      linkExists={props.links?.exists}
        linkName={props.links?.name}
                      rows={2}
                      onChange={(value) => onEdit(setVariantApplicability(index, value), `${base}.applicability`)}
                    />
                    <div className={styles.field}>
                      <label htmlFor={`mech-variant-rate-${index}`}>Rate law</label>
                      <input id={`mech-variant-rate-${index}`} type="text" aria-label={`Rate law of variant ${n}`} value={variant.rateLaw} readOnly={locked !== undefined} aria-invalid={bad(props, `${base}.rateLaw`)} data-field-path={`${base}.rateLaw`} autoComplete="off" onChange={(event) => onEdit(setVariantRateLaw(index, event.target.value), `${base}.rateLaw`)} />
                    </div>
                    {props.renderSteps?.(index)}
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className={styles.field}>
        <label htmlFor="new-mech-variant-label">Label of a new variant (required)</label>
        <input id="new-mech-variant-label" type="text" value={label} readOnly={locked !== undefined} autoComplete="off" onChange={(event) => setLabel(event.target.value)} />
      </div>
      <Button
        {...off(() => {
          const id = props.newId('mvr');
          onEdit(addVariant(id, label));
          setOpenId(id);
          setLabel('');
          setSaid(`Variant ${variants.length + 1} was added; it has no steps yet.`);
        }, label.trim() === '' ? 'write its label first' : undefined)}
      >
        Add variant
      </Button>
      <p className={styles.hint} role="status">
        {said}
      </p>
    </div>
  );
}
