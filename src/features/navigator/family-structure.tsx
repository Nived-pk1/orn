/**
 * One substance of a card, drawn as in a textbook (step 5.5b): its structure at a FIXED size (an `<img>` with the object URL the depiction
 * manager made; never inlined markup), the name under it. A class, a reagent or a species without a structure shows its formula in the
 * same box and its name under it; so does a structure that is not available (the title says so). The box has the same size in every state, so
 * a card does not change height when a structure arrives.
 */
import type { RecordRef } from '@/core/schema';
import { STRUCTURE_AREA } from '@/render/scene';
import { drawingFailed, useRetryingDepiction } from '@/render/svg';
import { useFamilyEnv } from './family-env';
import { FormulaText } from './family-text';
import scheme from './family-scheme.module.css';

/** `writtenAs`: the text the reaction writes for a class (7.3b A5); the box shows it as a formula and no drawing is asked for. */
export function Structure(props: { readonly substance: RecordRef; readonly caption?: string; readonly writtenAs?: string }) {
  const env = useFamilyEnv();
  const described = env.describe(props.substance);
  const name = described?.name ?? props.substance.id;
  const key = props.writtenAs === undefined ? env.keyOf(props.substance) : undefined;
  const status = useRetryingDepiction(env.manager, key, env.timers);
  // a phone sizes the box in CSS (a share of the width, the same aspect); the desktop keeps its fixed pixels
  const boxStyle = env.layout === 'phone' ? undefined : { width: STRUCTURE_AREA.width, height: STRUCTURE_AREA.height };
  const url = key !== undefined && status.state === 'ready' ? status.url : undefined;
  // a structure that failed only because the engine was not ready yet still reads "Drawing the structure…" (it is asked again when ready)
  const unavailable = key !== undefined && drawingFailed(status);
  return (
    <figure className={scheme.substance} data-substance-id={props.substance.id}>
      <div className={scheme.structure} {...(boxStyle === undefined ? {} : { style: boxStyle })}>
        {url !== undefined ? (
          <img src={url} alt={`Structure of ${name}`} width={STRUCTURE_AREA.width} height={STRUCTURE_AREA.height} />
        ) : (
          <span className={scheme.structureName} {...(unavailable ? { title: 'The structure could not be drawn' } : {})}>
            {key !== undefined && !unavailable ? <span className={scheme.loadingMark}>Drawing the structure…</span> : null}
            {props.writtenAs !== undefined ? (
              <span className={scheme.formula} data-written-as="">
                <FormulaText formula={props.writtenAs} />
              </span>
            ) : described?.formula === undefined ? (
              <span className={scheme.noStructure}>{key === undefined ? 'No structure' : unavailable ? 'Structure not available' : ''}</span>
            ) : (
              <span className={scheme.formula}>
                <FormulaText formula={described.formula} />
              </span>
            )}
          </span>
        )}
      </div>
      <figcaption className={scheme.caption}>
        <span>{name}</span>
        {props.caption === undefined ? null : <span className={scheme.selectivity}>{props.caption}</span>}
      </figcaption>
    </figure>
  );
}
