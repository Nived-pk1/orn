/**
 * One substance of a card, drawn as in a textbook (step 5.5b): its structure at a FIXED size (an `<img>` with the object URL the depiction
 * manager made; never inlined markup), the name under it. A class, a reagent or a species without a structure shows its formula in the
 * same box and its name under it; so does a structure that is not available (the title says so). The box has the same size in every state, so
 * a card does not change height when a structure arrives.
 */
import type { RecordRef } from '@/core/schema';
import { STRUCTURE_AREA } from '@/render/scene';
import { useRetryingDepiction } from '@/render/svg';
import { useFamilyEnv } from './family-env';
import { FormulaText } from './family-text';
import styles from './family-page.module.css';

export function Structure(props: { readonly substance: RecordRef; readonly caption?: string }) {
  const env = useFamilyEnv();
  const described = env.describe(props.substance);
  const name = described?.name ?? props.substance.id;
  const key = env.keyOf(props.substance);
  const status = useRetryingDepiction(env.manager, key, env.timers);
  const boxStyle = { width: STRUCTURE_AREA.width, height: STRUCTURE_AREA.height };
  const url = key !== undefined && status.state === 'ready' ? status.url : undefined;
  const unavailable = key !== undefined && status.state === 'unavailable';
  return (
    <figure className={styles.substance} data-substance-id={props.substance.id}>
      <div className={styles.structure} style={boxStyle}>
        {url !== undefined ? (
          <img src={url} alt={`Structure of ${name}`} width={STRUCTURE_AREA.width} height={STRUCTURE_AREA.height} />
        ) : (
          <span className={styles.structureName} {...(unavailable ? { title: 'The structure could not be drawn' } : {})}>
            {key !== undefined && !unavailable ? <span className={styles.loadingMark}>Drawing the structure…</span> : null}
            {described?.formula === undefined ? (
              <span className={styles.noStructure}>{key === undefined ? 'No structure' : unavailable ? 'Structure not available' : ''}</span>
            ) : (
              <span className={styles.formula}>
                <FormulaText formula={described.formula} />
              </span>
            )}
          </span>
        )}
      </div>
      <figcaption className={styles.caption}>
        <span>{name}</span>
        {props.caption === undefined ? null : <span className={styles.selectivity}>{props.caption}</span>}
      </figcaption>
    </figure>
  );
}
