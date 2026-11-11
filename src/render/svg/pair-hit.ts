/**
 * The nearer line of a two-way pair (step 8.4e, C1; a lazy chunk, loaded with the free areas): the two lines of a pair are a few pixels apart and
 * their hit bands (at least 16 px) overlap, so the browser gives a click to whichever is drawn last. This picks the one nearer to the pointer, by the
 * distance from the pointer to each drawn path (sampled in screen pixels). The click code asks it through `hitRefiner` (hit.ts).
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface Line {
  readonly id: string;
  readonly points: readonly Point[];
}

export function distanceToLine(at: Point, points: readonly Point[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i] as Point;
    const b = points[i + 1] ?? a;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    const t =
      length2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / length2),
          );
    best = Math.min(
      best,
      Math.hypot(at.x - (a.x + t * dx), at.y - (a.y + t * dy)),
    );
  }
  return best;
}

export function nearerLine(
  at: Point,
  lines: readonly Line[],
): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const distance = distanceToLine(at, line.points);
    if (distance < bestDistance) {
      best = line.id;
      bestDistance = distance;
    }
  }
  return best;
}

const SAMPLES = 40;
function screenPoints(path: SVGPathElement): Point[] {
  const matrix =
    typeof path.getScreenCTM === "function" ? path.getScreenCTM() : null;
  if (matrix === null) return [];
  const length = path.getTotalLength();
  return Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const at = path.getPointAtLength((length * i) / SAMPLES);
    return {
      x: at.x * matrix.a + at.y * matrix.c + matrix.e,
      y: at.x * matrix.b + at.y * matrix.d + matrix.f,
    };
  });
}

export function nearerEdgeAt(edgeGroup: Element, at: Point): string | null {
  const id = edgeGroup.getAttribute("data-edge-id");
  const from = edgeGroup.getAttribute("data-from");
  const to = edgeGroup.getAttribute("data-to");
  if (id === null || from === null || to === null || from === to) return id;
  const other = [...(edgeGroup.parentElement?.children ?? [])].find(
    (el) =>
      el !== edgeGroup &&
      el.getAttribute("data-from") === to &&
      el.getAttribute("data-to") === from,
  );
  if (other === undefined) return id;
  const lines = [edgeGroup, other].flatMap((group) => {
    const path = group.querySelector<SVGPathElement>("path:not([data-hit])");
    const key = group.getAttribute("data-edge-id");
    return path === null || key === null
      ? []
      : [{ id: key, points: screenPoints(path) }];
  });
  return nearerLine(at, lines) ?? id;
}
