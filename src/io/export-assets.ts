/**
 * Reading one asset's bytes for an export (step 4.2e review, follow-up a): a provider that answers `undefined` has no bytes
 * (`no_bytes`); a provider that throws failed to read them (`read_failed`, with the error's text, capped). Either way the
 * export goes on and the gap is a reported value, never thrown and never silent (CLAUDE.md §1.5). Shared by both exporters.
 */
import type { AssetId } from '@/core/schema';
import { MISSING_ASSET_MESSAGE_CAP, type AssetBytesProvider, type MissingAsset } from './contracts';

export type AssetRead = { readonly ok: true; readonly bytes: Uint8Array } | { readonly ok: false; readonly missing: MissingAsset };

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : 'the provider threw a non-error value';
  return text.length > MISSING_ASSET_MESSAGE_CAP ? text.slice(0, MISSING_ASSET_MESSAGE_CAP) : text;
}

export async function readAssetBytes(provider: AssetBytesProvider, assetId: AssetId, sha256: string): Promise<AssetRead> {
  try {
    const bytes = await provider(assetId, sha256);
    if (bytes === undefined) return { ok: false, missing: { assetId, sha256, reason: 'no_bytes' } };
    return { ok: true, bytes };
  } catch (error) {
    return { ok: false, missing: { assetId, sha256, reason: 'read_failed', message: messageOf(error) } };
  }
}
