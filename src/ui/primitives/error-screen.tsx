/** The full error screen (step 8.4g, G7), a lazy chunk the boundary shows once it has loaded: the EmptyState look, "Reload", "Back up now" (Studio) and the detail folded under "Details". */
import { Button } from './button';
import { EmptyState } from './empty-state';
import styles from './error-boundary.module.css';

export function ErrorScreen(props: { readonly label: string; readonly failure: string; readonly onReload: () => void; readonly backUp?: (() => void) | undefined }) {
  return (
    <section role="alert" aria-label={props.label} className={styles.screen}>
      <EmptyState action={{ label: 'Reload', onClick: props.onReload }}>Something went wrong on this screen. Your saved data is safe.</EmptyState>
      {props.backUp === undefined ? null : (
        <Button variant="quiet" onClick={props.backUp}>
          Back up now
        </Button>
      )}
      <details className={styles.details}>
        <summary>Details</summary>
        <p>
          {props.label}: {props.failure}
        </p>
      </details>
    </section>
  );
}
