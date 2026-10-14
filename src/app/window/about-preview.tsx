/**
 * "About this preview" (release preview, part 2): one dialog, opened from the File menu and from the first-run screen. The text is the
 * agreed notice, word for word; the version line is injected at build time (vite.config.ts `define`), so it needs no request.
 */
import { createContext, useContext } from 'react';
import { Button, Dialog } from '@/ui/primitives';

/** Who holds the copyright: the only place the name is written. */
const OWNER = 'YOUR NAME';

export const ABOUT_TEXT =
  'Preview version. The chemistry here is a small demo and has NOT been checked by an expert yet - please do not study from it. ' +
  'Everything you do stays on this device: nothing is sent anywhere, there are no accounts and no tracking. ' +
  `Your data lives in this browser only; use File > Export to keep a copy. © 2026 ${OWNER}. All rights reserved.`;

export const aboutVersionLine = (): string => `Version ${__ORN_VERSION__} (${__ORN_COMMIT__})`;

/** Opens the dialog from places that do not own it (the first-run screen). Without a provider the link is not offered. */
export const AboutOpenContext = createContext<(() => void) | undefined>(undefined);
export const useAboutOpen = (): (() => void) | undefined => useContext(AboutOpenContext);

export function AboutDialog(props: { readonly open: boolean; readonly onClose: () => void }) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="About this preview"
      footer={<Button onClick={props.onClose}>Close</Button>}
    >
      <p>{ABOUT_TEXT}</p>
      <p>{aboutVersionLine()}</p>
    </Dialog>
  );
}
