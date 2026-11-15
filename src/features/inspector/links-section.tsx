/**
 * "Links" in the panel (step 8.4m, M3; Study and Studio, the pane and the phone sheet): what a family turns into and what it is made
 * from, one row per neighbour family with its number of reactions ("Carboxylic acids · 4"). A row opens that pair's reactions (the
 * arrow view), exactly as a click on the map's line does. Draws what `linksOf` answers; nothing is computed here.
 */
import { ListRow, ListRows } from '@/ui/primitives';
import { useInspectorEnv } from './env';
import type { LinkRow, StudyLinks } from './model/study-links';
import styles from './study-inspector.module.css';

const reactions = (n: number): string => `${n} ${n === 1 ? 'reaction' : 'reactions'}`;

function Group(props: { readonly heading: string; readonly rows: readonly LinkRow[]; readonly onOpen: (row: LinkRow) => void }) {
  if (props.rows.length === 0) return null;
  return (
    <>
      <h5 className={styles.groupHeading}>{props.heading}</h5>
      <ListRows label={props.heading}>
        {props.rows.map((row) => (
          <ListRow key={row.id} label={`${row.name} · ${row.reactions}`} ariaLabel={`${row.name}, ${reactions(row.reactions)}`} dataAttr={{ 'data-link-to': row.id }} onOpen={() => props.onOpen(row)} />
        ))}
      </ListRows>
    </>
  );
}

export function LinksSection(props: { readonly familyId: string; readonly links: StudyLinks | undefined }) {
  const { ports } = useInspectorEnv();
  const { links, familyId } = props;
  if (links === undefined) return null;
  const arrow = (from: string, to: string): void => ports.ui.inspector.getState().select({ kind: 'arrow', from, to });
  return (
    <section aria-label="Links" className={styles.group} data-group="links" data-sheet-full="">
      <h4 className={styles.groupHeading}>Links</h4>
      <Group heading="Turns into" rows={links.turnsInto} onOpen={(row) => arrow(familyId, row.id)} />
      <Group heading="Made from" rows={links.madeFrom} onOpen={(row) => arrow(row.id, familyId)} />
    </section>
  );
}
