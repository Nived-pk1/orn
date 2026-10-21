/**
 * Test-only setup file of the main Vitest project (reviewer decision W1, step 6.6b): every window test file (src/app/window) pays the cold
 * editor render ONCE in its own `beforeAll`, before the file's hooks and tests, so no `findBy*` wait ever sees the first render of an
 * editor in a busy worker (the cause found in studio step G4). It needs the dialog and layout stubs the window tests use, so it sets them
 * up for the warm-up and puts the originals back afterwards: a test file's own setup is unchanged. No wait is raised anywhere.
 */
import { beforeAll, expect } from 'vitest';

const IN_WINDOW_TESTS = /[\\/]src[\\/]app[\\/]window[\\/]/;

beforeAll(async () => {
  if (typeof document === 'undefined' || !IN_WINDOW_TESTS.test(expect.getState().testPath ?? '')) return;
  const element = HTMLElement.prototype;
  const dialog = HTMLDialogElement.prototype as { showModal?: () => void; close?: () => void };
  const saved = {
    offsetHeight: Object.getOwnPropertyDescriptor(element, 'offsetHeight'),
    rect: element.getBoundingClientRect,
    showModal: dialog.showModal,
    close: dialog.close,
    observer: (globalThis as { ResizeObserver?: unknown }).ResizeObserver,
    scroll: (Element.prototype as { scrollIntoView?: () => void }).scrollIntoView,
  };
  const [{ stubDialog }, { fakeLayout }, { warmEditors }, { prefetchPalette }] = await Promise.all([
    import('./window-kit'),
    import('./inspector-kit'),
    import('./editor-warmup'),
    import('@/app/window/lazy-palette'),
  ]);
  try {
    await prefetchPalette();
    await import('@/features/workbench/layer');
    await import('@/app/window/editor-session');
    stubDialog();
    fakeLayout();
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    (Element.prototype as { scrollIntoView?: () => void }).scrollIntoView ??= () => undefined;
    await warmEditors();
  } finally {
    if (saved.offsetHeight === undefined) Reflect.deleteProperty(element, 'offsetHeight');
    else Object.defineProperty(element, 'offsetHeight', saved.offsetHeight);
    element.getBoundingClientRect = saved.rect;
    dialog.showModal = saved.showModal;
    dialog.close = saved.close;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = saved.observer;
    (Element.prototype as { scrollIntoView?: () => void }).scrollIntoView = saved.scroll;
  }
}, 60_000);
