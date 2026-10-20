/**
 * The edition of this build (studio step, ADR-041). ONE literal, `__ORN_EDITION__`, set by the build (`vite.config.ts` `define`, from
 * `ORN_EDITION`; `scripts/edition.mjs`): the public STUDY edition has no editing code at all, STUDIO has everything. Because the value is a
 * literal in the output, `EDITING` is a constant the bundler folds, so a branch guarded by it, and the modules only that branch imports,
 * are not in the Study bundle (`scripts/check-edition.mjs` proves it from the build's own module list). Anything but exactly 'studio' is
 * Study: a wrong value can never switch editing on.
 */
export type Edition = 'study' | 'studio';

// typeof: a Node script or test runner that loads src without the build has no literal; that is Study too
export const EDITION: Edition = typeof __ORN_EDITION__ !== 'undefined' && __ORN_EDITION__ === 'studio' ? 'studio' : 'study';
/** True only in Studio: guards every entry point of an editor (the Workbench, Edit, New, Drafts, global Undo and Redo, the session manager). */
export const EDITING: boolean = EDITION === 'studio';

/** The one place the word lives (the owner may rename it): the header marker and the Studio page title. */
export const STUDIO_NAME = 'Studio';
export const SITE_TITLE = 'Organic Reaction Navigator';

/** The page title: "ORN Studio" in Studio, the site's own title in Study. */
export const pageTitleOf = (): string => (EDITING ? `ORN ${STUDIO_NAME}` : SITE_TITLE);
/** The header marker: the Studio name in Studio, nothing in Study. */
export const editionMarker = (): string | undefined => (EDITING ? STUDIO_NAME : undefined);
