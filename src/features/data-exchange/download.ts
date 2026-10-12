/**
 * Saves a file the page has built: the Blob gets an object URL, a hidden anchor with `download` is clicked, and the URL is revoked
 * after (step 5.9b). No request leaves the page and the CSP is not widened: a `blob:` URL that is only downloaded is not fetched.
 */

/** How long the object URL lives after the click (WebKit and Firefox read it a moment later); it is never left behind. */
export const REVOKE_AFTER_MS = 30_000;

export function downloadBlob(blob: Blob, fileName: string, doc: Document = document, urls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL): void {
  const url = urls.createObjectURL(blob);
  try {
    const anchor = doc.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.hidden = true;
    doc.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => urls.revokeObjectURL(url), REVOKE_AFTER_MS);
  }
}
