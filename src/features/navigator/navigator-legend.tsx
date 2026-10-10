/**
 * The legend (step 5.5c, extended in 5.5d): a row under the toolbar listing each family group once with its swatch and its name, then
 * what the arrows' marks mean, in words next to small samples (a count chip, a loop, the Unclassified box). The swatch is the tone's
 * tint, border and ink from the tokens; the name is always written (colour is never the only carrier). A sample is decoration
 * (aria-hidden): the words carry the meaning.
 */
import type { LegendItem, LegendKey } from './legend';
import styles from './navigator.module.css';

const NO_KEY: LegendKey = { chip: false, loop: false, unclassified: false };

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

function LoopSample() {
  return (
    <svg className={styles.sample} width="28" height="24" viewBox="0 0 28 24" aria-hidden="true" data-sample="loop">
      <rect x="0.5" y="12.5" width="16" height="11" rx="2" className={styles.sampleBox} />
      <path d="M5 12.5 C5 -3 27 2 16.5 15" className={styles.sampleLine} fill="none" />
      <path d="M19 14.5 L12.5 12.5 L17.5 18.5 Z" className={styles.sampleHead} transform="rotate(-18 16.5 15)" />
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

export function NavigatorLegend(props: { readonly items: readonly LegendItem[]; readonly keys?: LegendKey }) {
  const keys = props.keys ?? NO_KEY;
  const explained = keys.chip || keys.loop || keys.unclassified;
  if (props.items.length === 0 && !explained) return null;
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
          {!keys.chip ? null : (
            <li className={styles.legendItem} data-key="chip">
              <ChipSample />
              number of reactions on this arrow
            </li>
          )}
          {!keys.loop ? null : (
            <li className={styles.legendItem} data-key="loop">
              <LoopSample />
              reactions within the same family
            </li>
          )}
          {!keys.unclassified ? null : (
            <li className={styles.legendItem} data-key="unclassified">
              <UnclassifiedSample />
              Unclassified: compounds not in any family yet
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
