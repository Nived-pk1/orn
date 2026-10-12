/**
 * The hostile file of ADV-033 (step 5.10a), made in Node from the demo dataset and uploaded through the real chooser (E15): names,
 * aliases and notes full of `<script>`, `<img onerror=...>`, HTML tags and mini-markup; a `javascript:` reference URL (it fails L1, so the
 * import quarantines it); a scripted SVG asset (embedded in the file); a hostile file name. Nothing here is ever "data the app may
 * run": every string must come back as text, and the SVG only as `<img src="blob:...">`.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { produce } from 'immer';
import { documentToState } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import { buildOrnJsonExport } from '@/io';
import type { UploadFile } from '../kit';

export const HOSTILE_WORD = 'Zorbax';
export const SCRIPT_TEXT = '<script>window.__pwn=1</script>';
export const IMG_TEXT = '<img src=x onerror="window.__pwn=1">';
export const HOSTILE_REACTION = `Ethanol → ethanal (PCC) ${HOSTILE_WORD} ${SCRIPT_TEXT}`;
export const HOSTILE_SPECIES = `Ethanal ${HOSTILE_WORD} ${IMG_TEXT}`;
export const HOSTILE_REF_TITLE = `Hostile reference ${HOSTILE_WORD} <b>bold</b>`;
export const HOSTILE_FILE_NAME = `<img src=x onerror=window.__pwn=1>"; ${HOSTILE_WORD}.orn.json`;
export const REACTION_ID = 'rxn_ethanol-to-ethanal-pcc';
export const SPECIES_ID = 'spc_ethanal';
export const ASSET_ID = 'ast_hostile-svg';
export const REF_ID = 'ref_hostile-js';
export const NOTES = [
  `**${SCRIPT_TEXT}** and _${IMG_TEXT}_ and <iframe src="javascript:window.__pwn=1"></iframe> and <a href="javascript:window.__pwn=1">link</a>`,
  '[click](javascript:window.__pwn=1) [[rxn_alcohol1-to-aldehyde-pcc]] [[ast_hostile-svg]] H~2~O x^2^ <svg onload="window.__pwn=1"></svg>',
  '- <style>body{display:none}</style>',
].join('\n');

export const SVG_TEXT = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" onload="window.__pwn=1"><script>window.__pwn=1</script><rect width="100" height="100" fill="#456" onclick="window.__pwn=1"/><foreignObject width="10" height="10"><iframe xmlns="http://www.w3.org/1999/xhtml" src="javascript:window.__pwn=1"></iframe></foreignObject></svg>';

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const META = { tags: [], citations: [], provenance: { origin: 'seed', createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z' }, review: { lifecycle: 'published', status: 'unreviewed', reasons: [] } };

function demoState(): CanonicalState {
  const parsed = documentToState(JSON.parse(readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json'), 'utf8')));
  if (!parsed.ok) throw new Error('the demo does not parse');
  return parsed.state;
}

export interface HostileFile {
  readonly file: UploadFile;
  readonly text: string;
}

/** The demo with hostile strings, one asset with a scripted SVG, and (written into the JSON after export) a reference with a javascript: URL. */
export async function hostileFile(): Promise<HostileFile> {
  const svgBytes = new Uint8Array(Buffer.from(SVG_TEXT, 'utf8'));
  const state = produce(demoState(), (draft) => {
    const records = draft.records as unknown as Record<string, Record<string, Record<string, unknown>>>;
    const reaction = records.reaction?.[REACTION_ID];
    const species = records.species?.[SPECIES_ID];
    if (reaction === undefined || species === undefined) throw new Error('the demo lacks the records the hostile file edits');
    reaction.name = HOSTILE_REACTION;
    reaction.aliases = [`${HOSTILE_WORD} <b>alias</b>`];
    reaction.studyNotes = NOTES;
    reaction.limitations = NOTES;
    species.names = { canonical: HOSTILE_SPECIES, common: [`${HOSTILE_WORD} <i>common</i>`], aliases: [`${HOSTILE_WORD} ${SCRIPT_TEXT}`] };
    const assets = (records.asset ??= {});
    assets[ASSET_ID] = {
      id: ASSET_ID,
      kind: 'asset',
      mediaType: 'image/svg+xml',
      byteSize: svgBytes.length,
      sha256: sha256(svgBytes),
      width: 100,
      height: 100,
      filename: `hostile ${HOSTILE_WORD}.svg`,
      altText: `A hostile picture ${SCRIPT_TEXT}`,
      assetRole: 'reaction_image',
      attachedTo: [{ ref: { kind: 'reaction', id: REACTION_ID } }],
      caption: `caption ${IMG_TEXT}`,
      ...META,
    };
  });
  const built = await buildOrnJsonExport(
    state,
    { scope: 'full', includeDependencies: false, assets: 'embed' },
    { exportedAt: '2026-10-12T12:00:00.000Z', generator: { app: 'orn-e2e', version: '1' }, assetBytes: async () => svgBytes },
  );
  if (!built.ok) throw new Error(`the hostile document does not build: ${built.message}`);
  const doc = JSON.parse(Buffer.from(built.result.bytes).toString('utf8')) as { records: { reference: unknown[] } };
  doc.records.reference.push({
    id: REF_ID,
    kind: 'reference',
    refKind: 'article',
    title: HOSTILE_REF_TITLE,
    authors: [],
    url: 'javascript:window.__pwn=1',
    ...META,
  });
  const text = `${JSON.stringify(doc)}\n`;
  return { text, file: { name: HOSTILE_FILE_NAME, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') } };
}
