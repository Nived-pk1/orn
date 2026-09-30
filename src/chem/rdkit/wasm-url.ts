/**
 * The URL of the package's own WASM file, resolved by the bundler to a local asset of the build (`?url`): no CDN, no network
 * beyond the app's own origin. Imported only by the chem worker's browser entry; Node-side code (tests, the real-thread fixture)
 * never imports it, because plain Node cannot resolve `?url`.
 */
import wasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url';

export const RDKIT_WASM_URL: string = wasmUrl;
