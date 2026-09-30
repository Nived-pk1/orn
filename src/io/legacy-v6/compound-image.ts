/**
 * A legacy `image` (a `data:` URL, docs/MIGRATION.md §4.4): decoded strictly into bytes, hashed, and described as an `asset`
 * (`legacy_image`, ID `ast_v6-<first 16 hex of sha256>`). Only base64 data URLs of the media types the schema allows, whose bytes
 * match their declared type (magic bytes) and fit the byte cap, are decoded. Anything else is reported with a reason and the
 * caller keeps the value in `provenance.legacy.unmapped` - nothing is guessed, repaired or dropped. Bounded: the input is
 * length-checked before any allocation, and decoding is one linear pass.
 */
import { ASSET_MEDIA_TYPES, LIMITS, MAX_ASSET_BYTES } from '@/core/schema';
import { magicBytesMatch } from '../asset-magic';
import { sha256Hex } from '../hash';

type MediaType = (typeof ASSET_MEDIA_TYPES)[number];

export type DecodedImage =
  | { readonly ok: true; readonly mediaType: MediaType; readonly bytes: Uint8Array; readonly sha256: string }
  | { readonly ok: false; readonly reason: string };

const DATA_URL = /^data:([^;,]*)((?:;[^;,]*)*),/;
const BASE64_BODY = /^[A-Za-z0-9+/]*={0,2}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const SEXTET = new Map([...ALPHABET].map((char, index) => [char.charCodeAt(0), index] as const));

function decodeBase64(body: string): Uint8Array {
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((body.length / 4) * 3 - padding);
  let at = 0;
  for (let i = 0; i < body.length; i += 4) {
    const a = SEXTET.get(body.charCodeAt(i)) ?? 0;
    const b = SEXTET.get(body.charCodeAt(i + 1)) ?? 0;
    const c = SEXTET.get(body.charCodeAt(i + 2)) ?? 0;
    const d = SEXTET.get(body.charCodeAt(i + 3)) ?? 0;
    const triple = (a << 18) | (b << 12) | (c << 6) | d;
    if (at < out.length) out[at++] = (triple >> 16) & 0xff;
    if (at < out.length) out[at++] = (triple >> 8) & 0xff;
    if (at < out.length) out[at++] = triple & 0xff;
  }
  return out;
}

const isMediaType = (value: string): value is MediaType => (ASSET_MEDIA_TYPES as readonly string[]).includes(value);

/** Decodes a legacy image value. Total: never throws. */
export async function decodeLegacyImage(value: string): Promise<DecodedImage> {
  const head = DATA_URL.exec(value.slice(0, 512));
  if (head === null) return { ok: false, reason: 'not a data: URL' };
  const mediaType = (head[1] ?? '').toLowerCase();
  if (!isMediaType(mediaType)) return { ok: false, reason: `media type "${mediaType.slice(0, 60)}" is not one of ${ASSET_MEDIA_TYPES.join(', ')}` };
  const parameters = (head[2] ?? '').split(';').filter((item) => item !== '').map((item) => item.toLowerCase());
  if (!parameters.includes('base64')) return { ok: false, reason: 'only base64 data URLs are decoded' };
  const body = value.slice(head[0].length);
  if (body.length > LIMITS.embeddedAssetBase64) return { ok: false, reason: `the encoded image is longer than ${LIMITS.embeddedAssetBase64} characters` };
  if (body.length === 0 || body.length % 4 !== 0 || !BASE64_BODY.test(body)) return { ok: false, reason: 'the payload is not valid padded base64' };
  const size = (body.length / 4) * 3 - (body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0);
  if (size < 1 || size > MAX_ASSET_BYTES) return { ok: false, reason: `the image is ${size} bytes; the limit is ${MAX_ASSET_BYTES}` };
  const bytes = decodeBase64(body);
  if (!magicBytesMatch(bytes, mediaType)) return { ok: false, reason: `the bytes do not match the declared media type ${mediaType}` };
  return { ok: true, mediaType, bytes, sha256: await sha256Hex(bytes) };
}
