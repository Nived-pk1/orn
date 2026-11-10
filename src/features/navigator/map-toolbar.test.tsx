// @vitest-environment jsdom
/** The map's floating controls (step 8.4e, A1): the bar, the zoom stack and the key strip inside one toolbar; a narrow map moves From A to B into More; Key opens the legend. */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapToolbar, type MapToolbarProps } from "./map-toolbar";

const base: MapToolbarProps = {
  listing: false,
  noScene: false,
  onToggleList: () => undefined,
  onZoomIn: () => undefined,
  onZoomOut: () => undefined,
  onFit: () => undefined,
  chapters: [{ id: "c1", title: "Alcohols and phenols" }],
  chapterId: null,
  onChapter: () => undefined,
  families: [{ id: "a", name: "Alcohols" }],
  onFind: () => undefined,
  chainOpen: false,
  onToggleChain: () => undefined,
  openReason: "select a family first",
  onOpenFamily: () => undefined,
  keyOpen: false,
  onToggleKey: () => undefined,
  keyPopover: (
    <div role="dialog" aria-label="Key">
      the key
    </div>
  ),
  scene: null,
  selected: null,
  multi: false,
  onClear: () => undefined,
  onZoomSelection: undefined,
  hint: "Tap or click a family to see what it makes and what it is made from.",
  hintKind: "quiet",
  keys: {
    lines: true,
    chip: true,
    pair: false,
    within: false,
    unclassified: undefined,
  },
};

let width = 5000;
class FakeObserver {
  constructor(private readonly run: (entries: unknown[]) => void) {}
  observe(): void {
    this.run([]);
  }
  disconnect(): void {}
}
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeObserver);
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 40,
      width,
      height: 40,
      toJSON: () => ({}),
    };
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  width = 5000;
});

describe("MapToolbar", () => {
  it("floats in three groups of one toolbar: the bar (chapter, Find, From A to B, More), the zoom stack, the key strip", () => {
    render(<MapToolbar {...base} />);
    expect(
      screen.getAllByRole("toolbar", { name: "Canvas tools" }),
    ).toHaveLength(1);
    const bars = [
      ...document.querySelectorAll('[data-map-control="bar"]'),
    ] as HTMLElement[];
    const bar = within(bars[0] as HTMLElement);
    expect(bar.getByRole("combobox", { name: "Chapter" })).toBeTruthy();
    expect(
      bar
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual(["Find a family", "From A to B", "More"]);
    const stack = within(
      document.querySelector('[data-map-control="stack"]') as HTMLElement,
    );
    expect(
      stack.getAllByRole("button").map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Zoom in", "Zoom out", "Fit"]);
    expect(
      within(
        document.querySelector("[data-key-wrap]") as HTMLElement,
      ).getByRole("button", { name: /Key/ }),
    ).toBeTruthy();
  });
  it("with nothing selected the hint shows and there is no Open family button", () => {
    render(<MapToolbar {...base} />);
    expect(document.querySelector("[data-map-quiet]")?.textContent).toMatch(
      /^Tap or click a family/,
    );
    expect(screen.queryByRole("button", { name: "Open family" })).toBeNull();
  });
  it("Find a family is an icon that opens its box in the bar", async () => {
    render(<MapToolbar {...base} />);
    expect(
      screen.queryByRole("combobox", { name: "Find a family" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Find a family" }));
    expect(
      await screen.findByRole("combobox", { name: "Find a family" }),
    ).toBeTruthy();
  });
  it("the icon buttons have names (and so tooltips)", () => {
    render(<MapToolbar {...base} />);
    for (const name of ["Zoom out", "Zoom in", "Fit", "Find a family"])
      expect(screen.getByRole("button", { name })).toBeTruthy();
  });
  it("a narrow map moves From A to B into More", async () => {
    width = 500;
    render(<MapToolbar {...base} />);
    expect(screen.queryByRole("button", { name: "From A to B" })).toBeNull();
    fireEvent.pointerDown(screen.getByRole("button", { name: "More" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      await screen.findByRole("menuitem", { name: "From A to B" }),
    ).toBeTruthy();
  });
  it("More holds List (and in Studio the Unanchored reactions)", async () => {
    render(
      <MapToolbar
        {...base}
        unanchored={{
          count: 2,
          expanded: false,
          reason: undefined,
          onToggle: () => undefined,
        }}
      />,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "More" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(await screen.findByRole("menuitem", { name: "List" })).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Unanchored reactions (2)" }),
    ).toBeTruthy();
  });
  it("Key reports a click and shows the popover while open", () => {
    const onToggleKey = vi.fn();
    const { rerender } = render(
      <MapToolbar {...base} onToggleKey={onToggleKey} />,
    );
    expect(screen.queryByRole("dialog", { name: "Key" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Key/ }));
    expect(onToggleKey).toHaveBeenCalledTimes(1);
    rerender(<MapToolbar {...base} keyOpen onToggleKey={onToggleKey} />);
    expect(screen.getByRole("dialog", { name: "Key" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Key/ }).getAttribute("aria-expanded"),
    ).toBe("true");
  });
  it("the zoom buttons say why they are off in the List view", () => {
    render(<MapToolbar {...base} listing />);
    expect(
      screen
        .getByRole("button", { name: "Zoom in" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });
});
