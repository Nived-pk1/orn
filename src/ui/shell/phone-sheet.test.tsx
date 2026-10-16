// @vitest-environment jsdom
/**
 * The phone inspector sheet (ADR-039): closed / peek / full, the handle, the swipe, Close, Escape, focus in and back, the label.
 * The CSS (35% height, what is hidden at peek) is proved by the e2e on a real phone viewport.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { heightAfterSwipe, PhoneSheet, SHEET_TITLE_ID, SWIPE_PX } from './phone-sheet';

afterEach(cleanup);

function Harness(props: { readonly named?: boolean }) {
  const [request, setRequest] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setRequest((n) => n + 1)}>
        tapped item
      </button>
      <PhoneSheet title="Inspector" openRequest={request}>
        {props.named === false ? <p>nothing selected</p> : <h3 id={SHEET_TITLE_ID}>Ethanol</h3>}
        <button type="button">Open family</button>
        <div data-sheet-full="">the whole record</div>
      </PhoneSheet>
    </>
  );
}

const sheet = (): HTMLElement => document.querySelector('aside') as HTMLElement;
const open = (): void => {
  const opener = screen.getByRole('button', { name: 'tapped item' });
  opener.focus();
  fireEvent.click(opener);
};
const swipe = (from: number, to: number): void => {
  const head = screen.getByRole('button', { name: /Show the whole record|Show less/ }).parentElement as HTMLElement;
  fireEvent.pointerDown(head, { clientY: from, pointerId: 1 });
  fireEvent.pointerUp(head, { clientY: to, pointerId: 1 });
};

describe('heightAfterSwipe', () => {
  it('up goes closed-less: peek to full, and full stays full', () => {
    expect(heightAfterSwipe('peek', -SWIPE_PX)).toBe('full');
    expect(heightAfterSwipe('full', -200)).toBe('full');
  });
  it('down goes full to peek and peek to closed', () => {
    expect(heightAfterSwipe('full', SWIPE_PX)).toBe('peek');
    expect(heightAfterSwipe('peek', 200)).toBe('closed');
  });
  it('a small move is not a swipe', () => {
    expect(heightAfterSwipe('peek', SWIPE_PX - 1)).toBe('peek');
    expect(heightAfterSwipe('peek', 1 - SWIPE_PX)).toBe('peek');
  });
});

describe('PhoneSheet', () => {
  it('is closed until something asks for it, then opens at peek', () => {
    render(<Harness />);
    expect(sheet().hidden).toBe(true);
    expect(sheet().getAttribute('data-sheet')).toBe('closed');
    open();
    expect(sheet().hidden).toBe(false);
    expect(sheet().getAttribute('data-sheet')).toBe('peek');
  });

  it('is a non-modal region labelled by the record name (the title as a fallback)', () => {
    render(<Harness />);
    open();
    expect(screen.getByRole('complementary', { name: 'Ethanol' })).toBe(sheet());
    expect(sheet().getAttribute('aria-modal')).toBeNull();
    cleanup();
    render(<Harness named={false} />);
    open();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBe(sheet());
  });

  it('moves the focus into the sheet when it opens and back to the tapped item when it closes', () => {
    render(<Harness />);
    open();
    expect(document.activeElement).toBe(sheet());
    fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
    expect(sheet().hidden).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'tapped item' }));
  });

  it('closes on Escape', () => {
    render(<Harness />);
    open();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open family' }), { key: 'Escape' });
    expect(sheet().getAttribute('data-sheet')).toBe('closed');
  });

  it('the drag handle (a button) switches between peek and full', () => {
    render(<Harness />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Show the whole record' }));
    expect(sheet().getAttribute('data-sheet')).toBe('full');
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(sheet().getAttribute('data-sheet')).toBe('peek');
  });

  it('a swipe up opens it fully, a swipe down closes it by steps', () => {
    render(<Harness />);
    open();
    swipe(500, 300);
    expect(sheet().getAttribute('data-sheet')).toBe('full');
    swipe(300, 500);
    expect(sheet().getAttribute('data-sheet')).toBe('peek');
    swipe(300, 500);
    expect(sheet().getAttribute('data-sheet')).toBe('closed');
  });

  it('a swipe that ends on the handle does not also toggle it', () => {
    render(<Harness />);
    open();
    swipe(500, 300);
    fireEvent.click(screen.getByRole('button', { name: 'Show less' })); // the click a real browser sends after the swipe's pointer-up
    expect(sheet().getAttribute('data-sheet')).toBe('full');
  });

  it('a second request keeps the height it has (a tap while the sheet is full does not shrink it)', () => {
    render(<Harness />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Show the whole record' }));
    fireEvent.click(screen.getByRole('button', { name: 'tapped item' }));
    expect(sheet().getAttribute('data-sheet')).toBe('full');
  });
});

describe('PhoneSheet: a request to close', () => {
  function Closing() {
    const [open, setOpen] = useState(0);
    const [close, setClose] = useState(0);
    return (
      <>
        <button type="button" onClick={() => setOpen((n) => n + 1)}>
          open it
        </button>
        <button type="button" onClick={() => setClose((n) => n + 1)}>
          close it
        </button>
        <PhoneSheet title="Inspector" openRequest={open} closeRequest={close}>
          <p>content</p>
        </PhoneSheet>
      </>
    );
  }

  it('closes an open sheet when the close request goes up, and a closed one stays closed', () => {
    render(<Closing />);
    fireEvent.click(screen.getByRole('button', { name: 'close it' }));
    expect(sheet().hidden).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'open it' }));
    expect(sheet().getAttribute('data-sheet')).toBe('peek');
    fireEvent.click(screen.getByRole('button', { name: 'close it' }));
    expect(sheet().hidden).toBe(true);
  });
});

describe('PhoneSheet: the title, and the room it takes (phone mode B, part 2)', () => {
  it("a tap on the record's name toggles peek and full, like the handle", () => {
    render(<Harness />);
    open();
    fireEvent.click(screen.getByRole('heading', { name: 'Ethanol' }));
    expect(sheet().getAttribute('data-sheet')).toBe('full');
    fireEvent.click(screen.getByRole('heading', { name: 'Ethanol' }));
    expect(sheet().getAttribute('data-sheet')).toBe('peek');
    fireEvent.click(screen.getByRole('button', { name: 'Show the whole record' }));
    expect(sheet().getAttribute('data-sheet')).toBe('full');
  });

  it('a tap elsewhere in the body changes nothing', () => {
    render(<Harness />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Open family' }));
    expect(sheet().getAttribute('data-sheet')).toBe('peek');
  });

  it('reports its height at peek (the page keeps that room), 0 when closed or full', () => {
    const spaces: number[] = [];
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 390, bottom: 295, width: 390, height: 295, toJSON: () => ({}) });
    try {
      function Spaced() {
        const [request, setRequest] = useState(0);
        return (
          <>
            <button type="button" onClick={() => setRequest((n) => n + 1)}>
              tapped item
            </button>
            <PhoneSheet title="Inspector" openRequest={request} onSpace={(px) => spaces.push(px)}>
              <h3 id={SHEET_TITLE_ID}>Ethanol</h3>
            </PhoneSheet>
          </>
        );
      }
      render(<Spaced />);
      expect(spaces.at(-1)).toBe(0);
      open();
      expect(spaces.at(-1)).toBe(295);
      fireEvent.click(screen.getByRole('button', { name: 'Show the whole record' }));
      expect(spaces.at(-1)).toBe(0);
      fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
      expect(spaces.at(-1)).toBe(295);
      fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
      expect(spaces.at(-1)).toBe(0);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });
});
