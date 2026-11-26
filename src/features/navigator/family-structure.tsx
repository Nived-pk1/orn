/**
 * One substance of a card, drawn as in a textbook (step 5.5b) at the ONE size rule (step 8.5d): the structure at the family standard bond length
 * (an img with the object URL the depiction manager made; never inlined markup), the box following the drawing (a minimum box for a tiny
 * molecule), shrunk to the floor when its row is too narrow, then a box that scrolls with a fade; never clipped. The name is under it. A class,
 * a reagent or a species without a structure shows its formula in the same box and its name under it; so does a structure that is not available.
 */
import type { KeyboardEvent } from 'react';
import type { RecordRef } from '@/core/schema';
import { CROWDED_WORDS, NameText, SIZE_RULES, sizeDrawing, useMeasuredWidth } from '@/render/equation';
import { DepictionSurface, drawingFailed, useRetryingDepiction } from '@/render/svg';
import { useFamilyEnv } from './family-env';
import { BoxFormula, FormulaText } from './family-text';
import scheme from './family-scheme.module.css';

/** `writtenAs`: the text the reaction writes for a class (7.3b A5); the box shows it as a formula and no drawing is asked for. */
export function Structure(props: { readonly substance: RecordRef; readonly caption?: string; readonly writtenAs?: string }) {
  const env = useFamilyEnv();
  const described = env.describe(props.substance);
  const name = described?.name ?? props.substance.id;
  const key = props.writtenAs === undefined ? env.keyOf(props.substance, SIZE_RULES.family.standard) : undefined;
  const status = useRetryingDepiction(env.manager, key, env.timers);
  const [measure, available] = useMeasuredWidth('scheme');
  const url = key !== undefined && status.state === 'ready' ? status.url : undefined;
  // a structure that failed only because the engine was not ready yet still reads "Drawing the structure…" (it is asked again when ready)
  const unavailable = key !== undefined && drawingFailed(status);
  // the drawing's size at the fixed scale is the size RDKit gave it; the rule decides its scale and its box
  const fit = url === undefined || status.state !== 'ready' || status.width === undefined || status.height === undefined ? undefined : sizeDrawing({ width: status.width, height: status.height }, 'family', { available: available ?? Number.POSITIVE_INFINITY, allAtoms: status.allAtoms });
  const crowded = url !== undefined && status.state === 'ready' && status.allAtoms === false;
  const rule = SIZE_RULES.family;
  // a box that scrolls sideways shows only part of the structure: a click or a tap (Enter or Space) opens it full size in the inspector (step 8.5e, E2 b)
  const open = fit?.mode === 'scroll' ? env.openStructure : undefined;
  const opening =
    open === undefined
      ? {}
      : {
          role: 'button',
          'aria-label': `Open the structure of ${name} full size in the inspector`,
          onClick: () => open(props.substance),
          onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            open(props.substance);
          },
        };
  const boxStyle = fit === undefined ? { minWidth: rule.minWidth, minHeight: rule.minHeight } : { width: fit.boxWidth, minHeight: fit.boxHeight };
  const box = (
    <div className={scheme.structure} style={boxStyle} {...(fit?.mode === 'scroll' ? { 'data-scrolls': '', tabIndex: 0 } : {})} {...opening}>
      {url !== undefined ? (
        <img src={url} alt={crowded ? `Structure of ${name}. ${CROWDED_WORDS}` : `Structure of ${name}`} {...(fit === undefined ? {} : { width: fit.width, height: fit.height, 'data-bond-px': fit.bondPx })} />
      ) : (
        <span className={scheme.structureName} {...(unavailable ? { title: 'The structure could not be drawn' } : {})}>
          {key !== undefined && !unavailable ? <span className={scheme.loadingMark}>Drawing the structure…</span> : null}
          {props.writtenAs !== undefined ? (
            <span className={scheme.formula} data-written-as="">
              <BoxFormula formula={props.writtenAs} />
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
  );
  return (
    <figure ref={measure} className={scheme.substance} data-substance-id={props.substance.id} {...(props.writtenAs === undefined ? {} : { 'data-text-box': '' })}>
      {/* a drawing sits on the one paper wrapper (8.5f); outside the box, so a scrolling box fades into the paper. A text box does not. */}
      {url === undefined ? box : <DepictionSurface>{box}</DepictionSurface>}
      {crowded ? <span className={scheme.crowded}>{CROWDED_WORDS}</span> : null}
      <figcaption className={scheme.caption}>
        <span>
          <NameText name={name} />
        </span>
        {props.caption === undefined ? null : <span className={scheme.selectivity}>{props.caption}</span>}
      </figcaption>
    </figure>
  );
}
