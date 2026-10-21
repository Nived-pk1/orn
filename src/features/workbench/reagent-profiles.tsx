/**
 * The reagent editor's Profiles section (step 6.2b decision D3): named usage conditions with their OWN aliases (for KMnO4 the profile
 * "Cold, dilute, alkaline" has the alias "Baeyer's reagent"). Add, remove, reorder, and edit the label and the aliases. A profile's
 * conditions (the SAME form as a stage's, step 6.6a decision C5) and its behaviour (rich text, no default) are edited here. A new profile's ID comes from the editor port (an ID inside a pure recipe has to be given).
 */
import { useState } from 'react';
import { Button } from '@/ui/primitives';
import { ConditionFields } from './condition-fields';
import conditionStyles from './condition.module.css';
import { parametersOf, profileLoc, summaryOf } from './condition-model';
import { RichTextField } from './rich-text-field';
import { addProfile, addProfileAlias, moveProfile, reagentViewOf, removeProfile, removeProfileAlias, setProfileAlias, setProfileBehaviour, setProfileLabel } from './reagent-model';
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
  const [openProfile, setOpenProfile] = useState<string | null>(null);
  const off = (action: () => void, reason?: string) => (locked !== undefined ? { unavailable: locked } : reason !== undefined ? { unavailable: reason } : { onClick: action });
  return (
    <div>
      {view.profiles.length === 0 ? <p className={styles.hint}>None. A profile names one way of using the reagent, for example "cold, dilute, alkaline".</p> : null}
      <ul className={styles.sections} aria-label="Profiles" data-field-path="profiles">
        {view.profiles.map((profile, index) => {
          const n = index + 1;
          const base = `profiles[${index}]`;
          const key = profile.id || String(index);
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
              <div className={styles.row}>
                <span className={conditionStyles.summary} data-testid="profile-conditions">
                  Conditions: {summaryOf(parametersOf(props.draft, profileLoc(index)))}
                </span>
                <Button aria-label={`${openProfile === key ? 'Close' : 'Edit'} conditions of profile ${n}`} aria-expanded={openProfile === key} data-field-path={`${base}.parameters`} onClick={() => setOpenProfile(openProfile === key ? null : key)}>
                  {openProfile === key ? 'Close' : 'Edit conditions'}
                </Button>
              </div>
              {openProfile === key ? <ConditionFields draft={props.draft} onEdit={onEdit} loc={profileLoc(index)} who={`profile ${n}`} {...(props.invalid === undefined ? {} : { invalid: props.invalid })} {...(locked === undefined ? {} : { unavailable: locked })} {...(props.phone === undefined ? {} : { phone: props.phone })} /> : null}
              <RichTextField id={`profile-behaviour-${index}`} label={`Behaviour of profile ${n}`} path={`${base}.behaviour`} value={profile.behaviour} invalid={props.invalid?.has(`${base}.behaviour`) === true} unavailable={locked} phone={props.phone} rows={2} onChange={(value) => onEdit(setProfileBehaviour(index, value), `${base}.behaviour`)} />
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
