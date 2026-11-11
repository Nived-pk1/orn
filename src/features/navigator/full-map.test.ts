/**
 * Full map's browser side (step 8.4e, Part D, D3/D4): fullscreen where allowed, one history entry, Back / Esc / the browser leaving fullscreen
 * all leave, and the reverse. The mode itself is the map store's `fullMap` flag; this controller only reacts to it.
 */
import { describe, expect, it, vi } from "vitest";
import { createMapStore } from "@/ui/state/map-state";
import { createFullMap, type FullMapDeps } from "./full-map";

type Listener = (event: never) => void;

function fakes(
  options: {
    fullscreenEnabled?: boolean;
    requestRejects?: boolean;
    busy?: boolean;
  } = {},
) {
  const docListeners = new Map<string, Listener[]>();
  const winListeners = new Map<string, Listener[]>();
  const on = (map: Map<string, Listener[]>) => (type: string, fn: Listener) =>
    void map.set(type, [...(map.get(type) ?? []), fn]);
  const off = (map: Map<string, Listener[]>) => (type: string, fn: Listener) =>
    void map.set(
      type,
      (map.get(type) ?? []).filter((x) => x !== fn),
    );
  const doc = {
    fullscreenEnabled: options.fullscreenEnabled ?? true,
    fullscreenElement: null as object | null,
    documentElement: {
      requestFullscreen: vi.fn(() => {
        if (options.requestRejects === true)
          return Promise.reject(new Error("refused"));
        doc.fullscreenElement = doc.documentElement;
        return Promise.resolve();
      }),
    },
    exitFullscreen: vi.fn(() => {
      doc.fullscreenElement = null;
      return Promise.resolve();
    }),
    addEventListener: on(docListeners),
    removeEventListener: off(docListeners),
  };
  const win = {
    history: { pushState: vi.fn(), back: vi.fn() },
    addEventListener: on(winListeners),
    removeEventListener: off(winListeners),
  };
  const map = createMapStore();
  const deps: FullMapDeps = {
    map,
    doc: doc as unknown as FullMapDeps["doc"],
    win: win as unknown as FullMapDeps["win"],
    busy: () => options.busy === true,
  };
  const fire = (
    from: Map<string, Listener[]>,
    type: string,
    event: object = {},
  ) => (from.get(type) ?? []).forEach((fn) => fn(event as never));
  return {
    doc,
    win,
    map,
    deps,
    fireDoc: (t: string, e?: object) => fire(docListeners, t, e),
    fireWin: (t: string, e?: object) => fire(winListeners, t, e),
    docListeners,
    winListeners,
  };
}
const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe("entering", () => {
  it("pushes ONE history entry and asks the browser for fullscreen", async () => {
    const f = fakes();
    createFullMap(f.deps);
    f.map.getState().setFullMap(true);
    await flush();
    expect(f.win.history.pushState).toHaveBeenCalledTimes(1);
    expect(f.doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
    f.map.getState().setFullMap(true); // no change: nothing again
    expect(f.win.history.pushState).toHaveBeenCalledTimes(1);
  });
  it("without fullscreen support (iPhone Safari, or the headers block it) the in-app mode stands alone, no request, no error", async () => {
    const f = fakes({ fullscreenEnabled: false });
    createFullMap(f.deps);
    f.map.getState().setFullMap(true);
    await flush();
    expect(f.doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
    expect(f.map.getState().fullMap).toBe(true);
  });
  it("a refused request leaves the in-app mode on and raises nothing", async () => {
    const f = fakes({ requestRejects: true });
    createFullMap(f.deps);
    f.map.getState().setFullMap(true);
    await flush();
    expect(f.map.getState().fullMap).toBe(true);
  });
});

describe("leaving", () => {
  it("the flag going false (the button, a page that opens) leaves browser fullscreen and pops the entry it pushed, once", async () => {
    const f = fakes();
    createFullMap(f.deps);
    f.map.getState().setFullMap(true);
    await flush();
    f.map.getState().setFullMap(false);
    expect(f.doc.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(f.win.history.back).toHaveBeenCalledTimes(1);
    expect(f.docListeners.get("keydown")).toEqual([]);
    expect(f.winListeners.get("popstate")).toEqual([]);
  });
  it("Back (popstate) leaves full map and does NOT pop another entry", async () => {
    const f = fakes();
    createFullMap(f.deps);
    f.map.getState().setFullMap(true);
    await flush();
    f.fireWin("popstate");
    expect(f.map.getState().fullMap).toBe(false);
    expect(f.win.history.back).not.toHaveBeenCalled();
    expect(f.doc.exitFullscreen).toHaveBeenCalledTimes(1);
  });
  it("the browser leaving fullscreen (Esc, system back) leaves full map; fullscreen that never began does not", async () => {
    const f = fakes();
    createFullMap(f.deps);
    f.map.getState().setFullMap(true);
    await flush();
    f.doc.fullscreenElement = null;
    f.fireDoc("fullscreenchange");
    expect(f.map.getState().fullMap).toBe(false);
    const g = fakes({ fullscreenEnabled: false });
    createFullMap(g.deps);
    g.map.getState().setFullMap(true);
    g.fireDoc("fullscreenchange");
    expect(g.map.getState().fullMap).toBe(true);
  });
  it("Esc leaves when nothing else used it; not when it was handled, not when a layer or the chain panel was open at the key press", async () => {
    const f = fakes();
    createFullMap(f.deps);
    f.map.getState().setFullMap(true);
    await flush();
    f.fireDoc("keydown", { key: "Escape", defaultPrevented: true });
    expect(f.map.getState().fullMap).toBe(true);
    f.fireDoc("keydown", { key: "a", defaultPrevented: false });
    expect(f.map.getState().fullMap).toBe(true);
    f.fireDoc("keydown", { key: "Escape", defaultPrevented: false });
    expect(f.map.getState().fullMap).toBe(false);
    const b = fakes({ busy: true });
    createFullMap(b.deps);
    b.map.getState().setFullMap(true);
    await flush();
    b.fireDoc("keydown", { key: "Escape", defaultPrevented: false });
    expect(b.map.getState().fullMap).toBe(true);
  });
  it("dispose stops listening to the flag", () => {
    const f = fakes();
    const live = createFullMap(f.deps);
    live.dispose();
    f.map.getState().setFullMap(true);
    expect(f.win.history.pushState).not.toHaveBeenCalled();
  });
  describe("the map's screen going away (step 8.4e, D5: a LEAVES row)", () => {
    it("leaves full map when the canvas is gone, and stops watching when it leaves", async () => {
      const f = fakes();
      let gone: () => void = () => undefined;
      const stop = vi.fn();
      createFullMap({
        ...f.deps,
        watch: (onGone) => {
          gone = onGone;
          return stop;
        },
      });
      f.map.getState().setFullMap(true);
      await flush();
      gone();
      expect(f.map.getState().fullMap).toBe(false);
      expect(stop).toHaveBeenCalledTimes(1);
    });
  });
});
