/**
 * Magic-byte sniffing for asset bytes against a declared media type (docs/SECURITY.md §3, docs/PERSISTENCE.md
 * §5). Used when unpacking `.ornpkg` assets (IMPLEMENTATION_PLAN.md §2 step 3.6): a mismatch is reported and
 * that one asset's bytes are rejected — its record still imports and shows AST-002 (missing blob) later.
 */
import type { ASSET_MEDIA_TYPES } from '@/core/schema';

type AssetMediaType = (typeof ASSET_MEDIA_TYPES)[number];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

/** The first 4KB is plenty to find `<svg` / `<?xml`; SVG has no binary magic bytes, so this is a text sniff. */
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 4096)).trimStart();
  return head.startsWith('<?xml') || /^<svg[\s>]/i.test(head) || head.toLowerCase().startsWith('<!doctype svg');
}

export function magicBytesMatch(bytes: Uint8Array, mediaType: AssetMediaType | string): boolean {
  switch (mediaType) {
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'image/gif':
      return startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    case 'image/webp':
      return (
        startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
      );
    case 'image/svg+xml':
      return looksLikeSvg(bytes);
    default:
      return false;
  }
}
