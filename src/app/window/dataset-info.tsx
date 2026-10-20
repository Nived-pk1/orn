/**
 * The dataset this build ships, as the window knows it (studio step E4, ADR-041): the bundled demo, or the one the owner published
 * (`data/published/`), with the sha256 this browser last loaded. The sha256 is kept in `uiState` (key `studyDataset`, `{ sha256 }`): read
 * tolerantly at boot (anything that does not look like a sha256 is "never loaded"), written when a load of the published dataset is
 * applied, in a writer tab only. The words of the first-run screen, "Replace with ..." and the failures follow from it, and so does when the
 * update notice is due. Study only: Studio never shows the notice and always speaks of the demo.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AppServices } from '@/app/services';
import { EDITING } from '@/app/edition';
import { useAppOptional } from './context';
import type { DatasetInfo } from './dataset-types';

export const STUDY_DATASET_KEY = 'studyDataset';

export type { DatasetInfo };

export interface DatasetWords {
  /** The first-run button. */
  readonly load: string;
  /** What the dataset is called in a sentence ("The demo dataset could not be loaded: ..."). */
  readonly noun: string;
  /** The lead of the first-run screen. */
  readonly lead: string;
  readonly replaceTitle: string;
  readonly replaceBody: string;
}

const DEMO_WORDS: DatasetWords = {
  load: 'Load demo dataset',
  noun: 'demo dataset',
  lead: 'Preview - the chemistry is a demo and not yet checked.',
  replaceTitle: 'Replace with the demo dataset',
  replaceBody: 'The current data is replaced by the bundled demo dataset. Undo import brings the current data back (a snapshot is taken first).',
};
const STUDY_WORDS: DatasetWords = {
  load: 'Load the study dataset',
  noun: 'study dataset',
  lead: 'The study dataset is ready to load.',
  replaceTitle: 'Replace with the study dataset',
  replaceBody: 'The current data is replaced by the study dataset. Undo import brings the current data back (a snapshot is taken first).',
};

export const datasetWordsOf = (info: DatasetInfo | undefined): DatasetWords => (info?.kind === 'published' ? STUDY_WORDS : DEMO_WORDS);

const DatasetContext = createContext<DatasetInfo | undefined>(undefined);

/**
 * The shipped dataset of THIS window, with what this visit loaded: after a load is applied the notice is no longer due, although the
 * sha256 read at boot is the old one. Studio has the demo only, whatever the app context says.
 */
export function DatasetProvider(props: { readonly children: ReactNode }) {
  const app = useAppOptional();
  const base = EDITING ? undefined : app?.dataset;
  const [loadedNow, setLoadedNow] = useState<string | undefined>(undefined);
  const value = useMemo<DatasetInfo | undefined>(
    () =>
      base?.kind !== 'published'
        ? base
        : {
            ...base,
            loadedSha256: loadedNow ?? base.loadedSha256,
            remember: (sha256) => {
              base.remember(sha256);
              setLoadedNow(sha256);
            },
          },
    [base, loadedNow],
  );
  return <DatasetContext.Provider value={value}>{props.children}</DatasetContext.Provider>;
}

export const useDatasetInfo = (): DatasetInfo | undefined => useContext(DatasetContext);

/** Due: Study, a published dataset whose sha256 is not the one last loaded, something to replace (an empty dataset gets the first-run screen), and no "Later" this visit. */
export function studyUpdateDue(input: { readonly editing: boolean; readonly dataset: DatasetInfo | undefined; readonly hasData: boolean; readonly dismissed: boolean }): boolean {
  const { editing, dataset, hasData, dismissed } = input;
  return !editing && dataset?.kind === 'published' && hasData && !dismissed && dataset.loadedSha256 !== dataset.sha256;
}

const SHA256 = /^[0-9a-f]{64}$/;
const shaOf = (entry: unknown): string | undefined => {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined;
  const sha = (entry as { sha256?: unknown }).sha256;
  return typeof sha === 'string' && SHA256.test(sha) ? sha : undefined;
};

export function createDatasetInfo(services: Pick<AppServices, 'bootReport' | 'persistence' | 'status'>, manifest: { readonly sha256: string; readonly publishedAt: string } | null): DatasetInfo {
  if (manifest === null) return { kind: 'demo' };
  return {
    kind: 'published',
    sha256: manifest.sha256,
    publishedAt: manifest.publishedAt,
    loadedSha256: shaOf(services.bootReport?.uiState[STUDY_DATASET_KEY]),
    remember(sha256) {
      if (services.persistence === undefined || services.status.get().mode !== 'writer') return;
      // a write that fails is not an error of the load: the notice simply shows again at the next visit
      void services.persistence.setUiState(STUDY_DATASET_KEY, { sha256 }).catch(() => undefined);
    },
  };
}
