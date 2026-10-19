/**
 * The reagent editor's Profiles section (step 6.2b decision D3): named usage conditions with their OWN aliases (for KMnO4 the profile
 * "Cold, dilute, alkaline" has the alias "Baeyer's reagent"). Add, remove, reorder, and edit the label and the aliases. A profile's
 * conditions (temperature, medium and the rest) and its behaviour note are not edited here: shown read-only with "Editing arrives in step
 * 6.6" and kept unchanged. A new profile's ID comes from the editor port (an ID inside a pure recipe has to be given).
 */
import { Button } from '@/ui/primitives';
import { addProfile, addProfileAlias, moveProfile, reagentViewOf, removeProfile, removeProfileAlias, setProfileAlias, setProfileLabel } from './reagent-model';
import type { SectionProps } from './section-props';
import styles from './editor.module.css';

export interface ProfilesSectionProps extends SectionProps {
  /** A fresh profile ID ('rpf_...'). */
  readonly newId: (prefix: string) => string;
}

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

export function ProfilesSection(props: ProfilesSectionProps) {
  const view = reagentViewOf(props.draft);
  const { onEdit } = props;
  const locked = props.unavailable;
  const off = (action: () => void, reason?: string) => (locked !== undefined ? { unavailable: locked } : reason !== undefined ? { unavailable: reason } : { onClick: action });
  return (
    <div>
      {view.profiles.length === 0 ? <p className={styles.hint}>None. A profile names one way of using the reagent, for example "cold, dilute, alkaline".</p> : null}
      <ul className={styles.sections} aria-label="Profiles" data-field-path="profiles">
        {view.profiles.map((profile, index) => {
          const n = index + 1;
          const base = `profiles[${index}]`;
          return (
            <li key={profile.id || index} className={styles.panel}>
              <div className={styles.field}>
                <label htmlFor={`profile-label-${index}`}>Profile {n} label</label>
                <input id={`profile-label-${index}`} type="text" value={profile.label} readOnly={locked !== undefined} aria-invalid={bad(props, `${base}.label`)} data-field-path={`${base}.label`} autoComplete="off" onChange={(event) => onEdit(setProfileLabel(index, event.target.value), `${base}.label`)} />
              </div>
              <div className={styles.list} role="group" aria-label={`Aliases of profile ${n}`}>
                <h4>Aliases of this profile</h4>
                {profile.aliases.length === 0 ? <p className={styles.hint}>None.</p> : null}
                <ul>
                  {profile.aliases.map((alias, at) => (
                    <li key={at} className={styles.row}>
                      <input type="text" value={alias} readOnly={locked !== undefined} aria-label={`Profile ${n} alias ${at + 1}`} aria-invalid={bad(props, `${base}.aliases[${at}]`)} data-field-path={`${base}.aliases[${at}]`} autoComplete="off" onChange={(event) => onEdit(setProfileAlias(index, at, event.target.value), `${base}.aliases[${at}]`)} />
                      <Button aria-label={`Remove profile ${n} alias ${at + 1}`} {...off(() => onEdit(removeProfileAlias(index, at)))}>
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button aria-label={`Add alias to profile ${n}`} {...off(() => onEdit(addProfileAlias(index)))}>
                  Add alias
                </Button>
              </div>
              <p className={styles.hint}>
                Conditions: {profile.conditionsText === '' ? 'not described in words' : profile.conditionsText}. Conditions and behaviour: editing arrives in step 6.6; they are kept unchanged.
              </p>
              <div className={styles.row}>
                <Button aria-label={`Move profile ${n} up`} {...off(() => onEdit(moveProfile(index, -1)), index === 0 ? 'it is first' : undefined)}>
                  Up
                </Button>
                <Button aria-label={`Move profile ${n} down`} {...off(() => onEdit(moveProfile(index, 1)), index === view.profiles.length - 1 ? 'it is last' : undefined)}>
                  Down
                </Button>
                <Button aria-label={`Remove profile ${n}`} {...off(() => onEdit(removeProfile(index)))}>
                  Remove profile
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Button {...off(() => onEdit(addProfile(props.newId('rpf'))))}>Add profile</Button>
    </div>
  );
}
