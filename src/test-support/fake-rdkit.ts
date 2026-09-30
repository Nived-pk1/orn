/**
 * A fake RDKit module for the adapter's tests (step 4.3a): every object it hands out is tracked, so a test can prove that each
 * one was freed exactly once on every path (success, refusal, throw). Molecules are looked up by the input string; anything
 * not registered is "RDKit cannot read it" (`null`). A registered value may also be an `Error` to throw (a trap or a C++
 * exception). Test-only.
 */
import type { RdkitMol, RdkitModule } from '@/chem/rdkit/types';

export interface FakeMolSpec {
  readonly smiles?: string;
  readonly json?: string;
  readonly stereo?: string;
  readonly heavy?: number;
  readonly svg?: string | ((details: string) => string);
  readonly order?: string;
  /** The result of `get_substruct_match(query)` for a query registered with this text. */
  readonly matches?: Readonly<Record<string, string>>;
  /** Methods of this molecule that throw the given value instead of answering. */
  readonly throws?: Readonly<Partial<Record<keyof RdkitMol, unknown>>>;
}

export interface FakeHandle {
  readonly kind: 'mol' | 'qmol';
  readonly input: string;
  deleted: number;
}

const ETHANOL_JSON = JSON.stringify({
  rdkitjson: { version: 12 },
  defaults: { atom: { z: 6, impHs: 0, chg: 0, nRad: 0, isotope: 0, stereo: 'unspecified' }, bond: { bo: 1, stereo: 'unspecified' } },
  molecules: [{ atoms: [{ impHs: 3 }, { impHs: 2 }, { z: 8, impHs: 1 }], bonds: [{ atoms: [0, 1] }, { atoms: [1, 2] }], extensions: [{ name: 'rdkitRepresentation' }] }],
});

export const ETHANOL_SPEC: FakeMolSpec = {
  smiles: 'CCO',
  json: ETHANOL_JSON,
  stereo: '{"CIP_atoms":[],"CIP_bonds":[]}',
  heavy: 3,
  svg: "<?xml version='1.0'?><svg xmlns='http://www.w3.org/2000/svg' width='200px' height='150px' viewBox='0 0 200 150'><rect width='200' height='150'/><path d='M 1 1 L 2 2'/></svg>",
  order: '[0,1,2]',
};

export interface FakeRdkit {
  readonly module: RdkitModule;
  readonly handles: FakeHandle[];
  /** Objects created and not deleted exactly once. */
  leaked(): FakeHandle[];
  readonly calls: { readonly getMol: string[]; readonly getQmol: string[] };
}

export function createFakeRdkit(
  molecules: Readonly<Record<string, FakeMolSpec | Error | null>>,
  queries: Readonly<Record<string, { readonly ok: true } | Error | null>> = {},
  version = 'fake-2026.03',
): FakeRdkit {
  const handles: FakeHandle[] = [];
  const calls = { getMol: [] as string[], getQmol: [] as string[] };

  const wrap = (handle: FakeHandle, spec: FakeMolSpec): RdkitMol => {
    const answer = <T>(method: keyof RdkitMol, value: T): T => {
      const thrown = spec.throws?.[method];
      if (thrown !== undefined) throw thrown;
      return value;
    };
    return {
      delete: () => {
        handle.deleted += 1;
      },
      isDeleted: () => handle.deleted > 0,
      get_smiles: () => answer('get_smiles', spec.smiles ?? ''),
      get_json: () => answer('get_json', spec.json ?? ''),
      get_stereo_tags: () => answer('get_stereo_tags', spec.stereo ?? ''),
      get_num_atoms: () => answer('get_num_atoms', spec.heavy ?? 0),
      get_prop: () => answer('get_prop', spec.order ?? ''),
      get_svg_with_highlights: (details: string) => {
        const svg = answer('get_svg_with_highlights', spec.svg ?? '');
        return typeof svg === 'function' ? svg(details) : svg;
      },
      get_substruct_match: (query: RdkitMol) => {
        const text = (query as unknown as { readonly input: string }).input;
        return answer('get_substruct_match', spec.matches?.[text] ?? '{}');
      },
    };
  };

  const module: RdkitModule = {
    version: () => version,
    // A read with details is looked up under `<input>#nosan` (sanitize: false) or `<input>#keeph` (removeHs: false).
    get_mol: (input, details) => {
      const key = details === undefined ? input : `${input}${details.includes('sanitize') ? '#nosan' : '#keeph'}`;
      calls.getMol.push(key);
      const spec = molecules[key];
      if (spec instanceof Error) throw spec;
      if (spec === undefined || spec === null) return null;
      const handle: FakeHandle = { kind: 'mol', input: key, deleted: 0 };
      handles.push(handle);
      return wrap(handle, spec);
    },
    get_qmol: (input) => {
      calls.getQmol.push(input);
      const spec = queries[input];
      if (spec instanceof Error) throw spec;
      if (spec === undefined || spec === null) return null;
      const handle: FakeHandle = { kind: 'qmol', input, deleted: 0 };
      handles.push(handle);
      return Object.assign(wrap(handle, {}), { input });
    },
  };
  return { module, handles, leaked: () => handles.filter((handle) => handle.deleted !== 1), calls };
}

/** What a WASM trap looks like to the adapter. */
export const trap = (): Error => new WebAssembly.RuntimeError('memory access out of bounds');
