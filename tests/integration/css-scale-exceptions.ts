/** The short, reasoned list of CSS values allowed outside the type/spacing/radius scale (step 8.4a, Part A). One line each. */
export interface ScaleException {
  readonly file: string;
  readonly prop: string;
  readonly value: string;
  readonly reason: string;
}

const E = (file: string, prop: string, value: string, reason: string): ScaleException => ({ file, prop, value, reason });

export const SCALE_EXCEPTIONS: readonly ScaleException[] = [
  E('src/features/navigator/family-page.module.css', 'padding-bottom', 'var(--sheet-space, 0)', 'runtime length set from the sheet height'),
  E('src/render/equation/equation-scheme.module.css', 'padding-bottom', 'var(--hang)', 'runtime length computed from the name lengths (hang.ts)'),
  E('src/features/navigator/map-room.module.css', 'margin', '-1px', 'hairline overlap of a border, not a spacing step'),
  E('src/render/equation/equation-scheme.module.css', 'margin', '-1px', 'visually hidden helper, one clipped pixel'),
  E('src/ui/primitives/equation-arrow.module.css', 'margin-left', '-1px', 'hairline overlap of the arrow stem'),
  E('src/ui/primitives/visually-hidden.module.css', 'margin', '-1px', 'visually hidden helper, one clipped pixel'),
  E('src/ui/shell/shell.module.css', 'margin-left', '-4px', 'resize handle straddles the pane edge by half its width'),
  E('src/features/navigator/phone-home.module.css', 'border-radius', '50%', 'a circle (round button)'),
  E('src/ui/study-chrome/review-mark.module.css', 'border-radius', '50%', 'a circle (the review dot)'),
  E('src/ui/shell/shell.module.css', 'margin', '-1px', 'visually hidden helper (the title as the page heading), one clipped pixel'),
  E('src/ui/primitives/list-row.module.css', 'border-radius', '50%', 'a circle (the family dot)'),
  E('src/ui/primitives/segmented-control.module.css', 'padding', '2px', 'the track inset around the raised chosen segment (reference .seg)'),
  E('src/ui/shell/mode-rail.module.css', 'gap', '1px', 'rows of the rail sit 1 px apart (reference .rail)'),
  E('src/render/svg/scene-svg.module.css', 'font-size', '75%', 'sub/superscript inside map text (relative to the box text)'),
  E('src/features/navigator/full-map.css', 'margin-right', 'var(--inspector-width)', 'the A-to-B panel stays left of the open pane (the width of the open pane, step 8.4e Part D)'),
];
