// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { hitAt, hitOf, hitRefiner } from "./hit";

const NS = "http://www.w3.org/2000/svg";

describe("hit resolution with a refiner (step 8.4e, C1)", () => {
  afterEach(() => {
    hitRefiner.current = undefined;
    document.body.replaceChildren();
  });
  const target = (): Element => {
    document.body.replaceChildren();
    const root = document.createElementNS(NS, "svg");
    const group = document.createElementNS(NS, "g");
    for (const [key, value] of [
      ["data-edge-id", "e1"],
      ["data-from", "A"],
      ["data-to", "B"],
    ] as const)
      group.setAttribute(key, value);
    const path = document.createElementNS(NS, "path");
    group.appendChild(path);
    root.appendChild(group);
    document.body.appendChild(root);
    return path;
  };
  it("without a refiner a click on an arrow names the arrow whose group it hit (as before)", () => {
    expect(hitAt({ target: target(), clientX: 1, clientY: 2 })).toEqual({
      kind: "edge",
      id: "e1",
    });
  });
  it("with a refiner the arrow it names is the one it chose, asked with the group and the pointer", () => {
    const seen: unknown[] = [];
    hitRefiner.current = (group, at) => {
      seen.push([group.getAttribute("data-edge-id"), at]);
      return "e2";
    };
    expect(hitAt({ target: target(), clientX: 7, clientY: 9 })).toEqual({
      kind: "edge",
      id: "e2",
    });
    expect(seen).toEqual([["e1", { x: 7, y: 9 }]]);
  });
  it("hitOf with no pointer never asks it; a refiner answering null keeps the group's own id", () => {
    hitRefiner.current = () => {
      throw new Error("asked");
    };
    expect(hitOf(target())).toEqual({ kind: "edge", id: "e1" });
    hitRefiner.current = () => null;
    expect(hitAt({ target: target(), clientX: 0, clientY: 0 })).toEqual({
      kind: "edge",
      id: "e1",
    });
  });
});
