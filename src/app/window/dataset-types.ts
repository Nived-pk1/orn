/** The dataset this build ships and what this browser last loaded (studio step E4; the words and rules are in dataset-info.tsx). */
export type DatasetInfo =
  | { readonly kind: 'demo' }
  | {
      readonly kind: 'published';
      readonly sha256: string;
      readonly publishedAt: string;
      /** The sha256 this browser last loaded, read at boot; undefined: never. */
      readonly loadedSha256: string | undefined;
      /** Called when a load of this dataset was applied. */
      remember(sha256: string): void;
    };
