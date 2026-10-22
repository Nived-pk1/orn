// @vitest-environment jsdom
/**
 * Dialog in jsdom. jsdom implements neither `showModal()` nor `close()` of HTMLDialogElement (and has no top layer, inert background
 * or focus containment), so the test stubs the two methods below with the documented behaviour: `open` attribute set and removed,
 * a `close` event on closing. What the browser does itself - the focus trap, the inert background, the real Esc key, no CSP
 * violation - is proved by the e2e (tests/e2e/shell.spec.ts) and by the CSP spike (docs/PROGRESS.md, step 5.2).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Dialog } from './dialog';
import { openLayers } from './layers';

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
afterEach(cleanup);

function Harness(props: { readonly backdrop?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open it</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Import summary" dismissOnBackdrop={props.backdrop === true} footer={<button type="button" onClick={() => setOpen(false)}>Done</button>}>
        <p>Three records.</p>
      </Dialog>
    </>
  );
}

const cancel = (target: Element): void => {
  fireEvent(target, new Event('cancel', { cancelable: true, bubbles: false }));
};

describe('Dialog', () => {
  it('is hidden until opened; open it is a dialog named by its title with its body and footer', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    const dialog = screen.getByRole('dialog', { name: 'Import summary' });
    expect(within(dialog).getByText('Three records.')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('closes from the footer button and the Close button, and focus returns to the control that opened it', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);

    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('focus returns to the clicked control even when the browser did not focus it (WebKit does not focus a clicked button)', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    expect(document.activeElement).not.toBe(opener);
    fireEvent.click(opener); // a click that did not focus the button
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }));
    expect(document.activeElement).toBe(opener);
  });

  it('Esc (the dialog\'s cancel event) asks to close, and the browser\'s own close is always cancelled', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    const dialog = screen.getByRole('dialog');
    const event = new Event('cancel', { cancelable: true });
    fireEvent(dialog, event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closable={false}: no Close button, Esc is cancelled and asks nothing, the backdrop does nothing (step 5.11c)', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Importing" dismissOnBackdrop closable={false}>
        <p>Working.</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Importing' });
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();
    const event = new Event('cancel', { cancelable: true });
    fireEvent(dialog, event);
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a null footer draws no footer band; a footer draws one (step 5.11c)', () => {
    const { rerender } = render(
      <Dialog open onClose={vi.fn()} title="T" footer={null}>
        <p>x</p>
      </Dialog>,
    );
    expect(document.querySelector('footer')).toBeNull();
    rerender(
      <Dialog open onClose={vi.fn()} title="T" footer={<button type="button">Go</button>}>
        <p>x</p>
      </Dialog>,
    );
    expect(document.querySelector('footer')).not.toBeNull();
  });

  it('Esc closes the topmost layer only: with two dialogs open, the first Esc closes the upper one', () => {
    function Two() {
      const [a, setA] = useState(true);
      const [b, setB] = useState(true);
      return (
        <>
          <Dialog open={a} onClose={() => setA(false)} title="Lower"><p>lower body</p></Dialog>
          <Dialog open={b} onClose={() => setB(false)} title="Upper"><p>upper body</p></Dialog>
        </>
      );
    }
    render(<Two />);
    expect(openLayers()).toBe(2);
    cancel(screen.getByRole('dialog', { name: 'Lower' }));
    expect(screen.getByRole('dialog', { name: 'Lower' })).toBeTruthy(); // not on top: it ignores Esc
    expect(screen.getByRole('dialog', { name: 'Upper' })).toBeTruthy();
    cancel(screen.getByRole('dialog', { name: 'Upper' }));
    expect(screen.queryByRole('dialog', { name: 'Upper' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Lower' })).toBeTruthy();
    cancel(screen.getByRole('dialog', { name: 'Lower' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(openLayers()).toBe(0);
  });

  it('a click on the backdrop closes only when dismissOnBackdrop is set; a click inside never does', () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    unmount();

    render(<Harness backdrop />);
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Three records.'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('unmounting an open dialog releases its layer', () => {
    const { unmount } = render(<Dialog open onClose={vi.fn()} title="T"><p>x</p></Dialog>);
    expect(openLayers()).toBe(1);
    unmount();
    expect(openLayers()).toBe(0);
  });
});

describe('Dialog inert (step 6.7a: a nested editor is open over this one)', () => {
  it('inert makes the dialog unreachable and is removed again with it', () => {
    const { rerender } = render(<Dialog open onClose={() => undefined} title="Under">body</Dialog>);
    expect(screen.getByRole('dialog', { name: 'Under', hidden: true }).hasAttribute('inert')).toBe(false);
    rerender(<Dialog open onClose={() => undefined} title="Under" inert>body</Dialog>);
    expect(screen.getByRole('dialog', { name: 'Under', hidden: true }).hasAttribute('inert')).toBe(true);
    rerender(<Dialog open onClose={() => undefined} title="Under" inert={false}>body</Dialog>);
    expect(screen.getByRole('dialog', { name: 'Under', hidden: true }).hasAttribute('inert')).toBe(false);
  });
});
