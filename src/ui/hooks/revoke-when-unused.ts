/**
 * Gives a blob URL back only when no `<img>` in the document still shows it (step 6.8 follow-up U1). A view that swaps its picture
 * revokes the old URL from an effect cleanup, which runs while the old element is still mounted: a revoked URL under an image that is
 * still loading is a failed request (net::ERR_FILE_NOT_FOUND). The check repeats after each task until the element is gone, bounded so
 * a URL is never held forever.
 */
export const REVOKE_WAIT_MS = 20;
export const REVOKE_MAX_WAITS = 50;

const shown = (url: string, doc: Document): boolean => Array.from(doc.images).some((img) => img.getAttribute('src') === url);

export function revokeWhenUnused(revoke: (url: string) => void, url: string, doc: Document = document, waited = 0): void {
  if (waited >= REVOKE_MAX_WAITS || !shown(url, doc)) {
    revoke(url);
    return;
  }
  setTimeout(() => revokeWhenUnused(revoke, url, doc, waited + 1), REVOKE_WAIT_MS);
}
