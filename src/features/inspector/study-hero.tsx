/**
 * The hero of the Study inspector (step 8.1 Part C, item 2): the picture or formula a student sees first. The model says which
 * (`Hero`); this draws it with the parts the inspector already has. No hero: nothing is drawn (no empty box).
 */
import { lazy, Suspense } from 'react';
import { Runs } from '@/render/equation';
import { formulaRuns } from '@/render/scene';
import type { Mechanism, Reaction, Species, ChemicalClass } from '@/core/schema';
import { Depiction } from './depiction';
import { useInspectorEnv } from './env';
import { HeroEquation } from './equation';
import { nameOf, recordOf } from './model/describe';
import type { Hero } from './model/study-model';
import styles from './study-inspector.module.css';

const HeroPicture = lazy(() => import('./view-pictures').then((module) => ({ default: module.HeroPicture })));

export function StudyHero(props: { readonly hero: Hero | undefined }) {
  const { state } = useInspectorEnv();
  const hero = props.hero;
  if (hero === undefined) return null;
  switch (hero.type) {
    case 'reaction': {
      const record = recordOf(state, { kind: 'reaction', id: hero.reactionId });
      return record === undefined ? null : (
        <div className={styles.hero} data-hero="reaction">
          <HeroEquation record={record as Reaction} />
        </div>
      );
    }
    case 'species': {
      const record = recordOf(state, hero.ref) as Species | undefined;
      if (record === undefined) return null;
      return (
        <div className={styles.hero} data-hero="species">
          <Depiction structure={record.structure} name={nameOf(state, hero.ref)} {...(record.formula === undefined ? {} : { fallback: record.formula })} />
          {hero.formula === undefined ? null : <p className={styles.formula}><Runs runs={formulaRuns(hero.formula, hero.charge)} /></p>}
        </div>
      );
    }
    case 'class': {
      const record = recordOf(state, hero.ref) as ChemicalClass | undefined;
      return (
        <div className={styles.hero} data-hero="class">
          {hero.formula === undefined ? null : <p className={styles.formula}><Runs runs={formulaRuns(hero.formula)} /></p>}
          <Depiction structure={record?.generic?.structure} name={nameOf(state, hero.ref)} />
        </div>
      );
    }
    case 'formula':
      return (
        <div className={styles.hero} data-hero="formula">
          <p className={styles.formula}><Runs runs={formulaRuns(hero.text)} /></p>
        </div>
      );
    case 'picture':
      return (
        <div className={styles.hero} data-hero="picture">
          <Suspense fallback={null}>
            <HeroPicture target={hero.ref} />
          </Suspense>
        </div>
      );
    case 'step-species': {
      const step = (recordOf(state, { kind: 'mechanism', id: hero.mechanismId }) as Mechanism | undefined)?.variants[0]?.steps[0];
      if (step === undefined) return null;
      return (
        <ul className={`${styles.hero} ${styles.stepRow}`} data-hero="step" aria-label="Species of the first step">
          {step.species.map((species, index) => (
            <li key={index}>
              {species.structure === undefined ? null : <Depiction compact structure={species.structure} name={species.label ?? 'species'} fallback={species.structure.value} />}
              {species.label === undefined ? null : <span className={styles.stepLabel}>{species.label}</span>}
            </li>
          ))}
        </ul>
      );
    }
    default:
      return null;
  }
}
