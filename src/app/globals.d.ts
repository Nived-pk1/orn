/** Injected at build time by vite.config.ts (`define`): the package version and the short commit. No runtime request. */
declare const __ORN_VERSION__: string;
declare const __ORN_COMMIT__: string;
/** The edition of the build ('study' or 'studio'; `src/app/edition.ts` reads it). */
declare const __ORN_EDITION__: string;

/** The dataset this build ships (vite.config.ts, studio step E4): the published study dataset (Study) or the bundled demo. */
declare module 'virtual:orn-dataset' {
  export const dataset:
    | { readonly kind: 'demo'; readonly url: string; readonly fileName: string }
    | { readonly kind: 'published'; readonly url: string; readonly fileName: string; readonly sha256: string; readonly publishedAt: string };
}
