/**
 * The live preview of the reaction editor (step 6.3b decision D2): the reaction AS ITS CARD WILL SHOW IT, built from the DRAFT by the core
 * (`previewOfDraft`: the card's own builders) and drawn with the card's own equation component (`render/equation`): the reactants, the arrow
 * with the draft's reagents and conditions, and the products of each group of outcomes. It follows the draft 400 ms after the last edit
 * (injected timers); a draft the core cannot read yet is answered in words, never drawn; a reaction with no outcome shows its reactants,
 * the arrow and "No products yet". Text only; the core decides what is shown.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { EquationScheme } from '@/render/equation';
import type { PreviewPort } from './preview-contracts';
import styles from './preview.module.css';

export const PREVIEW_DEBOUNCE_MS = 400;

/** The draft as it was 400 ms after its last change (the first one at once, so a reaction opened unchanged shows at once). */
function useSettled<T>(value: T, timers: PreviewPort['timers']): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => timers.after(PREVIEW_DEBOUNCE_MS, () => setSettled(value)), [value, timers]);
  return settled;
}

const participantCount = (draft: unknown): number => {
  const list = (draft as { participants?: unknown } | null)?.participants;
  return Array.isArray(list) ? list.length : 0;
};

export function ReactionPreview(props: { readonly draft: unknown; readonly port: PreviewPort; readonly phone: boolean }) {
  const { port, phone } = props;
  const draft = useSettled(props.draft, port.timers);
  const names = useSyncExternalStore(port.names.subscribe, port.names.get, port.names.get);
  const built = useMemo(() => (participantCount(draft) === 0 ? undefined : port.build(draft)), [draft, port]);
  return (
    <div className={styles.preview} data-preview="">
      {built === undefined ? (
        <p className={styles.hint}>Add a participant to see the reaction here.</p>
      ) : !built.ok ? (
        <div role="status">
          <p className={styles.hint}>The preview cannot be drawn yet:</p>
          <ul className={styles.missing}>
            {built.missing.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className={styles.schemes} aria-label="Reaction preview">
          {built.equations.map((group, index) => (
            <li key={index}>
              <EquationScheme
                equation={group.equation}
                binding={port.binding}
                timers={port.timers}
                facts={port.facts}
                names={names}
                layout={phone ? 'stacked' : 'row'}
                {...(index === 0 ? { onNamesChange: port.names.set } : {})}
                {...(group.label === undefined ? {} : { label: group.label })}
                {...(built.hasOutcomes ? {} : { noProducts: 'No products yet (outcomes arrive in step 6.4)' })}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Where the editor puts the preview: a reaction's editor only, and only when the app gave a port. Desktop: a panel (the host puts it
 * under the findings in the sticky column). Phone: a collapsible "Preview" section at the top, CLOSED by default, drawn only when open.
 */
export function PreviewPanel(props: { readonly kind: string; readonly draft: unknown; readonly port: PreviewPort | undefined; readonly phone: boolean; readonly where: 'top' | 'aside' }) {
  const [open, setOpen] = useState(false);
  const { port } = props;
  if (props.kind !== 'reaction' || port === undefined || props.phone !== (props.where === 'top')) return null;
  if (props.phone) {
    return (
      <details className={styles.phoneSection} data-preview-section="" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>Preview</summary>
        {open ? <ReactionPreview draft={props.draft} port={port} phone /> : null}
      </details>
    );
  }
  return (
    <section className={styles.panel} aria-label="Preview">
      <h3>Preview</h3>
      <ReactionPreview draft={props.draft} port={port} phone={false} />
    </section>
  );
}
