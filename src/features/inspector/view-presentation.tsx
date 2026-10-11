/**
 * The presentation records in the inspector (step 5.6b, item j): navigator anchor, reaction scheme, saved view and display choice,
 * as plain readable rows. They are view decisions, not chemistry: deleting every one leaves the chemistry unchanged (INV-14).
 */
import type { EntityDisplay, NavigatorAnchor, Reaction, ReactionScheme, ViewPreset } from '@/core/schema';
import { useInspectorEnv } from './env';
import { FactList, Facts, LevelSection } from './levels';
import { RecordList } from './record-list';
import { RecordLink } from './rich-text';
import { LinkFact, TextFact, words } from './view-parts';
import styles from './inspector.module.css';

const Target = (props: { readonly target: { readonly kind: string; readonly id: string } }) => <RecordLink kind={props.target.kind} id={props.target.id} />;

export function NavigatorAnchorLevels(props: { readonly record: NavigatorAnchor }) {
  const { record } = props;
  return (
    <LevelSection level={2} title="Where it sits on the map">
      <FactList label="Navigator anchor">
        <Facts label="Family">
          <Target target={record.target} />
        </Facts>
        <TextFact label="Label" value={record.label} />
        <Facts label="Order">{record.order}</Facts>
        <Facts label="Cell">{record.cell === undefined ? 'none written (the map places it by itself)' : `column ${record.cell.column}, row ${record.cell.row}`}</Facts>
        <TextFact label="Group" value={record.group} />
        <TextFact label="Tone" value={record.tone} />
      </FactList>
    </LevelSection>
  );
}

export function ReactionSchemeLevels(props: { readonly record: ReactionScheme }) {
  const { record } = props;
  const env = useInspectorEnv();
  const reaction = (env.state.records.reaction as Readonly<Record<string, Reaction>>)[record.reactionId];
  const participantRef = (id: string) => reaction?.participants.find((p) => p.id === id)?.ref;
  const productRef = (id: string) => reaction?.outcomes.flatMap((o) => o.products).find((p) => p.id === id)?.ref;
  return (
    <LevelSection level={2} title="How the reaction is drawn">
      <FactList label="Reaction scheme">
        <Facts label="Reaction">
          <RecordLink kind="reaction" id={record.reactionId} />
        </Facts>
        <TextFact label="Condition variant" value={record.conditionVariantId} />
        <Facts label="Stage numbers">{record.showStageNumbers ? 'shown' : 'not shown'}</Facts>
        {record.preferAssetId === undefined ? null : (
          <Facts label="Attached image drawn instead">
            <RecordLink kind="asset" id={record.preferAssetId} />
          </Facts>
        )}
      </FactList>
      <h4 className={styles.subheading}>Participant placements ({record.placements.length})</h4>
      {record.placements.length === 0 ? (
        <p className={styles.muted}>None written: positions come from the participants' roles.</p>
      ) : (
        <RecordList
          label="Participant placements"
          items={record.placements.map((p) => ({ ...(participantRef(p.participantId) ?? { kind: 'reaction', id: record.reactionId }), position: p.position, known: participantRef(p.participantId) !== undefined }))}
          prefix={(item) => <span>{words(item.position)}: </span>}
          suffix={(item) => (item.known ? null : <span className={styles.muted}> (the participant is not in the reaction)</span>)}
        />
      )}
      <h4 className={styles.subheading}>Product placements ({record.productPlacements.length})</h4>
      {record.productPlacements.length === 0 ? (
        <p className={styles.muted}>None written.</p>
      ) : (
        <RecordList
          label="Product placements"
          items={record.productPlacements.map((p) => ({ ...(productRef(p.productId) ?? { kind: 'reaction', id: record.reactionId }), position: p.position, known: productRef(p.productId) !== undefined }))}
          prefix={(item) => <span>{words(item.position)}: </span>}
          suffix={(item) => (item.known ? null : <span className={styles.muted}> (the product is not in the reaction)</span>)}
        />
      )}
    </LevelSection>
  );
}

export function ViewPresetLevels(props: { readonly record: ViewPreset }) {
  const { record } = props;
  const f = record.filters;
  return (
    <LevelSection level={2} title="What the saved view sets">
      <FactList label="Saved view">
        <Facts label="View">{words(record.view)}</Facts>
        {f.examId === undefined ? null : (
          <Facts label="Exam">
            <RecordLink kind="exam" id={f.examId} />
          </Facts>
        )}
        {f.examVersionId === undefined ? null : (
          <Facts label="Exam version">
            <RecordLink kind="exam_version" id={f.examVersionId} />
          </Facts>
        )}
        <TextFact label="Scopes" value={f.scopes.map(words).join(', ')} />
        <LinkFact label="Topics" refs={f.topicIds.map((id) => ({ kind: 'topic', id }))} />
        <TextFact label="Reagent families" value={f.reagentFamilies.map(words).join(', ')} />
        <TextFact label="Text filter" value={f.text} />
        <LinkFact label="Anchors" refs={record.anchorIds.map((id) => ({ kind: 'navigator_anchor', id }))} />
      </FactList>
    </LevelSection>
  );
}

export function EntityDisplayLevels(props: { readonly record: EntityDisplay }) {
  const { record } = props;
  return (
    <LevelSection level={2} title="How the record is shown">
      <FactList label="Display choice">
        <Facts label="Record">
          <Target target={record.target} />
        </Facts>
        <Facts label="As a node">{record.showAsNode === 'never' ? 'never (written on arrows as text)' : 'by default'}</Facts>
        <TextFact label="Label mode" value={record.labelMode === undefined ? undefined : words(record.labelMode)} />
        <TextFact label="Abbreviation" value={record.abbreviation} />
      </FactList>
    </LevelSection>
  );
}
