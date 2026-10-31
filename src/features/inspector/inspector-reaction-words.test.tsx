// @vitest-environment jsdom
/**
 * Step 5.7 follow-up a: a reaction in the inspector names participants, stages and variants in words (never by nested ID outside L5),
 * an empty section says so, and a reaction without a mechanism record says so (naming its mechanism classes when it has some).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { createCanonicalStore } from '@/core/commands';
import { deserializeDocument, documentToState } from '@/core/dataset';
import type { CanonicalState, Reaction } from '@/core/schema';
import { manualTimers } from '@/test-support/navigator-kit';
import { createFamilyStore, createInspectorStore, createPanelsStore, createSelectionStore } from '@/ui/state';
import { nameOf } from './model/describe';
import type { InspectorHost, InspectorPorts } from './contracts';
import { Inspector } from './inspector';
import { loadOtherViews } from './lazy-views';

afterEach(cleanup);
beforeAll(async () => {
  await loadOtherViews();
});

const parsed = deserializeDocument(readFileSync(resolve(process.cwd(), 'data/fixtures/schema/v2/maximal-valid.orn.json'), 'utf8'));
if (!parsed.ok) throw new Error('the maximal fixture does not load');
const loaded = documentToState(parsed.document);
if (!loaded.ok) throw new Error('duplicate IDs in the maximal fixture');
const base: CanonicalState = loaded.state;
const reactions = Object.values(base.records.reaction as Record<string, Reaction>);

function show(reaction: Reaction): void {
  const state = { ...base, records: { ...base.records, reaction: { ...base.records.reaction, [reaction.id]: reaction } } } as CanonicalState;
  const store = createCanonicalStore({ initial: state, revision: 0, validateInitial: false });
  const indexes = createDerivedIndexes({ store, clock: { nowMs: () => 0 } });
  const inspector = createInspectorStore();
  const panels = createPanelsStore({ stored: undefined, mode: () => 'writable', save: () => Promise.resolve() }, { after: () => () => undefined });
  const ports: InspectorPorts = {
    store,
    indexes: { current: () => indexes.current() },
    findings: store.findings,
    l4: { statusOf: () => ({ state: 'none' }), derivedFormulaOf: () => undefined, subscribe: () => () => undefined, subscribeFormulas: () => () => undefined },
    timers: manualTimers(),
    ui: { inspector, selection: createSelectionStore(), family: createFamilyStore(), panels },
    log: () => undefined,
  };
  const host: InspectorHost = { openPane: () => undefined, edgeEnds: () => undefined, navigatorShown: false };
  render(<Inspector ports={ports} host={host} />);
  act(() => inspector.getState().open({ kind: 'reaction', id: reaction.id }));
  for (let round = 0; round < 8; round += 1) {
    const closed = [...document.querySelectorAll('button[aria-expanded="false"]')];
    for (const button of closed) fireEvent.click(button);
  }
}

/** The visible text of the inspector without the raw record (L5), where IDs stay. */
const visibleText = (): string => {
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelector('[aria-label="Raw record"]')?.remove();
  clone.querySelectorAll('[data-record-id]').forEach((el) => el.removeAttribute('href'));
  return clone.textContent ?? '';
};

describe('a reaction names its parts in words', () => {
  const rich = reactions.find((r) => r.stages.some((s) => s.participantIds.length > 0));
  it('has a fixture reaction with staged participants', () => {
    expect(rich).toBeDefined();
  });

  it('stage and variant participants are shown by name; no nested ID is text outside L5', () => {
    if (rich === undefined) return;
    const withVariant: Reaction = {
      ...rich,
      conditionVariants: rich.conditionVariants.length > 0 ? rich.conditionVariants : [{ id: 'cnd_aaaaaaaaaaaaaaaaaaaaaaaa', label: 'Hot', parameters: {}, participantIds: rich.participants.slice(0, 1).map((p) => p.id), stageId: rich.stages[0]?.id } as never],
    };
    show(withVariant);
    const text = visibleText();
    const ids = [...withVariant.participants.map((p) => p.id), ...withVariant.stages.map((s) => s.id), ...withVariant.conditionVariants.map((v) => v.id), ...withVariant.outcomes.map((o) => o.id)];
    for (const id of ids) expect(text, id).not.toContain(id);
    const first = withVariant.stages.find((s) => s.participantIds.length > 0);
    const participant = withVariant.participants.find((p) => p.id === first?.participantIds[0]);
    expect(participant).toBeDefined();
    const stageFacts = screen.getAllByLabelText(/^Stage /).map((el) => el.textContent ?? '');
    const named = stageFacts.find((t) => t.includes('Participants'));
    expect(named).toBeDefined();
    expect(named).toContain(nameOf(base, (participant as NonNullable<typeof participant>).ref));
  });
});

describe('empty sections and the mechanism place', () => {
  const some = reactions[0] as Reaction;
  const bare: Reaction = { ...some, stages: [], conditionVariants: [], mechanismIds: [], mechanismClasses: [], outcomes: some.outcomes.map((o) => ({ ...o, conditionVariantIds: [], mechanism: undefined })) };

  it('says "No stages" and "No condition variants" in words', () => {
    show(bare);
    expect(screen.getByText('No stages')).toBeDefined();
    expect(screen.getByText('No condition variants')).toBeDefined();
  });

  it('a reaction without a mechanism record says so', () => {
    show(bare);
    expect(screen.getByText('No mechanism recorded for this reaction')).toBeDefined();
  });

  it('with mechanism classes but no mechanism record it names the classes', () => {
    const cls = reactions.find((r) => r.mechanismClasses.length > 0);
    if (cls === undefined) return;
    show({ ...cls, mechanismIds: [], outcomes: cls.outcomes.map((o) => ({ ...o, mechanism: undefined })) });
    expect(visibleText()).toContain('(no step-by-step mechanism recorded)');
    expect(visibleText()).toContain('Mechanism class:');
    expect(screen.queryByText('No mechanism recorded for this reaction')).toBeNull();
  });
});

describe('the text the reaction writes for a participant or product is labelled "as written" (7.3b A5)', () => {
  it('shows as written: for a participant and a product', () => {
    const reaction = reactions.find((r) => r.outcomes.some((o) => o.products.length > 0) && r.participants.length > 0);
    if (reaction === undefined) throw new Error('no fixture reaction');
    show({
      ...reaction,
      participants: reaction.participants.map((p, i) => (i === 0 ? { ...p, originalText: 'R–CH₂OH' } : p)),
      outcomes: reaction.outcomes.map((o) => ({ ...o, products: o.products.map((p, i) => (i === 0 ? { ...p, originalText: 'R–CHO' } : p)) })),
    });
    const text = visibleText();
    expect(text).toContain('as written: R–CH₂OH');
    expect(text).toContain('as written: R–CHO');
  });
});
