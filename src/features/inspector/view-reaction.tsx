/**
 * A reaction in the inspector (step 5.6a). L2: what it is, who takes part and what comes out (outcomes with their selectivity word);
 * L3: stages, condition variants and each outcome in full; L4: notes, intermediates, links and sources. Selectivity is shown on the
 * outcome only, as stored. Every field is written as stored; the raw record at L5 carries the rest.
 */
import type { Outcome, Reaction } from '@/core/schema';
import type { Finding } from '@/core/validation';
import { FactList, Facts, LevelSection } from './levels';
import { parameterPhrases } from './model/conditions';
import { RecordLink } from './rich-text';
import { CitationsAndTags, LinkFact, Links, NoteFact, TextFact, words } from './view-parts';

type Participant = Reaction['participants'][number];

const quantityText = (p: Participant): string =>
  [
    p.coefficient === undefined ? undefined : `coefficient ${p.coefficient}`,
    p.quantity?.equivalents === undefined ? undefined : `${p.quantity.equivalents} equiv.`,
    p.quantity?.qualifier,
    p.quantity?.text,
    p.phase,
    p.strength,
    p.dry === true ? 'dry' : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(', ');

function OutcomeSummary(props: { readonly outcome: Outcome }) {
  const { outcome } = props;
  return (
    <li>
      <strong>{outcome.label ?? 'Outcome'}</strong> ({words(outcome.selectivity)}):{' '}
      {outcome.products.length === 0
        ? 'no products listed'
        : outcome.products.map((p, i) => (
            <span key={p.id}>
              {i > 0 ? ', ' : ''}
              <RecordLink kind={p.ref.kind} id={p.ref.id} /> ({words(p.role)})
            </span>
          ))}
    </li>
  );
}

function OutcomeDetail(props: { readonly outcome: Outcome }) {
  const { outcome } = props;
  return (
    <FactList label={`Outcome ${outcome.label ?? outcome.id}`}>
      <Facts label="Selectivity">{words(outcome.selectivity)}</Facts>
      <TextFact label="Isomer group" value={outcome.isomerGroup} />
      <TextFact label="Regiochemistry" value={outcome.regiochemistry} />
      {outcome.stereochemistry === undefined ? null : (
        <Facts label="Stereo outcome">{[words(outcome.stereochemistry.outcome), ...outcome.stereochemistry.descriptors].join(', ')}</Facts>
      )}
      <NoteFact label="Stereochemistry note" source={outcome.stereochemistry?.note} />
      <TextFact label="Yield" value={outcome.yieldText} />
      {outcome.mechanism === undefined ? null : (
        <Facts label="Mechanism">
          <RecordLink kind="mechanism" id={outcome.mechanism.mechanismId} />
          {outcome.mechanism.variantId === undefined ? '' : `, variant ${outcome.mechanism.variantId}`}
        </Facts>
      )}
      <NoteFact label="Why" source={outcome.rationale} />
      <LinkFact label="Concepts" refs={outcome.conceptIds.map((id) => ({ kind: 'concept', id }))} />
      <TextFact label="Condition variants" value={outcome.conditionVariantIds.join(', ')} />
      <NoteFact label="Note" source={outcome.note} />
      {outcome.products.map((product) => (
        <Facts key={product.id} label={`Product (${words(product.role)})`}>
          <RecordLink kind={product.ref.kind} id={product.ref.id} />
          {[product.coefficient === undefined ? undefined : `coefficient ${product.coefficient}`, product.phase, product.originalText]
            .filter((x) => x !== undefined)
            .map((x) => `, ${String(x)}`)
            .join('')}
          <NoteFact label="Note" source={product.note} />
        </Facts>
      ))}
    </FactList>
  );
}

export function ReactionLevels(props: { readonly record: Reaction; readonly findings: readonly Finding[] }) {
  const { record } = props;
  return (
    <>
      <LevelSection level={2} title="What happens">
        <FactList label="Reaction summary">
          <Facts label="Scope">{record.scope}</Facts>
          {record.instanceOfId === undefined ? null : (
            <Facts label="Instance of">
              <RecordLink kind="reaction" id={record.instanceOfId} />
            </Facts>
          )}
          <TextFact label="Also called" value={record.aliases.join(', ')} />
          <TextFact label="Purposes" value={record.purposes.map(words).join(', ')} />
          <TextFact label="Equation" value={record.generalizedEquation} />
          <Facts label="Reversibility">{words(record.reversibility.kind)}</Facts>
          <NoteFact label="Reversibility note" source={record.reversibility.note} />
          <LinkFact label="Named reactions" refs={record.namedReactionIds.map((id) => ({ kind: 'named_reaction', id }))} />
          <LinkFact label="Transformations" refs={record.transformationIds.map((id) => ({ kind: 'transformation', id }))} />
          {record.reactionTypes.length === 0 ? null : (
            <Facts label="Reaction types">
              <Links refs={record.reactionTypes.map((c) => ({ kind: 'concept', id: c.conceptId }))} />
            </Facts>
          )}
        </FactList>
        <h4>Participants</h4>
        <ul aria-label="Participants">
          {record.participants.map((participant) => (
            <li key={participant.id}>
              <RecordLink kind={participant.ref.kind} id={participant.ref.id} /> ({words(participant.role)}
              {participant.isPrimarySubstrate === true ? ', primary substrate' : ''}
              {quantityText(participant) === '' ? '' : `; ${quantityText(participant)}`})
            </li>
          ))}
        </ul>
        <h4>Outcomes</h4>
        <ul aria-label="Outcomes">
          {record.outcomes.map((outcome) => (
            <OutcomeSummary key={outcome.id} outcome={outcome} />
          ))}
        </ul>
      </LevelSection>
      <LevelSection level={3} title="Stages, conditions and outcomes in full">
        <h4>Stages</h4>
        {record.stages.map((stage) => (
          <FactList key={stage.id} label={`Stage ${stage.label ?? stage.id}`}>
            <Facts label={`${stage.label ?? 'Stage'} (${words(stage.kind)})`}>{parameterPhrases(stage.parameters).join('; ') || 'no conditions written'}</Facts>
            <TextFact label="As written" value={stage.originalText} />
            <TextFact label="Participants" value={stage.participantIds.join(', ')} />
          </FactList>
        ))}
        <h4>Condition variants</h4>
        {record.conditionVariants.map((variant) => (
          <FactList key={variant.id} label={`Variant ${variant.label}`}>
            <Facts label={variant.label}>{parameterPhrases(variant.parameters).join('; ') || 'no conditions written'}</Facts>
            <TextFact label="Stage" value={variant.stageId} />
            <TextFact label="Participants" value={variant.participantIds.join(', ')} />
            <NoteFact label="Note" source={variant.note} />
          </FactList>
        ))}
        <h4>Outcomes in full</h4>
        {record.outcomes.map((outcome) => (
          <OutcomeDetail key={outcome.id} outcome={outcome} />
        ))}
      </LevelSection>
      <LevelSection level={4} title="Notes, links and sources">
        <FactList label="Reaction notes">
          <NoteFact label="Regioselectivity" source={record.selectivityNotes?.regio} />
          <NoteFact label="Stereoselectivity" source={record.selectivityNotes?.stereo} />
          <NoteFact label="Chemoselectivity" source={record.selectivityNotes?.chemo} />
          <NoteFact label="Limitations" source={record.limitations} />
          <NoteFact label="Study notes" source={record.studyNotes} />
          <NoteFact label="Notes" source={record.notes} />
          <TextFact label="Difficulty" value={record.difficulty === undefined ? undefined : String(record.difficulty)} />
          <LinkFact label="Mechanisms" refs={record.mechanismIds.map((id) => ({ kind: 'mechanism', id }))} />
          <LinkFact label="Concepts" refs={record.conceptIds.map((id) => ({ kind: 'concept', id }))} />
          <LinkFact label="Prerequisites" refs={record.prerequisiteConceptIds.map((id) => ({ kind: 'concept', id }))} />
          {record.mechanismClasses.length === 0 ? null : (
            <Facts label="Mechanism classes">
              <Links refs={record.mechanismClasses.map((c) => ({ kind: 'concept', id: c.conceptId }))} />
            </Facts>
          )}
          {record.intermediates.map((item) => (
            <Facts key={item.id} label={`Intermediate (${words(item.intermediateKind)})`}>
              {item.label ?? item.id}
              {item.ref === undefined ? null : (
                <>
                  {' '}
                  <RecordLink kind={item.ref.kind} id={item.ref.id} />
                </>
              )}
              <NoteFact label="Note" source={item.note} />
            </Facts>
          ))}
          {record.mappedReaction === undefined ? null : <Facts label={`Mapped reaction (${words(record.mappedReaction.format)})`}>{record.mappedReaction.value}</Facts>}
          <CitationsAndTags citations={record.citations} tags={record.tags} />
        </FactList>
      </LevelSection>
    </>
  );
}
