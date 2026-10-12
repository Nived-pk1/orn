// @vitest-environment jsdom
/** The export screen in roles and names (step 5.9b): each choice with its sentence, a safe editable name, run, cancel, the result and its gaps. */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createExportModel, type ExportModel } from './index';
import { ExportScreen } from './export-screen';
import { fakePorts, OK_RESULT, type FakePorts } from '@/test-support/export-ports';
import { FORMATS, IMAGES, SCOPES } from './export-words';

afterEach(cleanup);
beforeAll(() => {
  const proto = HTMLDialogElement.prototype as { showModal?: () => void; close?: () => void };
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

function show(ports: FakePorts = fakePorts()): { readonly model: ExportModel; readonly ports: FakePorts } {
  const model = createExportModel(ports);
  render(<ExportScreen model={model} />);
  act(() => model.open());
  return { model, ports };
}
const dialog = () => screen.getByRole('dialog', { name: 'Export your data' });
const settle = (): Promise<void> => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe('the options', () => {
  it('shows the format, scope and image choices as radio groups, each choice with its sentence', () => {
    show();
    for (const [legend, choices] of [['File format', FORMATS], ['What to include', SCOPES], ['Images', IMAGES]] as const) {
      const group = within(dialog()).getByRole('group', { name: legend });
      for (const choice of choices) {
        const radio = within(group).getByRole('radio', { name: new RegExp(choice.label.replace(/[()]/g, '\\$&')) });
        expect(radio).toBeTruthy();
        expect(group.textContent).toContain(choice.text);
      }
    }
  });

  it('each scope sentence names what it holds, in words', () => {
    show();
    const group = within(dialog()).getByRole('group', { name: 'What to include' });
    expect(group.textContent).toContain('the syllabus (exams and topics)');
    expect(group.textContent).toContain('No syllabus and no display settings.');
    expect(group.textContent).toContain('so the file imports cleanly');
    expect(group.textContent).toContain('the family layout, the reaction schemes and the saved views');
  });

  it('starts with Everything, one file, no images, and the name from the title and the date', () => {
    show();
    expect((within(dialog()).getByRole('radio', { name: /Everything/ }) as HTMLInputElement).checked).toBe(true);
    expect((within(dialog()).getByRole('radio', { name: /One file/ }) as HTMLInputElement).checked).toBe(true);
    expect((within(dialog()).getByRole('radio', { name: /No images/ }) as HTMLInputElement).checked).toBe(true);
    expect((within(dialog()).getByRole('textbox', { name: 'File name' }) as HTMLInputElement).value).toBe('Organic-Reaction-Navigator-demo-2026-10-12');
    expect(dialog().textContent).toContain('Organic-Reaction-Navigator-demo-2026-10-12.orn.json');
  });

  it('the file name is in the fixed bottom bar, after the options and before Cancel and Export', () => {
    show();
    const name = within(dialog()).getByRole('textbox', { name: 'File name' });
    const footer = dialog().querySelector('footer');
    expect(footer?.contains(name)).toBe(true);
    const order = Array.from(dialog().querySelectorAll('input[type="radio"], input[type="text"], button'));
    const last = (el: Element) => order.indexOf(el);
    const cancel = within(dialog()).getByRole('button', { name: 'Cancel' });
    const exportButton = within(dialog()).getByRole('button', { name: /^Export$/ });
    const lastRadio = Array.from(dialog().querySelectorAll('input[type="radio"]')).pop() as Element;
    expect(last(lastRadio)).toBeLessThan(last(name));
    expect(last(name)).toBeLessThan(last(cancel));
    expect(last(cancel)).toBeLessThan(last(exportButton));
  });

  it('an image choice that does not fit the format is disabled and says why; the image sizes are stated when known', () => {
    show(fakePorts({ images: { count: 3, bytes: 5 * 1024 * 1024 } }));
    expect((within(dialog()).getByRole('radio', { name: /In the package/ }) as HTMLInputElement).disabled).toBe(true);
    expect(dialog().textContent).toContain('This dataset holds 3 images, 5 MB in all.');
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Package/ }));
    expect((within(dialog()).getByRole('radio', { name: /Inside the file/ }) as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog()).getByRole('radio', { name: /In the package/ }) as HTMLInputElement).disabled).toBe(false);
  });

  it('a hostile dataset title gives a safe name that is shown before the export runs', () => {
    show(fakePorts({ title: '../../<script>alert(1)</script> CON' }));
    const name = (within(dialog()).getByRole('textbox', { name: 'File name' }) as HTMLInputElement).value;
    expect(name).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
    expect(name).not.toMatch(/[<>/\\]/);
    expect(dialog().textContent).toContain(`${name}.orn.json`);
  });

  it('a typed name is made safe in the shown result', () => {
    show();
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'File name' }), { target: { value: 'a/b\\c:d' } });
    expect(dialog().textContent).toContain('a-b-c-d.orn.json');
  });

  it('Export says why it cannot start when another operation runs', () => {
    const ports = fakePorts();
    ports.blocked = 'another operation is running';
    show(ports);
    const button = within(dialog()).getByRole('button', { name: 'Export' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(ports.run).not.toHaveBeenCalled();
  });
});

describe('running, cancel and the result', () => {
  it('runs with the chosen scope, shows progress in words and then what was written', async () => {
    const { ports } = show();
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Chemistry only/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Export' }));
    expect(ports.run.mock.calls[0]?.[0]).toMatchObject({ scope: 'chemistry' });
    const running = screen.getByRole('dialog', { name: 'Exporting' });
    act(() => ports.lastFlow().onProgress?.(2, 4, 'asset ast_x'));
    expect(within(running).getByRole('status').textContent).toContain('Adding image 2 of 3');
    act(() => ports.finish({ ok: true, result: { ...OK_RESULT, missingAssets: [{ assetId: 'ast_one' as never, sha256: 'a'.repeat(64), reason: 'no_bytes' }] }, inProcess: false }));
    await settle();
    const done = screen.getByRole('dialog', { name: 'Export finished' });
    expect(done.textContent).toContain('Saved Organic-Reaction-Navigator-demo-2026-10-12.orn.json');
    expect(done.textContent).toContain('It holds 5 records: 3 species, 2 reactions.');
    expect(within(done).getByRole('region', { name: 'Images without their picture' }).textContent).toContain('benzene.png');
    expect(done.textContent).toContain('Some things are missing from it');
    expect(ports.save).toHaveBeenCalledTimes(1);
  });

  it('a clean result says nothing is missing', async () => {
    const { ports } = show();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Export' }));
    act(() => ports.finish({ ok: true, result: OK_RESULT, inProcess: false }));
    await settle();
    expect(screen.getByRole('dialog', { name: 'Export finished' }).textContent).toContain('Nothing is missing from it.');
  });

  it('Cancel gives no file and says so', async () => {
    const { ports } = show();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Export' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Exporting' })).getByRole('button', { name: 'Cancel' }));
    const cancelled = screen.getByRole('dialog', { name: 'Export cancelled' });
    expect(cancelled.textContent).toContain('Cancelled. No file was made and nothing was changed.');
    act(() => ports.finish({ ok: false, code: 'CANCELLED', message: 'cancelled' }));
    await settle();
    expect(ports.save).not.toHaveBeenCalled();
  });

  it('a worker that is down offers the page path as a button; pressing it runs it on the page', async () => {
    const { ports } = show();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Export' }));
    act(() => ports.finish({ ok: false, code: 'WORKER_DOWN', message: 'no compute worker', inProcessAvailable: true }));
    await settle();
    const refused = screen.getByRole('dialog', { name: 'The data was not exported' });
    expect(within(refused).getByRole('alert').textContent).toContain('built on this page instead');
    expect(ports.save).not.toHaveBeenCalled();
    fireEvent.click(within(refused).getByRole('button', { name: 'Build it on this page' }));
    expect(ports.lastFlow().inProcess).toBe(true);
  });

  it('Esc/close while running cancels; Close after the result closes the dialog', async () => {
    const { model, ports } = show();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Export' }));
    act(() => ports.finish({ ok: true, result: OK_RESULT, inProcess: false }));
    await settle();
    const buttons = within(screen.getByRole('dialog', { name: 'Export finished' })).getAllByRole('button', { name: 'Close' });
    fireEvent.click(buttons[buttons.length - 1] as HTMLElement);
    expect(model.store.getState().phase).toBe('closed');
  });
});
