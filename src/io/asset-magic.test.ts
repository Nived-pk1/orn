import { describe, expect, it } from 'vitest';
import { magicBytesMatch } from './asset-magic';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF87 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
const GIF89 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const SVG_WITH_XML_PROLOG = new TextEncoder().encode('<?xml version="1.0"?><svg></svg>');

describe('magicBytesMatch', () => {
  it.each([
    ['image/png', PNG],
    ['image/jpeg', JPEG],
    ['image/gif', GIF87],
    ['image/gif', GIF89],
    ['image/webp', WEBP],
    ['image/svg+xml', SVG],
    ['image/svg+xml', SVG_WITH_XML_PROLOG],
  ] as const)('accepts real %s bytes', (mediaType, bytes) => {
    expect(magicBytesMatch(bytes, mediaType)).toBe(true);
  });

  it.each([
    ['image/png', JPEG],
    ['image/jpeg', PNG],
    ['image/gif', PNG],
    ['image/webp', PNG],
    ['image/svg+xml', PNG],
  ] as const)('rejects %s bytes that are actually something else', (mediaType, bytes) => {
    expect(magicBytesMatch(bytes, mediaType)).toBe(false);
  });

  it('rejects an empty buffer for every media type', () => {
    for (const mediaType of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'] as const) {
      expect(magicBytesMatch(new Uint8Array(0), mediaType)).toBe(false);
    }
  });

  it('rejects an unrecognised media type outright', () => {
    expect(magicBytesMatch(PNG, 'application/octet-stream')).toBe(false);
  });
});
