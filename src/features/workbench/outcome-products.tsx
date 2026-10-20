/**
 * The products of ONE expanded outcome (step 6.4b decision D1): a row each (the substance, the role as three radio buttons Main / Coproduct /
 * Byproduct with NO default, Up, Down, Remove, and a collapsed "More details": coefficient, phase, source wording, note), and "Add a product"
 * through the generic picker limited by the reaction's scope (specific: species; generic: classes; no scope yet: both; a product of the
 * other kind already stored stays shown). Text only; the recipes and the core decide.
 */
import { useState } from 'react';
import { PHASES, PRODUCT_ROLES } from '@/core/schema';
import { Button } from '@/ui/primitives';
import {
  addProduct,
  moveProduct,
  removeProduct,
  setProductCoefficient,
  setProductPhase,
  setProductRole,
  setProductText,
  type ProductKind,
  type ProductPhaseValue,
  type ProductRoleValue,
} from './outcome-model';
import { type OutcomeView } from './outcome-view';
import { RecordPicker, choiceLine } from './record-picker';
import type { PickKind, RecordPickerPort } from './record-picker-contracts';
import { wordsOf } from './reagent-model';
import type { SectionProps } from './section-props';
import styles from './editor.module.css';
import own from './outcome.module.css';

export interface OutcomeProductsProps extends SectionProps {
  readonly index: number;
  readonly outcome: OutcomeView;
  readonly picker?: RecordPickerPort | undefined;
  readonly newId: (prefix: string) => string;
}

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);
const numberOf = (raw: string): number | undefined => (raw === '' || !Number.isFinite(Number(raw)) ? undefined : Number(raw));

/** The kinds the picker offers for a reaction of this scope, and the sentence that says why. */
export function productKindsOf(draft: unknown): {
  readonly kinds: readonly PickKind[];
  readonly words: string;
} {
  const scope = typeof draft === 'object' && draft !== null ? (draft as { scope?: unknown }).scope : undefined;
  if (scope === 'specific')
    return {
      kinds: ['species'],
      words: 'A specific reaction names species as products.',
    };
  if (scope === 'generic')
    return {
      kinds: ['class'],
      words: 'A generic reaction names compound classes as products.',
    };
  return {
    kinds: ['species', 'class'],
    words: "Choose the reaction's scope in Identity: a specific reaction names species, a generic one classes.",
  };
}

export function OutcomeProducts(props: OutcomeProductsProps) {
  const { outcome, index, onEdit, picker } = props;
  const locked = props.unavailable;
  const on = index + 1;
  const [said, setSaid] = useState('');
  const { kinds, words } = productKindsOf(props.draft);
  const off = (action: () => void, reason?: string) => (locked !== undefined ? { unavailable: locked } : reason !== undefined ? { unavailable: reason } : { onClick: action });
  return (
    <div>
      <h4 className={styles.hint}>Products</h4>
      {outcome.products.length === 0 ? <p className={styles.hint}>No products yet: an outcome needs at least one (RXN-003).</p> : null}
      <ul className={own.productList} aria-label={`Products of outcome ${on}`} data-field-path={`outcomes[${index}].products`}>
        {outcome.products.map((product, at) => {
          const n = at + 1;
          const base = `outcomes[${index}].products[${at}]`;
          const choice = product.substance === undefined ? undefined : picker?.describe(product.substance.kind, product.substance.id);
          return (
            <li key={product.id || at} className={props.phone === true ? `${own.product} ${own.productPhone}` : own.product} data-testid="product-row">
              <div role="group" aria-label={`Product ${n} of outcome ${on}`} className={styles.participantBody}>
                <strong tabIndex={-1} data-field-path={`${base}.ref`} aria-invalid={bad(props, `${base}.ref`)}>
                  {n}. {product.substance === undefined ? 'No substance' : choiceLine(choice, product.substance.id)}
                </strong>
                <fieldset className={own.roleGroup} aria-label={`Role of product ${n} of outcome ${on}`} data-field-path={`${base}.role`} aria-invalid={bad(props, `${base}.role`)}>
                  {product.role === undefined ? <legend>Choose a role</legend> : null}
                  {PRODUCT_ROLES.map((role) => (
                    <label key={role} className={own.roleChoice}>
                      <input
                        type="radio"
                        name={`product-role-${index}-${product.id || at}`}
                        value={role}
                        checked={product.role === role}
                        disabled={locked !== undefined}
                        onChange={() => onEdit(setProductRole(index, at, role as ProductRoleValue))}
                      />
                      {wordsOf(role)}
                    </label>
                  ))}
                </fieldset>
                <div className={styles.participantActions}>
                  <Button aria-label={`Move product ${n} of outcome ${on} up`} {...off(() => onEdit(moveProduct(index, at, -1)), at === 0 ? 'it is first' : undefined)}>
                    Up
                  </Button>
                  <Button aria-label={`Move product ${n} of outcome ${on} down`} {...off(() => onEdit(moveProduct(index, at, 1)), at === outcome.products.length - 1 ? 'it is last' : undefined)}>
                    Down
                  </Button>
                  <Button
                    aria-label={`Remove product ${n} of outcome ${on}`}
                    {...off(() => {
                      onEdit(removeProduct(index, at));
                      setSaid(`Product ${n} was removed.`);
                    })}
                  >
                    Remove
                  </Button>
                </div>
                <details>
                  <summary>More details</summary>
                  <div className={styles.participantGrid}>
                    <div className={styles.field}>
                      <label htmlFor={`pd-coef-${index}-${at}`}>Coefficient</label>
                      <input
                        id={`pd-coef-${index}-${at}`}
                        type="number"
                        step="any"
                        min="0"
                        aria-label={`Coefficient of product ${n} of outcome ${on}`}
                        value={product.coefficient ?? ''}
                        readOnly={locked !== undefined}
                        aria-invalid={bad(props, `${base}.coefficient`)}
                        data-field-path={`${base}.coefficient`}
                        onChange={(event) => onEdit(setProductCoefficient(index, at, numberOf(event.target.value)), `${base}.coefficient`)}
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={`pd-phase-${index}-${at}`}>Phase</label>
                      <select
                        id={`pd-phase-${index}-${at}`}
                        aria-label={`Phase of product ${n} of outcome ${on}`}
                        value={product.phase}
                        disabled={locked !== undefined}
                        aria-invalid={bad(props, `${base}.phase`)}
                        data-field-path={`${base}.phase`}
                        onChange={(event) => onEdit(setProductPhase(index, at, event.target.value as ProductPhaseValue | ''))}
                      >
                        <option value="">Not stated</option>
                        {PHASES.map((phase) => (
                          <option key={phase} value={phase}>
                            {phase}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={`pd-text-${index}-${at}`}>Source wording</label>
                      <input
                        id={`pd-text-${index}-${at}`}
                        type="text"
                        aria-label={`Source wording of product ${n} of outcome ${on}`}
                        value={product.originalText}
                        readOnly={locked !== undefined}
                        aria-invalid={bad(props, `${base}.originalText`)}
                        data-field-path={`${base}.originalText`}
                        autoComplete="off"
                        onChange={(event) => onEdit(setProductText(index, at, 'originalText', event.target.value), `${base}.originalText`)}
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={`pd-note-${index}-${at}`}>Note</label>
                      <textarea
                        id={`pd-note-${index}-${at}`}
                        aria-label={`Note of product ${n} of outcome ${on}`}
                        value={product.note}
                        readOnly={locked !== undefined}
                        aria-invalid={bad(props, `${base}.note`)}
                        data-field-path={`${base}.note`}
                        onChange={(event) => onEdit(setProductText(index, at, 'note', event.target.value), `${base}.note`)}
                      />
                    </div>
                  </div>
                </details>
              </div>
            </li>
          );
        })}
      </ul>
      <p className={styles.hint}>{words}</p>
      <RecordPicker
        id={`product-search-${index}`}
        label={`Find a product of outcome ${on} by name`}
        kinds={kinds}
        port={picker}
        noun="substance"
        resultsLabel={`Products found for outcome ${on}`}
        unavailable={locked}
        isListed={() => false}
        onPick={(found) => {
          if (found.kind !== 'species' && found.kind !== 'class') return;
          props.onEdit(
            addProduct(index, props.newId('pdt'), {
              kind: found.kind as ProductKind,
              id: found.id,
            }),
          );
          setSaid(`${found.name} was added as product ${outcome.products.length + 1}; choose its role.`);
        }}
      />
      <p className={styles.hint} role="status">
        {said}
      </p>
    </div>
  );
}
