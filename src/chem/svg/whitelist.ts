/**
 * The SVG whitelist (docs/SECURITY.md §2): the drawing elements RDKit writes and the attributes and style properties they
 * carry. Everything else (script, foreignObject, style, image, use, a, animate, set, filter, metadata, any namespaced
 * element, event handlers, href and xlink:href, `xmlns:*`, `xml:*`) is not in these tables and is dropped with its content.
 * Names are matched exactly and case-sensitively, as an XML parser (the `<img>` context) does.
 */
import type { ValueKind } from './values';

export const ELEMENTS: ReadonlySet<string> = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan']);

/** Elements whose character data is kept (escaped). Everywhere else text is dropped. */
export const TEXT_ELEMENTS: ReadonlySet<string> = new Set(['text', 'tspan']);

/** Presentation properties, valid as attributes and inside `style`. */
export const PRESENTATION: Readonly<Record<string, ValueKind>> = {
  fill: 'colour',
  stroke: 'colour',
  'stroke-width': 'length',
  'stroke-linecap': 'lineCap',
  'stroke-linejoin': 'lineJoin',
  'stroke-miterlimit': 'number',
  'stroke-opacity': 'number',
  'fill-opacity': 'number',
  opacity: 'number',
  'fill-rule': 'fillRule',
  'stroke-dasharray': 'dashes',
  'font-family': 'fontFamily',
  'font-size': 'length',
  'font-weight': 'fontWeight',
  'font-style': 'fontStyle',
  'text-anchor': 'textAnchor',
  'dominant-baseline': 'baseline',
};

/** Attributes valid as attributes only. `style` is handled by the sanitiser itself (declaration by declaration). */
export const GEOMETRY: Readonly<Record<string, ValueKind>> = {
  width: 'length',
  height: 'length',
  viewBox: 'numberList',
  x: 'lengthList',
  y: 'lengthList',
  dx: 'lengthList',
  dy: 'lengthList',
  x1: 'length',
  y1: 'length',
  x2: 'length',
  y2: 'length',
  cx: 'length',
  cy: 'length',
  r: 'length',
  rx: 'length',
  ry: 'length',
  d: 'pathData',
  points: 'points',
  transform: 'transform',
  class: 'className',
};

/** The one namespace declaration written: the sanitiser adds it itself so an `<img>` renders the file. */
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function attributeKind(name: string): ValueKind | undefined {
  return Object.hasOwn(GEOMETRY, name) ? GEOMETRY[name] : Object.hasOwn(PRESENTATION, name) ? PRESENTATION[name] : undefined;
}

export function styleKind(property: string): ValueKind | undefined {
  return Object.hasOwn(PRESENTATION, property) ? PRESENTATION[property] : undefined;
}
