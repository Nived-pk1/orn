/**
 * The legend (step 5.5c, extended in 5.5d): a row under the toolbar listing each family group once with its swatch and its name, then
 * what the arrows' marks mean, in words next to small samples (a count chip, a loop, the Unclassified box). The swatch is the tone's
 * tint, border and ink from the tokens; the name is always written (colour is never the only carrier). A sample is decoration
 * (aria-hidden): the words carry the meaning.
 */
import { NO_KEY, type LegendItem, type LegendKey } from './legend';
import styles from './navigator.module.css';

function ChipSample() {
  return (
    <svg className={styles.sample} width="28" height="20" viewBox="0 0 28 20" aria-hidden="true" data-sample="chip">
      <rect x="0.5" y="0.5" width="27" height="19" rx="9.5" className={styles.sampleChip} />
      <text x="14" y="14.2" textAnchor="middle" className={styles.sampleText}>
        3
      </text>
    </svg>
  );
}

function LineSample(props: { readonly dashed: boolean; readonly both?: boolean }) {
  return (
    <svg className={styles.sample} width="36" height="16" viewBox="0 0 36 16" aria-hidden="true" data-sample={props.dashed ? 'madeFrom' : props.both === true ? 'pair' : 'makes'}>
      <line x1={props.both === true ? 7 : 2} y1="8" x2="29" y2="8" className={props.dashed ? styles.sampleLine : styles.sampleMakes} {...(props.dashed ? { strokeDasharray: '6 4' } : {})} />
      <path d="M34 8 L27 4.5 L27 11.5 Z" className={styles.sampleHead} />
      {props.both === true ? <path d="M2 8 L9 4.5 L9 11.5 Z" className={styles.sampleHead} /> : null}
    </svg>
  );
}

function WithinSample() {
  return (
    <svg className={styles.sample} width="28" height="24" viewBox="0 0 28 24" aria-hidden="true" data-sample="within">
      <rect x="0.5" y="2.5" width="27" height="13" rx="2" className={styles.sampleBox} />
      <text x="14" y="22" textAnchor="middle" className={styles.sampleCaption}>
        n
      </text>
    </svg>
  );
}

function UnclassifiedSample() {
  return (
    <svg className={styles.sample} width="28" height="20" viewBox="0 0 28 20" aria-hidden="true" data-sample="unclassified">
      <rect x="0.5" y="2.5" width="27" height="15" rx="3" className={styles.sampleBox} strokeDasharray="2 3" />
    </svg>
  );
}

function OutsideSample() {
  return (
    <svg className={styles.sample} width="28" height="20" viewBox="0 0 28 20" aria-hidden="true" data-sample="outside">
      <rect x="0.5" y="2.5" width="27" height="15" rx="3" className={styles.sampleBox} opacity="0.5" />
      <text x="14" y="14" textAnchor="middle" className={styles.sampleText}>
        –
      </text>
    </svg>
  );
}

/**
 * The rows about arrows (step 8.2b, B3). On a wide screen they sit in the map's line row (which keeps its height), NOT in the legend: a legend that
 * grew when a family was focused would move the map under the pointer and a double click's second press would miss the family.
 */
export function ArrowKey(props: { readonly keys: LegendKey }) {
  const { keys } = props;
  if (!keys.lines && !keys.chip && !keys.pair) return null;
  return (
    <ul className={styles.arrowKey} aria-label="What the arrows mean">
      {!keys.lines ? null : (
        <>
          <li className={styles.legendItem} data-key="makes">
            <LineSample dashed={false} />
            solid line in the family's colour: what the family makes
          </li>
          <li className={styles.legendItem} data-key="madeFrom">
            <LineSample dashed />
            dashed dark line: what the family is made from
          </li>
        </>
      )}
      {!keys.chip ? null : (
        <li className={styles.legendItem} data-key="chip">
          <ChipSample />
          number of reactions on this arrow
        </li>
      )}
      {!keys.pair ? null : (
        <li className={styles.legendItem} data-key="pair">
          <LineSample dashed={false} both />
          one line with a head at each end: reactions both ways, a number near each head
        </li>
      )}
    </ul>
  );
}

export function NavigatorLegend(props: {
  readonly items: readonly LegendItem[];
  readonly keys?: LegendKey;
  readonly outsideNote?: string;
  /** Show or hide the Unclassified box (saved). */
  readonly onToggleUnclassified?: () => void;
  /** Studio only: open the list of compounds that are in no family (step 8.2a, D5). */
  readonly onSeeCompounds?: () => void;
}) {
  const keys = props.keys ?? NO_KEY;
  const explained = keys.lines || keys.chip || keys.pair || keys.within || keys.unclassified !== undefined || props.outsideNote !== undefined;
  if (props.items.length === 0 && !explained) return null;
  const unclassified = keys.unclassified;
  return (
    <div className={styles.legend}>
      {props.items.length === 0 ? null : (
        <ul className={styles.legendList} aria-label="Family groups">
          {props.items.map((item) => (
            <li key={item.group} className={styles.legendItem} data-group={item.group}>
              <span className={styles.swatch} data-tone={item.tone} aria-hidden="true" />
              {item.group}
            </li>
          ))}
        </ul>
      )}
      {!explained ? null : (
        <ul className={styles.legendList} aria-label="What the marks mean">
          {!keys.lines ? null : (
            <>
              <li className={styles.legendItem} data-key="makes">
                <LineSample dashed={false} />
                solid line in the family's colour: what the family makes
              </li>
              <li className={styles.legendItem} data-key="madeFrom">
                <LineSample dashed />
                dashed dark line: what the family is made from
              </li>
            </>
          )}
          {!keys.chip ? null : (
            <li className={styles.legendItem} data-key="chip">
              <ChipSample />
              number of reactions on this arrow
            </li>
          )}
          {!keys.pair ? null : (
            <li className={styles.legendItem} data-key="pair">
              <LineSample dashed={false} both />
              one line with a head at each end: reactions both ways, a number near each head
            </li>
          )}
          {!keys.within ? null : (
            <li className={styles.legendItem} data-key="within">
              <WithinSample />
              n within the family: reactions that start and end in the same family (no loop is drawn)
            </li>
          )}
          {props.outsideNote === undefined ? null : (
            <li className={styles.legendItem} data-key="outside">
              <OutsideSample />
              {props.outsideNote}: faded and marked in words, every reaction of the family is outside the chosen exam scope (nothing is hidden)
            </li>
          )}
          {unclassified === undefined ? null : (
            <li className={styles.legendItem} data-key="unclassified">
              <UnclassifiedSample />
              {unclassified.shown
                ? 'Unclassified: compounds not in any family yet'
                : `${unclassified.reactions} ${unclassified.reactions === 1 ? 'reaction leads' : 'reactions lead'} to compounds that are in no family yet`}
              {props.onToggleUnclassified === undefined ? null : (
                <button type="button" className={styles.legendButton} onClick={props.onToggleUnclassified}>
                  {unclassified.shown ? 'Hide' : 'Show'}
                </button>
              )}
              {props.onSeeCompounds === undefined ? null : (
                <button type="button" className={styles.legendButton} onClick={props.onSeeCompounds}>
                  See those compounds
                </button>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
