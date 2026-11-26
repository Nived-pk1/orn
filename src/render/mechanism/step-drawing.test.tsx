// @vitest-environment jsdom
/**
 * Step 8.5 M4 at component level (ADR-038 D4-D6): a step is drawn as before -> after with its curved arrows, in words when it cannot be
 * drawn, as a picture with a text alternative, scaled in its own box, stacked for a phone, the equilibrium arrow for a reversible step, a
 * transition state in brackets. The structure tool is a scripted fake; the geometry has its own tests.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StructureRep } from '@/core/schema';
import type { DrawableStep, StepDrawingAnswer, StepDrawingPort } from './contracts';
import { NO_DRAWING_WORDS, NO_MOVEMENTS_WORDS } from './step-model';
import { StepDrawing } from './step-drawing';

afterEach(cleanup);

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const tool = (maps: Record<string, readonly number[]>, fail?: StepDrawingAnswer): { port: StepDrawingPort; revoked: string[]; retry: ReturnType<typeof vi.fn> } => {
  const revoked: string[] = [];
  const retry = vi.fn();
  let n = 0;
  const port: StepDrawingPort = {
    depict: async (structure) =>
      fail ?? { ok: true, svg: '<svg/>', width: 100, height: 70, atoms: (maps[structure.value] ?? []).map((map, i) => ({ map, x: 20 + 30 * i, y: 35, rx: 9, ry: 9 })), bonds: [] },
    createUrl: () => `blob:${(n += 1)}`,
    revokeUrl: (url) => void revoked.push(url),
    retry,
  };
  return { port, revoked, retry };
};
const MAPS = { '[OH-:1]': [1], '[H:2]C': [2, 3], '[H:2][OH:1]': [1, 2] };
const step = (over: Partial<DrawableStep> = {}): DrawableStep => ({
  number: 2,
  reversible: false,
  species: [{ role: 'reagent', structure: smiles('[OH-:1]') }, { role: 'reactant', structure: smiles('[H:2]C') }, { role: 'product', structure: smiles('[H:2][OH:1]') }],
  electronMovements: [
    { from: { kind: 'lone_pair', atom: 1 }, to: { kind: 'bond', atoms: [1, 2] }, electrons: 2 },
    { from: { kind: 'bond', atoms: [2, 3] }, to: { kind: 'atom', atom: 3 }, electrons: 1 },
  ],
  ...over,
});
const drawing = async () => screen.findByRole('img', { name: 'Drawing of step 2; the details are below.' });

describe('a drawn step', () => {
  it('is a picture with the text alternative "Drawing of step n; the details are below."', async () => {
    const { port } = tool(MAPS);
    render(<StepDrawing step={step()} port={port} orientation="row" />);
    const img = await drawing();
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('shows one image per structure (object URLs through the port, never markup), the plus sign, one curved arrow per movement and the dots', async () => {
    const { port } = tool(MAPS);
    const { container } = render(<StepDrawing step={step()} port={port} orientation="row" />);
    await drawing();
    expect(container.querySelectorAll('image').length).toBe(3);
    expect([...container.querySelectorAll('image')].every((i) => (i.getAttribute('href') ?? '').startsWith('blob:'))).toBe(true);
    expect(container.querySelectorAll('[data-arrow]').length).toBe(2);
    expect(container.querySelectorAll('[data-arrow-head="full"]').length).toBe(1);
    expect(container.querySelectorAll('[data-arrow-head="half"]').length).toBe(1);
    expect(container.querySelectorAll('[data-dot]').length).toBe(2);
    expect(container.querySelectorAll('[data-plus]').length).toBe(1);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
  });

  it('a step with no electron movements is drawn without curved arrows and says so in the quiet line', async () => {
    const { port } = tool(MAPS);
    const { container } = render(<StepDrawing step={step({ electronMovements: [] })} port={port} orientation="row" />);
    await drawing();
    expect(container.querySelectorAll('[data-arrow]').length).toBe(0);
    expect(screen.getByText(NO_MOVEMENTS_WORDS)).toBeTruthy();
  });

  it('a step with movements has no "no movements" line', async () => {
    const { port } = tool(MAPS);
    render(<StepDrawing step={step()} port={port} orientation="row" />);
    await drawing();
    expect(screen.queryByText(NO_MOVEMENTS_WORDS)).toBeNull();
  });

  it('the reaction arrow is a single arrow, or the equilibrium arrow when the step is reversible', async () => {
    const a = tool(MAPS);
    const first = render(<StepDrawing step={step()} port={a.port} orientation="row" />);
    await drawing();
    expect(first.container.querySelector('[data-reaction-arrow="forward"]')).not.toBeNull();
    first.unmount();
    const b = tool(MAPS);
    const second = render(<StepDrawing step={step({ reversible: true })} port={b.port} orientation="row" />);
    await drawing();
    expect(second.container.querySelector('[data-reaction-arrow="equilibrium"]')).not.toBeNull();
  });

  it('a transition state is in square brackets with the double dagger', async () => {
    const { port } = tool({ '[H:2]C': [2, 3] });
    const { container } = render(<StepDrawing step={step({ species: [{ role: 'transition_state', structure: smiles('[H:2]C') }], electronMovements: [{ from: { kind: 'bond', atoms: [2, 3] }, to: { kind: 'atom', atom: 3 }, electrons: 2 }] })} port={port} orientation="row" />);
    await drawing();
    expect(container.querySelectorAll('[data-bracket]').length).toBe(1);
    expect(container.textContent).toContain('‡');
  });

  it('a phone stacks the sides (before above, a down arrow, after below)', async () => {
    const { port } = tool(MAPS);
    const { container } = render(<StepDrawing step={step()} port={port} orientation="column" />);
    await drawing();
    expect(container.querySelector('[data-orientation="column"]')).not.toBeNull();
    const svg = container.querySelector('svg');
    const [, , w, h] = (svg?.getAttribute('viewBox') ?? '0 0 1 1').split(' ').map(Number);
    expect((h as number) > (w as number) * 0.6).toBe(true);
  });

  it('one size rule (8.5d): the standard bond length when there is room, down to the floor of 85 %, 44 px (8.5g), then scrolls sideways inside its own box', async () => {
    const { port } = tool(MAPS);
    const { container } = render(<StepDrawing step={step()} port={port} orientation="row" />);
    await drawing();
    const svg = container.querySelector('svg') as SVGSVGElement;
    const natural = Number((svg.getAttribute('viewBox') ?? '').split(' ')[2]);
    const widest = Math.round((natural * 44) / 54);
    expect(svg.style.maxWidth).toBe(`${widest}px`);
    expect(svg.style.minWidth).toBe(`${Math.round(widest * 0.85)}px`);
    expect(svg.getAttribute('data-bond-px')).toBe('44');
    expect(container.querySelector('[data-drawing-scroll]')).not.toBeNull();
  });

  it('revokes its object URLs when it goes away', async () => {
    const { port, revoked } = tool(MAPS);
    const view = render(<StepDrawing step={step()} port={port} orientation="row" />);
    await drawing();
    view.unmount();
    expect(revoked.length).toBe(3);
  });
});

describe('a step that cannot be drawn says so in words (never a blank box)', () => {
  it('no atom-mapped structures', async () => {
    const { port } = tool({});
    render(<StepDrawing step={step()} port={port} orientation="row" />);
    expect(await screen.findByText(NO_DRAWING_WORDS.noMaps)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('a movement names an atom no structure holds (nothing partial is drawn)', async () => {
    const { port } = tool({ '[OH-:1]': [1], '[H:2]C': [2], '[H:2][OH:1]': [1, 2] });
    const { container } = render(<StepDrawing step={step()} port={port} orientation="row" />);
    expect(await screen.findByText(NO_DRAWING_WORDS.missingAtoms)).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('the structure tool did not load: the words and a Retry that asks the app to load it again', async () => {
    const { port, retry } = tool({}, { ok: false, reason: 'unavailable', message: 'not loaded' });
    render(<StepDrawing step={step()} port={port} orientation="row" />);
    expect(await screen.findByText(NO_DRAWING_WORDS.engine)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('while it loads it says "Drawing step n" instead of showing nothing, and tells its parent each status', async () => {
    const { port } = tool(MAPS);
    const seen: string[] = [];
    render(<StepDrawing step={step()} port={port} orientation="row" onStatus={(s) => seen.push(s)} />);
    expect(screen.getByText('Drawing step 2…')).toBeTruthy();
    await drawing();
    await waitFor(() => expect(seen).toContain('ready'));
    expect(seen[0]).toBe('loading');
  });

  it('a long mechanism draws a step only when it is near the screen (lazy): until then it is a quiet placeholder', async () => {
    const { port } = tool(MAPS);
    let callback: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    class FakeObserver {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        callback = cb;
      }
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    try {
      render(<StepDrawing step={step()} port={port} orientation="row" lazy />);
      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.getByText('Drawing step 2…')).toBeTruthy();
      act(() => callback?.([{ isIntersecting: true }]));
      await drawing();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
