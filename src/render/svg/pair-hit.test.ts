// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { distanceToLine, nearerEdgeAt, nearerLine } from "./pair-hit";

const NS = "http://www.w3.org/2000/svg";
const el = (parent: Element, name: string, attrs: Record<string, string> = {}): Element => {
  const child = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) child.setAttribute(key, value);
  parent.appendChild(child);
  return child;
};

describe("the nearer line of a two-way pair (step 8.4e, C1)", () => {
  it("distanceToLine: the shortest distance to a polyline, ends included", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(distanceToLine({ x: 5, y: 3 }, line)).toBe(3);
    expect(distanceToLine({ x: 14, y: 3 }, line)).toBe(5);
    expect(distanceToLine({ x: 1, y: 1 }, [{ x: 2, y: 2 }])).toBeCloseTo(
      Math.SQRT2,
    );
  });
  it("nearerLine picks the line the pointer is nearer to, not the one listed last", () => {
    const a = {
      id: "a",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    };
    const b = {
      id: "b",
      points: [
        { x: 0, y: 14 },
        { x: 100, y: 14 },
      ],
    };
    expect(nearerLine({ x: 50, y: 5 }, [a, b])).toBe("a");
    expect(nearerLine({ x: 50, y: 9 }, [a, b])).toBe("b");
    expect(nearerLine({ x: 50, y: 9 }, [b, a])).toBe("b");
    expect(nearerLine({ x: 50, y: 5 }, [])).toBeUndefined();
  });
  it("nearerEdgeAt: an arrow with no opposite arrow names itself; a pair names the nearer of its two", () => {
    // jsdom has no layout: the paths answer getScreenCTM / getTotalLength / getPointAtLength from the data we give them
    document.body.replaceChildren();
    const root = document.createElementNS(NS, "svg");
    document.body.appendChild(root);
    for (const [id, from, to] of [
      ["e1", "A", "B"],
      ["e2", "B", "A"],
      ["e3", "C", "D"],
    ] as const)
      el(
        el(root, "g", { "data-edge-id": id, "data-from": from, "data-to": to }),
        "path",
        { d: "M0 0" },
      );
    const give = (id: string, y: number): void => {
      const path = document.querySelector(
        `[data-edge-id="${id}"] path`,
      ) as unknown as Record<string, unknown>;
      path.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      path.getTotalLength = () => 100;
      path.getPointAtLength = (at: number) => ({ x: at, y });
    };
    give("e1", 0);
    give("e2", 14);
    const group = (id: string): Element =>
      document.querySelector(`[data-edge-id="${id}"]`) as Element;
    expect(nearerEdgeAt(group("e3"), { x: 50, y: 9 })).toBe("e3");
    expect(nearerEdgeAt(group("e1"), { x: 50, y: 9 })).toBe("e2");
    expect(nearerEdgeAt(group("e2"), { x: 50, y: 5 })).toBe("e1");
  });
});
