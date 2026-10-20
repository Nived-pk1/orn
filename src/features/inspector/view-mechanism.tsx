/**
 * A mechanism in the inspector (step 5.6b, item d). L2: summary and its variants (how many steps, when each applies); L3: each variant
 * with its steps as ordered rows (step kinds, species, bonds formed and broken as atom-map pairs, electron movements, rate-determining,
 * reversible, stereochemical event, description) and the outcomes and reactions that use that variant. Arrow-pushing drawings arrive in Phase 8 (ADR-038); these are rows only. A link from an outcome opens the mechanism AT its variant: that variant is open and brought into view.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { Mechanism, Reaction } from '@/core/schema';
import { currentOf } from '@/ui/state';
import { Connections } from './connections';
import { Depiction } from './depiction';
import { useInspectorEnv } from './env';
import { FactList, Facts, LevelSection } from './levels';
import { RecordList } from './record-list';
import { RecordLink, RichText } from './rich-text';
import { MechanismPictures } from './view-pictures';
import { CitationsAndTags, LinkFact, NoteFact, TextFact, words } from './view-parts';
import styles from './inspector.module.css';

type Variant = Mechanism['variants'][number];
type Step = Variant['steps'][number];
type Site = Step['electronMovements'][number]['from'];

export const siteWords = (site: Site): string =>
  site.kind === 'atom'
    ? `atom ${site.atom}`
    : site.kind === 'lone_pair'
      ? `lone pair on atom ${site.atom}`
      : site.kind === 'radical'
        ? `radical on atom ${site.atom}`
        : `the bond between atoms ${site.atoms[0]} and ${site.atoms[1]}`;

const bondWords = (bond: Step['bondsFormed'][number]): string =>
  [`atoms ${bond.atoms[0]} and ${bond.atoms[1]}`, bond.order === undefined ? undefined : `order ${bond.order}`, bond.aromatic === true ? 'aromatic' : undefined, bond.note].filter((x) => x !== undefined).join(', ');

function StepSpecies(props: { readonly species: Step['species'][number] }) {
  const { species } = props;
  const label = species.label ?? (species.ref === undefined ? words(species.role) : '');
  return (
    <li>
      {words(species.role)}:{' '}
      {species.ref === undefined ? null : <RecordLink kind={species.ref.kind} id={species.ref.id} />}
      {species.ref !== undefined && label !== '' ? ', ' : ''}
      {label === '' ? null : label}
      {species.structure === undefined ? null : <Depiction compact structure={species.structure} name={species.label ?? words(species.role)} fallback={species.structure.value} />}
    </li>
  );
}

function StepRow(props: { readonly step: Step; readonly number: number }) {
  const { step, number } = props;
  return (
    <li data-step-id={step.id}>
      <strong>
        Step {number}
        {step.title === undefined ? '' : `: ${step.title}`}
      </strong>
      <FactList label={`Step ${number}`}>
        <TextFact label="Kinds" value={step.stepKinds.map(words).join(', ')} />
        <NoteFact label="Description" source={step.description} />
        {step.species.length === 0 ? null : (
          <Facts label="Species">
            <ul aria-label={`Species of step ${number}`}>
              {step.species.map((species, index) => (
                <StepSpecies key={index} species={species} />
              ))}
            </ul>
          </Facts>
        )}
        {step.bondsFormed.length === 0 ? null : <Facts label="Bonds formed">{step.bondsFormed.map(bondWords).join('; ')}</Facts>}
        {step.bondsBroken.length === 0 ? null : <Facts label="Bonds broken">{step.bondsBroken.map(bondWords).join('; ')}</Facts>}
        {step.electronMovements.length === 0 ? null : (
          <Facts label="Electron movements">
            <ul aria-label={`Electron movements of step ${number}`}>
              {step.electronMovements.map((movement, index) => (
                <li key={index}>
                  {siteWords(movement.from)} to {siteWords(movement.to)}, {movement.electrons} {movement.electrons === 1 ? 'electron' : 'electrons'}
                </li>
              ))}
            </ul>
          </Facts>
        )}
        {step.isRateDetermining === undefined ? null : <Facts label="Rate-determining">{step.isRateDetermining ? 'yes' : 'no'}</Facts>}
        {step.reversible === undefined ? null : <Facts label="Reversible">{step.reversible ? 'yes' : 'no'}</Facts>}
        <TextFact label="Stereochemical event" value={step.stereochemicalEvent} />
        <NoteFact label="Note" source={step.note} />
      </FactList>
    </li>
  );
}

type Use = { readonly kind: 'reaction'; readonly id: string; readonly outcome: string | undefined };

function VariantBlock(props: { readonly variant: Variant; readonly first: boolean; readonly focused: boolean; readonly uses: readonly Use[] }) {
  const { variant, focused, uses } = props;
  const [open, setOpen] = useState(focused || props.first);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) box.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focused]);
  const bodyId = `variant-${variant.id}`;
  return (
    <div ref={box} data-variant-id={variant.id} data-focused={focused ? '' : undefined}>
      <h5 className={styles.subheading}>
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} {variant.label}
          {focused ? ' (opened from a reaction)' : ''}
        </button>
      </h5>
      <div id={bodyId} hidden={!open}>
        {!open ? null : (
          <>
            <FactList label={`Variant ${variant.label}`}>
              <NoteFact label="When it applies" source={variant.applicability} />
              <TextFact label="Rate law" value={variant.rateLaw} />
              <NoteFact label="Note" source={variant.note} />
            </FactList>
            {variant.steps.length === 0 ? <p className={styles.muted}>This variant has no steps written.</p> : null}
            <ol aria-label={`Steps of ${variant.label}`} className={styles.steps}>
              {variant.steps.map((step, index) => (
                <StepRow key={step.id} step={step} number={index + 1} />
              ))}
            </ol>
            <h6 className={styles.subheading}>Used by ({uses.length})</h6>
            {uses.length === 0 ? (
              <p className={styles.muted}>No outcome points at this variant.</p>
            ) : (
              <RecordList label={`Reactions that use ${variant.label}`} items={uses} suffix={(use) => (use.outcome === undefined ? null : <span className={styles.muted}> (outcome {use.outcome})</span>)} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function MechanismLevels(props: { readonly record: Mechanism }) {
  const { record } = props;
  const env = useInspectorEnv();
  const inspector = env.ports.ui.inspector;
  const at = useStore(inspector, (s) => currentOf(s)?.at);
  const used = useMemo(() => {
    const byVariant = new Map<string, Use[]>();
    const unspecified: Use[] = [];
    const reactions = env.state.records.reaction as Readonly<Record<string, Reaction>>;
    for (const id of env.ports.indexes.current().reactionsByMechanism(record.id)) {
      const reaction = reactions[id];
      if (reaction === undefined) continue;
      let any = false;
      for (const outcome of reaction.outcomes) {
        if (outcome.mechanism?.mechanismId !== record.id) continue;
        any = true;
        const key = outcome.mechanism.variantId ?? '';
        byVariant.set(key, [...(byVariant.get(key) ?? []), { kind: 'reaction', id, outcome: outcome.label ?? 'unnamed' }]);
      }
      if (!any) unspecified.push({ kind: 'reaction', id, outcome: undefined });
    }
    return { byVariant, unspecified };
  }, [env, record.id]);
  return (
    <>
      <MechanismPictures mechanismId={record.id} />
      <LevelSection level={2} title="What it is">
        <FactList label="Mechanism">
          <TextFact label="Also called" value={record.aliases.join(', ')} />
          {record.mechanismClasses.length === 0 ? null : (
            <Facts label="Mechanism classes">
              {record.mechanismClasses.map((c, index) => (
                <span key={c.conceptId}>
                  {index > 0 ? ', ' : ''}
                  <RecordLink kind="concept" id={c.conceptId} /> ({c.certainty})
                </span>
              ))}
            </Facts>
          )}
          <NoteFact label="Summary" source={record.summary} />
        </FactList>
        <h4 className={styles.subheading}>Variants ({record.variants.length})</h4>
        {record.variants.length === 0 ? <p className={styles.muted}>No variant is written.</p> : null}
        <ul aria-label="Variants">
          {record.variants.map((variant) => (
            <li key={variant.id}>
              <strong>{variant.label}</strong>, {variant.steps.length} {variant.steps.length === 1 ? 'step' : 'steps'}
              {variant.rateLaw === undefined ? '' : `, rate law ${variant.rateLaw}`}
              <RichText source={variant.applicability} />
            </li>
          ))}
        </ul>
      </LevelSection>
      <LevelSection level={3} title="Variants, steps and who uses them" forceOpen={at !== undefined}>
        {record.variants.map((variant, index) => (
          <VariantBlock key={`${variant.id}:${at === variant.id}`} variant={variant} first={index === 0} focused={at === variant.id} uses={used.byVariant.get(variant.id) ?? []} />
        ))}
        {(used.byVariant.get('') ?? []).length + used.unspecified.length === 0 ? null : (
          <>
            <h5 className={styles.subheading}>Reactions that use it without naming a variant ({(used.byVariant.get('') ?? []).length + used.unspecified.length})</h5>
            <RecordList label="Reactions without a variant" items={[...(used.byVariant.get('') ?? []), ...used.unspecified]} />
          </>
        )}
      </LevelSection>
      <LevelSection level={4} title="Notes, sources and curriculum">
        <FactList label="Mechanism notes">
          <LinkFact label="Concepts" refs={record.conceptIds.map((id) => ({ kind: 'concept', id }))} />
          <NoteFact label="Study notes" source={record.studyNotes} />
          <NoteFact label="Notes" source={record.notes} />
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
        <Connections target={{ kind: 'mechanism', id: record.id }} />
      </LevelSection>
    </>
  );
}
