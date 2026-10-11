// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fakeLayout } from '@/test-support/inspector-kit';
import { APPLIED_OK, blockedPlan, conflictingPlan, errorFinding, fakePorts, legacyPlan, plan } from '@/test-support/data-exchange-kit';
import { stubDialog } from '@/test-support/window-kit';
import { ToastProvider } from '@/ui/primitives';
import { createImportModel } from './import-model';
import { ImportScreen } from './import-screen';

beforeAll(() => {
  stubDialog();
  fakeLayout();
});
afterEach(cleanup);

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await act(async () => Promise.resolve());
};

async function open(answer: unknown, name = 'mine.orn.json') {
  const ports = fakePorts();
  ports.preview.mockResolvedValue(answer);
  ports.apply.mockResolvedValue(APPLIED_OK);
  const model = createImportModel(ports);
  render(
    <ToastProvider>
      <ImportScreen model={model} ports={ports} />
    </ToastProvider>,
  );
  act(() => model.openFile(new File(['{}'], name)));
  await settle();
  return { ports, model };
}
const ok = (p = plan(), extra: Record<string, unknown> = {}) => ({ ok: true, plan: p, inProcess: false, ...extra });
const button = (name: string): HTMLElement => screen.getByRole('button', { name });

describe('refusals before the preview, in words, with the file name as text', () => {
  it.each([
    ['FILE_TOO_LARGE', 'The file is too large', /bigger than the app accepts/],
    ['INVALID_JSON', 'This is not a JSON file or a package', /not valid JSON and not an ORN package/],
    ['TOO_DEEP', 'The file is nested too deeply', /more than 64 levels deep/],
    ['UNKNOWN_FORMAT', 'The format is not recognised', /not an ORN dataset, an ORN package, or an export of the older app/],
    ['NEWER_SCHEMA', 'Saved by a newer version of the app', /saved by a newer version of the app/],
  ])('%s', async (code, title, text) => {
    await open({ ok: false, code, message: 'detail' }, 'weird.json');
    expect(screen.getByRole('heading', { name: 'The file was not imported' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(text);
    expect(screen.getByText('weird.json')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    fireEvent.click(button('Dismiss'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hostile file names and contents are text, never markup', async () => {
    const hostile = '<img src=x onerror=alert(1)>.json';
    const p = plan({
      preview: {
        quarantined: [{ claimedKind: 'species', claimedId: '<script>alert(2)</script>', issues: ['<b onmouseover=alert(3)>bad</b>'], raw: {} }],
        findings: [{ ...errorFinding('x', 'rxn_1'), message: '<img src=y onerror=alert(4)>' }],
        findingSummary: { error: 1, warning: 0, info: 0, reviewRequired: 0, truncated: false },
        canConfirm: false,
        blockers: ['<iframe src=z></iframe>'],
      },
    });
    await open(ok(p), hostile);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('img, script, iframe, b')).toBeNull();
    expect(within(dialog).getByText(hostile)).toBeTruthy();
    expect(within(dialog).getByText(/<script>alert\(2\)<\/script>/)).toBeTruthy();
    expect(within(dialog).getByText(/<img src=y onerror=alert\(4\)>/)).toBeTruthy();
    expect(within(dialog).getAllByText(/<iframe src=z><\/iframe>/).length).toBeGreaterThan(0);
  });

  it('a name with control and direction characters is made visible', async () => {
    await open(ok(), 'a‮b.json');
    expect(screen.getByText('a\\u202eb.json')).toBeTruthy();
  });
});

describe('the preview in words', () => {
  it('names the format, the schema version, the counts per kind and the mode', async () => {
    await open(ok(plan({ preview: { detectedSchemaVersion: 3, migrationsApplied: ['v2-to-v3'] } })));
    expect(screen.getByRole('heading', { name: 'Import summary' })).toBeTruthy();
    expect(screen.getByText(/Format: ORN dataset \(data format version 3\)\. 5 records in the file; 5 would be written/)).toBeTruthy();
    const kinds = within(screen.getByRole('list', { name: 'Records per kind' }));
    expect(kinds.getByText('species: 3 in the file — 3 new, 0 identical, 0 conflicting')).toBeTruthy();
    expect(screen.getByText(/brought up to date first: v2-to-v3/)).toBeTruthy();
    const mode = screen.getByRole('group', { name: 'How to bring it in' });
    expect((within(mode).getByRole('radio', { name: /^Merge/ }) as HTMLInputElement).checked).toBe(true);
    expect(within(mode).getByText(/replaces everything you have with the file; Undo import brings it back\./)).toBeTruthy();
  });

  it('says a legacy file by its format and an earlier import of the same file', async () => {
    await open(ok(legacyPlan(), { earlierImport: { batchId: 'b0', appliedAt: '2026-10-01T09:00:00.000Z', fileName: 'v6.json' } }), 'v6.json');
    expect(screen.getByText(/Format: legacy v6 export \(older app format\)/)).toBeTruthy();
    expect(screen.getByText(/This file was imported before .*identical records are skipped\./)).toBeTruthy();
  });

  it('conflicts: identical ones are counted and skipped; the others have a bulk and a per-record choice', async () => {
    await open(ok(conflictingPlan()));
    const section = screen.getByRole('region', { name: 'Records in both' });
    expect(within(section).getByText(/1 identical \(skipped, nothing changes\); 2 differ\./)).toBeTruthy();
    for (const label of ['Keep mine for all 2', "Use the file's for all 2", "Keep both, the file's as a copy for all 2"]) expect(within(section).getByRole('button', { name: label })).toBeTruthy();
    const list = within(screen.getByRole('list', { name: 'Records that differ' }));
    expect(list.getAllByRole('listitem')).toHaveLength(2);
    expect((list.getByRole('combobox', { name: /Choice for species spc_2/ }) as HTMLSelectElement).value).toBe('keep_current');
    expect(list.getAllByRole('option', { name: "Use the file's" }).length).toBe(2);
  });

  it('quarantined records are listed with their issues in words', async () => {
    const p = plan({ preview: { quarantined: [{ claimedKind: 'reaction', claimedId: 'rxn_9', issues: ['outcomes: required'], raw: {} }, { issues: ['not an object'], raw: 3 }] } });
    await open(ok(p));
    const list = within(screen.getByRole('list', { name: 'Records set aside' }));
    expect(list.getByText(/reaction rxn_9/)).toBeTruthy();
    expect(list.getByText(/outcomes: required/)).toBeTruthy();
    expect(list.getByText(/unknown kind without an ID/)).toBeTruthy();
    expect(screen.getByText(/Set aside, not imported \(2\)/)).toBeTruthy();
  });

  it('findings: the counts are complete and a cut list says so', async () => {
    const p = plan({ preview: { findings: [errorFinding('a', 'rxn_1')], findingSummary: { error: 1, warning: 4000, info: 5, reviewRequired: 2, truncated: true } } });
    await open(ok(p));
    const section = screen.getByRole('region', { name: 'Findings of the result' });
    expect(within(section).getByText(/1 errors, 4000 warnings, 5 notes, 2 to review \(4008 in all\)\. The list shows the first 1, errors first; the counts are complete\./)).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Findings' })).getByText(/Error/)).toBeTruthy();
  });

  it('a legacy file: the per-hub decision, review items, nothing not imported, document values', async () => {
    await open(ok(legacyPlan({ documentUnmapped: { 'dropped.x': { a: 1 } } })), 'v6.json');
    const decision = screen.getByRole('combobox', { name: 'Decision: Import the hub "Acids" as' }) as HTMLSelectElement;
    expect(decision.value).toBe('class');
    expect([...decision.options].map((o) => o.value)).toEqual(['class', 'species']);
    const legacy = screen.getByRole('region', { name: 'Legacy report' });
    expect(within(legacy).getByText('Created: 4 species, 3 reaction, 2 class.')).toBeTruthy();
    expect(within(legacy).getByText(/Needs your review \(1\)/)).toBeTruthy();
    expect(within(legacy).getByText(/the hub has two parents/)).toBeTruthy();
    expect(within(legacy).getByText(/Not imported \(0\)/)).toBeTruthy();
    expect(within(legacy).getByText(/Nothing was left out/)).toBeTruthy();
    expect(within(legacy).getByText(/Kept with the document, not with a record \(1\)/)).toBeTruthy();
    expect(within(legacy).getByText(/dropped\.x/)).toBeTruthy();
  });

  it('a legacy value that is not imported is listed with its reason', async () => {
    await open(ok(legacyPlan({ notImported: [{ legacyId: 'compounds[3]', reason: 'it has no name' }] })), 'v6.json');
    expect(screen.getByText(/Not imported \(1\)/)).toBeTruthy();
    expect(screen.getByText(/compounds\[3\]/)).toBeTruthy();
    expect(screen.getByText(/it has no name/)).toBeTruthy();
  });
});

describe('choices revise the whole request; Confirm waits while blocked (INV-21)', () => {
  it('a choice sends the full request and the screen shows the answer', async () => {
    const { ports } = await open(ok(conflictingPlan()));
    const answer = conflictingPlan();
    ports.revise.mockResolvedValue(ok({ ...answer, conflicts: answer.conflicts.map((c) => (c.ref.id === 'spc_3' ? { ...c, resolution: 'replace' as const } : c)) }));
    fireEvent.change(screen.getByRole('combobox', { name: /Choice for species spc_3/ }), { target: { value: 'replace' } });
    await settle();
    expect(ports.revise).toHaveBeenCalledTimes(1);
    expect(ports.revise.mock.calls[0]?.[0]).toBe('batch-1');
    expect(ports.revise.mock.calls[0]?.[1]).toEqual({
      mode: 'merge',
      resolutions: [
        { id: 'spc_1', resolution: 'identical_skip' },
        { id: 'spc_2', resolution: 'keep_current' },
        { id: 'spc_3', resolution: 'replace' },
      ],
      excluded: [],
    });
    expect((screen.getByRole('combobox', { name: /Choice for species spc_3/ }) as HTMLSelectElement).value).toBe('replace');
  });

  it('the bulk choice and the mode are revises too', async () => {
    const { ports } = await open(ok(conflictingPlan()));
    ports.revise.mockResolvedValue(ok(conflictingPlan()));
    fireEvent.click(button('Keep both, the file\'s as a copy for all 2'));
    await settle();
    expect(ports.revise.mock.calls[0]?.[1].resolutions.map((r: { resolution: string }) => r.resolution)).toEqual(['identical_skip', 'import_as_copy', 'import_as_copy']);
    fireEvent.click(screen.getByRole('radio', { name: /^Replace all/ }));
    await settle();
    expect(ports.revise.mock.calls[1]?.[1]).toEqual({ mode: 'replace_all', excluded: [] });
  });

  it('a blocked plan: reasons in words, an Exclude per record, and Confirm does nothing', async () => {
    const { ports } = await open(ok(blockedPlan()));
    expect(within(screen.getByRole('list', { name: 'Blockers' })).getByText('1 errors must be fixed or those records left out')).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'Confirm', description: '1 errors must be fixed or those records left out' });
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(confirm);
    expect(ports.apply).not.toHaveBeenCalled();
    ports.revise.mockResolvedValue(ok(plan({ excluded: [{ kind: 'reaction', id: 'rxn_1' } as never], preview: { mergedRecordCount: 4 } })));
    fireEvent.click(button('Exclude reaction rxn_1'));
    await settle();
    expect(ports.revise.mock.calls[0]?.[1].excluded).toEqual([{ kind: 'reaction', id: 'rxn_1' }]);
    expect(screen.getByText(/Left out of the import \(1\)/)).toBeTruthy();
    expect(button('Include again')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm' }).getAttribute('aria-disabled')).toBeNull();
  });

  it('a hub decision is a revise with the chosen option', async () => {
    const { ports } = await open(ok(legacyPlan()), 'v6.json');
    ports.revise.mockResolvedValue(ok(legacyPlan()));
    fireEvent.change(screen.getByRole('combobox', { name: /Decision: Import the hub/ }), { target: { value: 'species' } });
    await settle();
    expect(ports.revise.mock.calls[0]?.[1]).toEqual({ mode: 'replace_all', excluded: [], decisions: [{ id: 'hub:cls_a', chosen: 'species' }] });
  });

  it('Confirm applies the plan shown; Cancel (and Esc) apply nothing', async () => {
    const { ports } = await open(ok());
    fireEvent.click(button('Confirm'));
    await settle();
    expect(ports.apply).toHaveBeenCalledTimes(1);
    expect(ports.apply.mock.calls[0]?.[1].preview.batchId).toBe('batch-1');
    cleanup();
    const second = await open(ok());
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    await settle();
    expect(second.ports.apply).not.toHaveBeenCalled();
    expect(second.ports.cancel).toHaveBeenCalledWith('batch-1');
  });
});
