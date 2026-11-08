/**
 * The Icon primitive (step 8.4d, Part B). Each icon is a single-colour SVG FILE under public/icons (Lucide style, stroke 1.75; licence beside
 * them) drawn through CSS `mask-image` on a span whose background is `currentColor`. No SVG markup is injected (the sanitiser rule holds),
 * the icons stay out of the JavaScript, and an icon follows the text colour in both themes. Decorative: `aria-hidden`; the control that
 * holds it carries the accessible name (and its tooltip). Sizes: 16 (controls) and 20 (the phone tab bar).
 * tests/integration/icons-guard.test.ts: every name here is a file, every file is used.
 */
export const ICON_NAMES = [
  'atom', 'bell', 'book-open', 'chevron-down', 'chevron-right', 'clipboard-check', 'compass', 'database', 'download', 'flask', 'info', 'layers',
  'list-checks', 'map', 'mark', 'minus', 'more-horizontal', 'panel-right', 'pencil', 'plus', 'redo', 'route', 'scan', 'search', 'tag', 'test-tube',
  'triangle-alert', 'undo', 'x',
] as const;
export type IconName = (typeof ICON_NAMES)[number];
export type IconSize = 16 | 20;

const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

/** The URL of an icon's file, under the app's base path. */
export const iconUrl = (name: IconName): string => `${BASE}icons/${name}.svg`;

export function Icon(props: { readonly name: IconName; readonly size?: IconSize; readonly className?: string }) {
  const size = props.size ?? 16;
  const url = `url("${iconUrl(props.name)}")`;
  return (
    <span
      aria-hidden="true"
      {...(props.className === undefined ? {} : { className: props.className })}
      style={{
        display: 'inline-block',
        flex: 'none',
        width: size,
        height: size,
        backgroundColor: 'currentColor',
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}
