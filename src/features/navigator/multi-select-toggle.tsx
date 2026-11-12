/** The phone's Select toggle (step 6.8b, R2; Studio only; step 8.4f, M1: an icon button in the stack card): while it is on, a tap toggles the item under it. */
import { Icon } from "@/ui/primitives";
import styles from "./phone-home.module.css";

export function SelectToggle(props: { readonly on: boolean; readonly set: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className={`${styles.round} ${props.on ? styles.on : ""}`}
      aria-label="Select"
      title="Select"
      aria-pressed={props.on}
      onClick={() => props.set(!props.on)}
    >
      <Icon name="list-checks" size={20} />
    </button>
  );
}
