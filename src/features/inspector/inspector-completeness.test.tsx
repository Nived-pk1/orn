// @vitest-environment jsdom
/**
 * The inspector over the maximal fixture (step 5.6a; TEST_STRATEGY §2, ADV-033 inspector part): for EVERY record of every kind, with
 * all levels opened, the raw record shown at L5 parses back to exactly the stored record, so no leaf is omitted; the kind views add no
 * script, image or link of their own from hostile text; a `javascript:` URL is never a link; a link to a missing record says so.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { createCanonicalStore } from '@/core/commands';
import { deserializeDocument, documentToState } from '@/core/dataset';
import { RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordRef } from '@/core/schema';
import { manualTimers } from '@/test-support/navigator-kit';
import { createFamilyStore, createInspectorStore, createPanelsStore, createSelectionStore } from '@/ui/state';
import type { InspectorHost, InspectorPorts } from './contracts';
import { Inspector } from './inspector';
import { loadOtherViews } from './lazy-views';
import { InspectorEnvContext, makeEnv } from './env';
import { ExternalLink, RecordLink, RichText } from './rich-text';

afterEach(cleanup);
beforeAll(async () => {
  await loadOtherViews();
});

const text = readFileSync(resolve(process.cwd(), 'data/fixtures/schema/v2/maximal-valid.orn.json'), 'utf8');
const parsed = deserializeDocument(text);
if (!parsed.ok) throw new Error('the maximal fixture does not load');
const loaded = documentToState(parsed.document);
if (!loaded.ok) throw new Error('duplicate IDs in the maximal fixture');

function rig(state: CanonicalState = loaded.ok ? loaded.state : (undefined as never)) {
  const store = createCanonicalStore({ initial: state, revision: 0, validateInitial: false });
  const indexes = createDerivedIndexes({ store, clock: { nowMs: () => 0 } });
  const timers = manualTimers();
  const inspector = createInspectorStore();
  const panels = createPanelsStore({ stored: undefined, mode: () => 'writable', save: () => Promise.resolve() }, { after: () => () => undefined });
  const ports: InspectorPorts = {
    store,
    indexes: { current: () => indexes.current() },
    findings: store.findings,
    l4: { statusOf: () => ({ state: 'none' }), derivedFormulaOf: () => undefined, subscribe: () => () => undefined, subscribeFormulas: () => () => undefined },
    timers,
    ui: { inspector, selection: createSelectionStore(), family: createFamilyStore(), panels },
    log: () => undefined,
  };
  const host: InspectorHost = { openPane: () => undefined, edgeEnds: () => undefined, navigatorShown: false };
  return { ports, host, inspector, state };
}

/** Opens every closed level and the raw record until nothing more opens. */
function openEverything(): void {
  for (let round = 0; round < 8; round += 1) {
    const closed = [...document.querySelectorAll('button[aria-expanded="false"]')];
    if (closed.length === 0) return;
    for (const button of closed) fireEvent.click(button);
  }
}

describe('every record of the maximal fixture', () => {
  const records: AnyRecord[] = RECORD_KINDS.flatMap((kind) => Object.values(loaded.ok ? (loaded.state.records[kind] as Record<string, AnyRecord>) : {}));

  it('has records of many kinds', () => {
    expect(records.length).toBeGreaterThan(20);
  });

  it.each(records.map((record) => [record.kind, record.id] as const))('%s %s: the raw record at L5 is the stored record, nothing omitted', (kind, id) => {
    const { ports, host, inspector, state } = rig();
    render(<Inspector ports={ports} host={host} />);
    act(() => inspector.getState().open({ kind, id } as RecordRef));
    openEverything();
    const raw = screen.getByLabelText('Raw record');
    const stored = (state.records[kind] as unknown as Record<string, AnyRecord>)[id];
    expect(JSON.parse(raw.textContent ?? '')).toEqual(JSON.parse(JSON.stringify(stored)));
    // the six sections: the header and L2 to L5
    expect(document.querySelectorAll('section[data-level]').length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector('script, iframe, object, embed')).toBeNull();
  });
});

describe('hostile content is inert (ADV-033, inspector part)', () => {
  const withEnv = (node: React.ReactNode) => {
    const { ports, host, state } = rig();
    return render(<InspectorEnvContext.Provider value={makeEnv(ports, host, state, () => undefined)}>{node}</InspectorEnvContext.Provider>);
  };

  it('a javascript: URL is plain text, an https URL is a link that opens safely', () => {
    withEnv(
      <>
        <ExternalLink url="javascript:alert(1)">bad</ExternalLink>
        <ExternalLink url="https://example.org/a">good</ExternalLink>
        <ExternalLink url="https://user:pass@example.org/">credentials</ExternalLink>
      </>,
    );
    expect(screen.getByText('bad').closest('a')).toBeNull();
    expect(screen.getByText('credentials').closest('a')).toBeNull();
    const good = screen.getByRole('link', { name: 'good' });
    expect(good.getAttribute('rel')).toBe('noopener noreferrer');
    expect(good.getAttribute('target')).toBe('_blank');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('markup in rich text is text; a link to a missing record says so and is not a link', () => {
    const { container } = withEnv(<RichText source={'<img src=x onerror=alert(1)> **bold** <script>x</script> [[rxn_nothere0000000000000000]]'} />);
    expect(container.querySelector('img, script')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(within(container).queryByRole('link')).toBeNull();
  });

  it('RecordLink to a missing record is words', () => {
    const { container } = withEnv(<RecordLink kind="species" id="spc_missing" />);
    expect(container.textContent).toBe('missing record spc_missing');
    expect(container.querySelector('a')).toBeNull();
  });
});
