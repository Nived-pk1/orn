// @vitest-environment jsdom
/**
 * The exam and exam version editors through the real window (exams step part 2, X1, X2, X5): a NEW exam "Test board exam" and a version
 * whose coverage includes one demo topic are made from the Workbench; after Save the exam scope selector lists the version and choosing it
 * scopes the demo records exactly as it does for a demo version (the same derived scope; no code names an exam).
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createScopeOf } from '@/core/graph/scope';
import { indexEngine } from '@/core/indexes';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog } from '@/test-support/window-kit';

beforeAll(async () => {
  await import('@/features/workbench/layer');
  await import('./editor-session');
  stubDialog();
  fakeLayout();
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  const proto = Element.prototype as unknown as { scrollIntoView?: () => void; hasPointerCapture?: () => boolean; releasePointerCapture?: () => void };
  proto.scrollIntoView ??= () => undefined;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
});
afterEach(cleanup);

const openWorkbench = (): void => {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: /Workbench/ }));
};

describe('a new exam and version made in the Workbench', () => {
  it('appear in the exam scope selector at once, and choosing the version scopes the demo records like a demo version does', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    openWorkbench();

    fireEvent.click(screen.getByRole('button', { name: 'New exam' }));
    const exam = await screen.findByRole('dialog', { name: 'New exam' });
    fireEvent.change(within(exam).getByLabelText('Name (required)'), { target: { value: 'Test board exam' } });
    await act(async () => void fireEvent.click(within(exam).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(Object.values(app.store.getState().records.exam).some((e) => e.name === 'Test board exam')).toBe(true));
    const examId = Object.values(app.store.getState().records.exam).find((e) => e.name === 'Test board exam')?.id as string;

    // a demo topic that a demo reaction is mapped to and that the demo JEE Main version covers as "included"
    const state = app.store.getState();
    const main = state.records.exam_version['exv_jee-main-2026' as never];
    const covered = new Set((main?.units ?? []).flatMap((u) => u.topicCoverage.filter((c) => c.coverage === 'included').map((c) => c.topicId as string)));
    const mapping = Object.values(state.records.topic_mapping).find((m) => m.target.kind === 'reaction' && covered.has(m.topicId));
    if (mapping === undefined) throw new Error('the demo has no reaction mapping on a topic the demo version includes');

    fireEvent.click(await screen.findByRole('button', { name: 'New exam version' }));
    const version = await screen.findByRole('dialog', { name: 'New exam version' });
    fireEvent.change(within(version).getByLabelText('Exam'), { target: { value: examId } });
    fireEvent.change(within(version).getByLabelText('Label (required)'), { target: { value: 'Test board exam 2027' } });
    fireEvent.change(within(version).getByLabelText('Status'), { target: { value: 'draft' } });
    fireEvent.click(within(version).getByRole('button', { name: 'Add a unit' }));
    fireEvent.change(within(version).getByLabelText('Unit title (required)'), { target: { value: 'One unit' } });
    fireEvent.click(within(version).getByRole('button', { name: 'Add a topic' }));
    fireEvent.change(within(version).getByLabelText('Topic of row 1'), { target: { value: mapping.topicId } });
    fireEvent.change(within(version).getByLabelText('Coverage of row 1'), { target: { value: 'included' } });
    await act(async () => void fireEvent.click(within(version).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(Object.values(app.store.getState().records.exam_version).some((v) => v.label === 'Test board exam 2027')).toBe(true));
    const versionId = Object.values(app.store.getState().records.exam_version).find((v) => v.label === 'Test board exam 2027')?.id as string;

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: /Navigator/ }));
    const selector = (await screen.findByRole('combobox', { name: /Exam scope/ })) as HTMLSelectElement;
    expect([...selector.options].map((o) => o.textContent)).toContain('Test board exam, draft, not verified');
    fireEvent.change(selector, { target: { value: versionId } });
    expect(app.navigator.ui.exam.getState().active).toEqual({ examId, examVersionId: versionId });

    const scopeIn = (e: string, v: string) => createScopeOf(indexEngine.build(app.store.getState()), e as never, v as never)(mapping.target as never);
    expect(scopeIn(examId, versionId)).toBe(scopeIn('exm_jee-main', 'exv_jee-main-2026'));
    expect(scopeIn(examId, versionId)).not.toBe('outside');
    // a record that no topic of the new version covers is outside it, as for the demo versions
    const other = Object.values(state.records.topic_mapping).find((m) => m.target.kind === 'reaction' && m.topicId !== mapping.topicId && !Object.values(state.records.topic_mapping).some((x) => x.target.id === m.target.id && x.topicId === mapping.topicId));
    if (other !== undefined) expect(createScopeOf(indexEngine.build(app.store.getState()), examId as never, versionId as never)(other.target as never)).toBe('outside');
  });
});
