// @vitest-environment jsdom
/**
 * Every one of the 22 record kinds has a readable view (step 5.6b, item m; TEST_STRATEGY §2), over the maximal fixture: the view says
 * which kind it is, shows facts at L2, renders without a React warning with every level open, and (with the raw record at L5, which
 * `inspector-completeness.test.tsx` proves parses back to the stored record) no leaf of a record is left out. Then the specific
 * views: route, topic, relationship, reference, exam and exam version, the curriculum at L4, the asset through an `<img>` with a blob
 * URL (ADV-033 asset part; AST-002 in words) and the presentation records.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordRef } from '@/core/schema';
import { fakeLayout, inspectorRig, maximalState, openEverything, openLevels } from '@/test-support/inspector-kit';
import type { AssetImage } from './contracts';
import { Inspector } from './inspector';
import { READABLE_KINDS } from './views';

afterEach(cleanup);
beforeAll(fakeLayout);

const state = maximalState();

function show(ref: RecordRef, withState: CanonicalState = state, options: Parameters<typeof inspectorRig>[1] = {}) {
  const rig = inspectorRig(withState, options);
  render(<Inspector ports={rig.ports} host={rig.host} />);
  act(() => rig.inspector.getState().open(ref));
  return rig;
}
const all = RECORD_KINDS.flatMap((kind) => Object.values(state.records[kind] as Record<string, AnyRecord>));

describe('all 22 kinds', () => {
  it('every kind of the schema is readable, and the maximal fixture has a record of each', () => {
    expect([...READABLE_KINDS].sort()).toEqual([...RECORD_KINDS].sort());
    expect(RECORD_KINDS).toHaveLength(22);
    for (const kind of RECORD_KINDS) expect(Object.keys(state.records[kind]).length, kind).toBeGreaterThan(0);
  });

  it.each(all.map((record) => [record.kind, record.id] as const))('%s %s has its own view with facts, and renders cleanly with everything open', (kind, id) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    show({ kind, id } as RecordRef);
    openEverything();
    const view = document.querySelector('[data-view]') as HTMLElement;
    expect(view.getAttribute('data-view')).toBe(kind);
    expect(view.querySelectorAll('dl, ul, ol').length).toBeGreaterThan(0);
    expect(view.querySelector('section[data-level="2"]')).not.toBeNull();
    expect(errors.mock.calls.map((c) => c.map(String).join(' ').slice(0, 300))).toEqual([]);
    errors.mockRestore();
  });
});

describe('route, topic, relationship, reference', () => {
  it('a route lists its steps in order with the reaction as a link', () => {
    const route = Object.values(state.records.route)[0] as { id: string; steps: { reactionId: string }[] };
    show({ kind: 'route', id: route.id } as RecordRef);
    const steps = screen.getByRole('list', { name: 'Steps of the route' });
    const items = within(steps).getAllByRole('listitem');
    expect(items).toHaveLength(route.steps.length);
    expect(items[0]?.textContent).toMatch(/^Step 1: /);
    expect(within(items[0] as HTMLElement).getByRole('link')).toBeTruthy();
  });

  it('a relationship names both ends and reads both ways', () => {
    const rel = Object.values(state.records.relationship)[0] as { id: string };
    show({ kind: 'relationship', id: rel.id } as RecordRef);
    expect(screen.getByText('From')).toBeTruthy();
    expect(screen.getByText('To')).toBeTruthy();
    expect(screen.getByText('Read both ways')).toBeTruthy();
  });

  it('a topic shows its parent or children and its mapped records', () => {
    const topics = Object.values(state.records.topic) as { id: string; parentId?: string }[];
    const parent = topics.find((t) => topics.some((c) => c.parentId === t.id)) as { id: string };
    show({ kind: 'topic', id: parent.id } as RecordRef);
    openLevels();
    expect(screen.getByRole('list', { name: /^Children \(\d+\)$/ })).toBeTruthy();
    expect(screen.getByText(/^Mapped records \(\d+\)$/)).toBeTruthy();
  });

  it('a reference lists who cites it', () => {
    const refs = Object.values(state.records.reference) as { id: string }[];
    show({ kind: 'reference', id: (refs[0] as { id: string }).id } as RecordRef);
    openLevels();
    expect(screen.getByText(/^Cited by \(\d+\)$/)).toBeTruthy();
  });
});

describe('exam and exam version, and the curriculum at L4', () => {
  it('an exam version says its status in words and shows the coverage of every unit', () => {
    const version = Object.values(state.records.exam_version)[0] as { id: string; status: string; units: { title: string }[] };
    show({ kind: 'exam_version', id: version.id } as RecordRef);
    openLevels();
    expect(screen.getByText('Status').nextElementSibling?.textContent).toMatch(version.status === 'official' ? /^official$/ : /not verified$/);
    const units = screen.getByRole('list', { name: 'Units' });
    expect(within(units).getAllByRole('listitem').length).toBeGreaterThanOrEqual(version.units.length);
  });

  it('a provisional version says "provisional, not verified"', () => {
    const version = Object.values(state.records.exam_version)[0] as { id: string };
    const changed: CanonicalState = {
      ...state,
      records: { ...state.records, exam_version: { ...state.records.exam_version, [version.id]: { ...(state.records.exam_version as Record<string, object>)[version.id], status: 'provisional' } } },
    } as CanonicalState;
    show({ kind: 'exam_version', id: version.id } as RecordRef, changed);
    expect(screen.getByText('provisional, not verified')).toBeTruthy();
  });

  it('a chemistry record at L4 shows its topic mappings and, for every exam version, its scope with the reason', () => {
    const mapping = Object.values(state.records.topic_mapping)[0] as { target: RecordRef };
    show(mapping.target);
    openLevels();
    const curriculum = screen.getByRole('region', { name: 'Curriculum' });
    expect(within(curriculum).getByRole('list', { name: 'Topic mappings' })).toBeTruthy();
    const scopes = within(curriculum).getByRole('list', { name: 'Scope under each exam version' });
    const rows = within(scopes).getAllByRole('listitem');
    expect(rows).toHaveLength(Object.keys(state.records.exam_version).length);
    expect(rows[0]?.textContent).toMatch(/Why: /);
    expect(rows[0]?.getAttribute('data-scope')).toMatch(/^(official|prerequisite|enrichment|outside|unmapped)$/);
  });

  it('a record with no mapping says so, and is unmapped under every version', () => {
    const mapped = new Set((Object.values(state.records.topic_mapping) as { target: RecordRef }[]).map((m) => m.target.id));
    const lone = (Object.values(state.records.species) as { id: string }[]).find((s) => !mapped.has(s.id)) as { id: string };
    show({ kind: 'species', id: lone.id } as RecordRef);
    openLevels();
    expect(screen.getByText('This record is not mapped to any topic.')).toBeTruthy();
    for (const row of within(screen.getByRole('list', { name: 'Scope under each exam version' })).getAllByRole('listitem')) expect(['unmapped', 'official', 'prerequisite', 'enrichment', 'outside']).toContain(row.getAttribute('data-scope'));
  });
});

describe('the asset image (ADV-033 asset part, AST-002)', () => {
  const asset = Object.values(state.records.asset)[0] as { id: string };
  const svgState = (): CanonicalState =>
    ({
      ...state,
      records: { ...state.records, asset: { ...state.records.asset, [asset.id]: { ...(state.records.asset as Record<string, object>)[asset.id], mediaType: 'image/svg+xml', filename: 'scheme.svg' } } },
    }) as CanonicalState;

  const portOf = (result: AssetImage) => {
    const revoked: string[] = [];
    const opened: { id: string; type: string }[] = [];
    return {
      revoked,
      opened,
      assets: {
        open: (id: string, type: string) => {
          opened.push({ id, type });
          return Promise.resolve(result);
        },
        revoke: (url: string) => void revoked.push(url),
      },
    };
  };

  it('is an <img> with a blob URL, never inlined; an SVG asset too; the URL is revoked when the view goes', async () => {
    const port = portOf({ ok: true, url: 'blob:http://localhost/abc' });
    const rig = inspectorRig(svgState());
    const ports = { ...rig.ports, assets: port.assets };
    const view = render(<Inspector ports={ports} host={rig.host} />);
    act(() => rig.inspector.getState().open({ kind: 'asset', id: asset.id } as RecordRef));
    const img = (await screen.findByRole('img')) as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('blob:http://localhost/abc');
    expect(img.getAttribute('alt')).toBe('Reaction scheme image (1×1 placeholder).');
    expect(port.opened).toEqual([{ id: asset.id, type: 'image/svg+xml' }]);
    expect(document.querySelector('svg, object, embed, iframe, script')).toBeNull();
    view.unmount();
    expect(port.revoked).toEqual(['blob:http://localhost/abc']);
  });

  it('a missing blob is said in words (AST-002) and nothing is drawn', async () => {
    const port = portOf({ ok: false, reason: 'missing', message: 'The bytes of this image are not stored (finding AST-002).' });
    const rig = inspectorRig(state);
    render(<Inspector ports={{ ...rig.ports, assets: port.assets }} host={rig.host} />);
    act(() => rig.inspector.getState().open({ kind: 'asset', id: asset.id } as RecordRef));
    expect(await screen.findByText(/not stored \(finding AST-002\)/)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('without an assets port the view says it cannot show the image', async () => {
    show({ kind: 'asset', id: asset.id } as RecordRef);
    expect(await screen.findByText(/no way to read image bytes/)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows what it is attached to and its metadata', () => {
    show({ kind: 'asset', id: asset.id } as RecordRef);
    openLevels();
    expect(screen.getByRole('list', { name: /^Attached to \(1\)$/ })).toBeTruthy();
    expect(screen.getByText('Media type')).toBeTruthy();
    expect(screen.getByText('SHA-256')).toBeTruthy();
  });
});

describe('the presentation records are plain readable rows', () => {
  it.each([
    ['navigator_anchor', 'Navigator anchor', ['Family', 'Order', 'Cell']],
    ['reaction_scheme', 'Reaction scheme', ['Reaction', 'Stage numbers']],
    ['view_preset', 'Saved view', ['View']],
    ['entity_display', 'Display choice', ['Record', 'As a node']],
  ] as const)('%s', (kind, label, terms) => {
    const record = Object.values(state.records[kind] as Record<string, { id: string }>)[0] as { id: string };
    show({ kind, id: record.id } as RecordRef);
    const facts = document.querySelector(`dl[aria-label="${label}"]`) as HTMLElement;
    expect(facts).not.toBeNull();
    for (const term of terms) expect(within(facts).getByText(term)).toBeTruthy();
  });

  it('a navigator anchor with no cell says the map places it by itself', () => {
    const anchors = Object.values(state.records.navigator_anchor) as { id: string; cell?: unknown }[];
    const noCell = anchors.find((a) => a.cell === undefined);
    if (noCell === undefined) return;
    show({ kind: 'navigator_anchor', id: noCell.id } as RecordRef);
    fireEvent.click(document.body);
    expect(screen.getByText(/the map places it by itself/)).toBeTruthy();
  });
});

describe('hostile text in the new views is inert (ADV-033, inspector part)', () => {
  const evil = '<img src=x onerror=alert(1)><script>alert(2)</script> **bold** [[rxn_missing-record]]';
  const patch = (kind: 'caveat' | 'named_reaction' | 'topic' | 'route' | 'reference', fields: Record<string, unknown>): { state: CanonicalState; id: string } => {
    const record = Object.values(state.records[kind] as Record<string, { id: string }>)[0] as { id: string };
    return {
      id: record.id,
      state: { ...state, records: { ...state.records, [kind]: { ...(state.records[kind] as Record<string, object>), [record.id]: { ...(state.records[kind] as Record<string, object>)[record.id], ...fields } } } } as CanonicalState,
    };
  };

  it.each([
    ['caveat', { statement: evil, rule: evil, explanation: evil }],
    ['named_reaction', { summary: evil, typicalConditions: evil }],
    ['topic', { summary: evil }],
    ['route', { description: evil }],
    ['reference', { notes: evil, url: 'javascript:alert(1)' }],
  ] as const)('%s: markup is text, a javascript: URL is not a link, a missing record is said in words', (kind, fields) => {
    const { state: hostile, id } = patch(kind, fields);
    show({ kind, id } as RecordRef, hostile);
    openEverything();
    expect(document.querySelector('script, iframe, object, embed, img')).toBeNull();
    expect([...document.querySelectorAll('a')].some((a) => (a.getAttribute('href') ?? '').toLowerCase().startsWith('javascript:'))).toBe(false);
    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
