// @vitest-environment jsdom
/**
 * The map's ONE selection, driven by a seeded state machine (step 8.2b-fix, S6). Random sequences of the real gestures (click a family, the
 * bucket, an arrow of every shape, open a reaction from a list, open a compound from the bucket view, close and reopen the pane, Esc, an
 * empty-map click, Back, Forward) go through the real bridge; after EVERY step the inspector's subject must equal the selection a plain
 * model of the gestures says it is. Two layers: 500 sequences of 20 steps on the pure answer (`mapInspectorView` of the store), and
 * sequences rendered in the desktop pane and the phone sheet, where the DOM must show that subject. A failure prints its seed.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { UNCLASSIFIED_HUB_ID } from '@/core/graph';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout, inspectorRig, preloadViews } from '@/test-support/inspector-kit';
import { PHONE_QUERIES } from '@/ui/hooks';
import { selectionOf } from '@/ui/state';
import { Inspector } from './inspector';
import { mapInspectorView, type MapInspectorView } from './model/map-inspector-view';
import { refOfId } from './model/describe';
import { useBridge } from './use-bridge';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeAll(fakeLayout);
beforeAll(preloadViews);

/** mulberry32: a deterministic generator; the seed is printed when a sequence fails. */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Subject = string; // 'none' | 'record:<kind>:<id>' | 'bucket' | 'arrow:<from>><to>'
const subjectOfView = (view: MapInspectorView): Subject =>
  view.kind === 'empty' ? 'none' : view.kind === 'record' ? `record:${view.ref.kind}:${view.ref.id}` : view.kind === 'bucket' ? 'bucket' : `arrow:${view.from.id}>${view.to.id}`;

function build(phone: boolean, studio: boolean, rendered: boolean) {
  if (phone) vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  const rig = inspectorRig(demoState(), { studyView: !studio });
  const pairs = rig.ports.indexes.current().navigatorRollup().pairs().filter((pair) => pair.from !== pair.to);
  const edges = new Map<string, { from: string; to: string }>();
  pairs.forEach((pair, i) => edges.set(`e${i}`, { from: pair.from, to: pair.to }));
  const hubs = [...new Set(pairs.flatMap((pair) => [pair.from, pair.to]))].filter((id) => id !== UNCLASSIFIED_HUB_ID && refOfId(id) !== undefined);
  const host = { ...rig.host, edgeEnds: (id: string) => edges.get(id) };
  const reactions = Object.keys(rig.state.records.reaction);
  const species = Object.keys(rig.state.records.species);
  const Probe = () => {
    useBridge(rig.ports, host);
    return null;
  };
  if (rendered) render(<Inspector ports={rig.ports} host={host} />);
  else render(<Probe />);
  return { rig, edges, hubs, reactions, species };
}

type World = ReturnType<typeof build>;
type Pick = <T>(items: readonly T[]) => T;
interface Model {
  history: Subject[];
  index: number;
}
const push = (model: Model, subject: Subject): void => {
  if (model.history[model.index] === subject) return;
  model.history = [...model.history.slice(0, model.index + 1), subject];
  model.index = model.history.length - 1;
};
const clickArrow = (w: World, keys: readonly string[], m: Model): void => {
  const key = keys[0] as string;
  const ends = w.edges.get(key) as { from: string; to: string };
  w.rig.ports.ui.selection.getState().select({ kind: 'edge', id: key });
  push(m, `arrow:${ends.from}>${ends.to}`);
};
const keysWhere = (w: World, test: (e: { from: string; to: string }) => boolean): string[] => {
  const hit = [...w.edges.entries()].filter(([, e]) => test(e)).map(([k]) => k);
  return hit.length > 0 ? hit : [...w.edges.keys()];
};

type Step = (w: World, pick: Pick, m: Model) => void;
const STEPS: readonly (readonly [string, Step])[] = [
  ['click family', (w, pick, m) => {
    const id = pick(w.hubs);
    w.rig.ports.ui.selection.getState().select({ kind: 'node', id });
    const ref = refOfId(id);
    push(m, `record:${ref?.kind}:${ref?.id}`);
  }],
  ['click bucket', (w, _p, m) => {
    w.rig.ports.ui.selection.getState().select({ kind: 'node', id: UNCLASSIFIED_HUB_ID });
    push(m, 'bucket');
  }],
  ['click arrow family to family', (w, pick, m) => clickArrow(w, [pick(keysWhere(w, (e) => e.from !== UNCLASSIFIED_HUB_ID && e.to !== UNCLASSIFIED_HUB_ID))], m)],
  ['click arrow into bucket', (w, pick, m) => clickArrow(w, [pick(keysWhere(w, (e) => e.to === UNCLASSIFIED_HUB_ID))], m)],
  ['click arrow out of bucket', (w, pick, m) => clickArrow(w, [pick(keysWhere(w, (e) => e.from === UNCLASSIFIED_HUB_ID))], m)],
  ['open a reaction from a list', (w, pick, m) => {
    const id = pick(w.reactions);
    w.rig.ports.ui.family.getState().selectReaction(id);
    push(m, `record:reaction:${id}`);
  }],
  ['open a compound from the bucket view', (w, pick, m) => {
    const id = pick(w.species);
    w.rig.inspector.getState().open({ kind: 'species', id });
    push(m, `record:species:${id}`);
  }],
  ['close pane', (w) => w.rig.ports.ui.panels.getState().setInspectorOpen(false)],
  ['reopen pane', (w) => w.rig.ports.ui.panels.getState().setInspectorOpen(true)],
  ['Esc / empty-map click', (w, _p, m) => {
    w.rig.ports.ui.selection.getState().select(null);
    push(m, 'none');
  }],
  ['Back', (w, _p, m) => {
    w.rig.inspector.getState().back();
    m.index = Math.max(0, m.index - 1);
  }],
  ['Forward', (w, _p, m) => {
    w.rig.inspector.getState().forward();
    m.index = Math.min(m.history.length - 1, m.index + 1);
  }],
];

const subjectNow = (w: World, studio: boolean): Subject => {
  const entry = selectionOf(w.rig.inspector.getState());
  return subjectOfView(mapInspectorView(entry ?? { kind: 'none' }, { state: w.rig.store.getState(), indexes: w.rig.ports.indexes.current() }, studio ? 'studio' : 'study'));
};
const expectedOf = (m: Model): Subject => m.history[m.index] ?? 'none';

describe('the map selection state machine (pure answer)', () => {
  it('500 seeded sequences of 20 steps: the inspector subject always equals the selection', () => {
    const world = build(false, true, false);
    let failing = '';
    try {
      for (let seed = 1; seed <= 500; seed += 1) {
        failing = `seed ${seed}`;
        world.rig.inspector.getState().clear();
        world.rig.ports.ui.selection.getState().drop();
        const random = generator(seed);
        const pick: Pick = (items) => items[Math.floor(random() * items.length)] as never;
        const model: Model = { history: [], index: -1 };
        for (let n = 0; n < 20; n += 1) {
          const [name, run] = pick(STEPS);
          failing = `seed ${seed}, step ${n + 1} (${name})`;
          act(() => run(world, pick, model));
          expect(subjectNow(world, true), failing).toBe(expectedOf(model));
        }
      }
    } catch (error) {
      throw new Error(`state machine failed at ${failing}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, 120_000);
});

const domSubject = (): Subject => {
  if (document.querySelector('[aria-label="Inspector empty state"]') !== null) return 'none';
  const arrow = document.querySelector('article[data-subject="arrow"]');
  if (arrow !== null) return `arrow:${arrow.getAttribute('data-from')}>${arrow.getAttribute('data-to')}`;
  if (document.querySelector('article[data-subject="bucket"]') !== null) return 'bucket';
  const record = document.querySelector('article[aria-label="Record"]');
  return record === null ? 'loading' : `record:?:${record.getAttribute('data-record-id')}`;
};

describe.each([
  ['the desktop pane (Studio)', false, true],
  ['the phone sheet (Study)', true, false],
])('the map selection state machine, rendered in %s', (_name, phone, studio) => {
  it('seeded sequences: the DOM shows the selection after every step', async () => {
    const world = build(phone, studio, true);
    let failing = '';
    for (let seed = 1; seed <= 12; seed += 1) {
      act(() => world.rig.inspector.getState().clear());
      const random = generator(seed * 7919);
      const pick: Pick = (items) => items[Math.floor(random() * items.length)] as never;
      const model: Model = { history: [], index: -1 };
      for (let n = 0; n < 10; n += 1) {
        const [name, run] = pick(STEPS);
        failing = `seed ${seed * 7919}, step ${n + 1} (${name})`;
        await act(async () => run(world, pick, model));
        await act(async () => {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        });
        const expected = expectedOf(model);
        const shown = domSubject();
        const same = expected.startsWith('record:') ? shown.startsWith('record:') && expected.endsWith(`:${shown.split(':').pop()}`) : shown === expected;
        expect(same, `${failing}: expected ${expected}, the DOM shows ${shown}`).toBe(true);
      }
    }
  }, 180_000);
});
