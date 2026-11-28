/** Points and vectors of the mechanism geometry (pure; shared by arrows.ts and route.ts). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Point, b: Point, k = 1): Point => ({ x: a.x + b.x * k, y: a.y + b.y * k });
export const length = (a: Point): number => Math.hypot(a.x, a.y);
export const unit = (a: Point, fallback: Point): Point => {
  const n = length(a);
  return n < 1e-9 ? fallback : { x: a.x / n, y: a.y / n };
};
export const turn = (d: Point, angle: number): Point => ({ x: d.x * Math.cos(angle) - d.y * Math.sin(angle), y: d.x * Math.sin(angle) + d.y * Math.cos(angle) });
