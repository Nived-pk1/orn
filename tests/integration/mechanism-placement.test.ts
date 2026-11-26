/**
 * Step 8.5g G2 and G3 on REAL RDKit and the demo steps: (a) a species drawn turned is the same molecule, and a wedged one is never
 * mirrored (the worker refuses it); (b) SN2: the nucleophile's arrow comes in at 150 degrees or more from the leaving group; (c) aldol
 * step 1: the hydroxide's arrow is at least 30 % shorter than in the unturned layout (the layout at the step's START); (d) the same input
 * gives the same picture; (e) curved arrows are as thick as the drawn bonds, and the "+" and the step arrow use the bonds' ink.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, loadRdkit, type StructureToolkit } from '@/chem';
import type { StructureRep } from '@/core/schema';
import type { StepDrawingPort } from '@/render/mechanism/contracts';
import { composeStep, type Composition, type MovementInput } from '@/render/mechanism/geometry';
import { PLUS_FONT_UNITS } from '@/render/mechanism/step-drawing';
import { loadStep, type DrawnPart, type LoadedStep } from '@/render/mechanism/step-model';
import demo from '../../data/seed/demo.orn.json';

let toolkit: StructureToolkit;
beforeAll(async () => {
  const shared = await loadRdkit();
  toolkit = createRdkitToolkit({ load: async () => shared });
  await toolkit.ready();
}, 60_000);

const OPTIONS = { width: 120, height: 80, showAtomMaps: false, fixedScale: true, atomPositions: true } as const;
function portWith(asked: { value: string; turn: number }[] = []): StepDrawingPort {
  return {
    async depict(structure: StructureRep, positions: boolean, turn?: number) {
      asked.push({ value: structure.value, turn: turn ?? 0 });
      const out = await toolkit.depict(structure, { ...OPTIONS, atomPositions: positions, ...(turn === undefined ? {} : { turn }) });
      if (!out.ok) return { ok: false, reason: out.reason, message: out.error };
      const d = out.depiction;
      return { ok: true, svg: d.svg, width: d.width, height: d.height, ...(d.atoms === undefined ? {} : { atoms: d.atoms, bonds: d.bonds ?? [], glyphs: d.glyphs ?? [] }) };
    },
    createUrl: () => '',
    revokeUrl: () => {},
  };
}

interface DemoStep {
  readonly id: string;
  readonly species: readonly { role: never; structure?: StructureRep }[];
  readonly electronMovements: readonly MovementInput[];
  readonly reversible?: boolean;
}
type Mechanism = { id?: string; variants: { steps: DemoStep[] }[]; record?: Mechanism };
const mechanisms = (demo as unknown as { records: { mechanism: Mechanism[] } }).records.mechanism.map((m) => m.record ?? m);
const stepOf = (mechanism: string, n: number): DemoStep => (mechanisms.find((m) => m.id === mechanism) as Mechanism).variants[0]?.steps[n] as DemoStep;

type Ready = Extract<LoadedStep, { status: 'ready' }>;
async function load(s: DemoStep, port = portWith()): Promise<Ready> {
  const loaded = await loadStep({ number: 1, species: s.species, electronMovements: s.electronMovements, reversible: s.reversible === true }, port);
  if (loaded.status !== 'ready') throw new Error(loaded.status);
  return loaded;
}
function compose(s: DemoStep, loaded: Ready) {
  const out = composeStep({ before: loaded.before.map((p) => p.drawn), after: loaded.after.map((p) => p.drawn), orientation: 'row', reversible: false, movements: s.electronMovements });
  if (!out.ok) throw new Error('missing atoms');
  return out as Extract<Composition, { ok: true }>;
}
/** Where each mapped atom of the before side is in the composed picture. */
function places(loaded: Ready, composed: ReturnType<typeof compose>): Map<number, { x: number; y: number }> {
  const at = new Map<number, { x: number; y: number }>();
  loaded.before.forEach((part, k) => {
    const item = composed.items[k] as { x: number; y: number };
    for (const a of part.drawn.atoms) at.set(a.map, { x: a.x + item.x, y: a.y + item.y });
  });
  return at;
}
/** The before side as it was at the step's START: every species as RDKit draws it, in the given order. */
async function unturned(s: DemoStep, loaded: Ready): Promise<Ready> {
  const port = portWith();
  const parts: DrawnPart[] = [];
  for (const one of s.species) {
    const a = await port.depict(one.structure as StructureRep, true);
    if (!a.ok) throw new Error(a.message);
    parts.push({ drawn: { kind: 'structure', transitionState: false, width: a.width, height: a.height, atoms: [...(a.atoms ?? [])], bonds: [...(a.bonds ?? [])], glyphs: [...(a.glyphs ?? [])] } });
  }
  const key = (p: DrawnPart): string => p.drawn.atoms.map((a) => a.map).sort((x, y) => x - y).join();
  const wanted = new Set(loaded.before.map(key));
  return { ...loaded, before: parts.filter((p) => wanted.has(key(p))) };
}
const arrowChord = (c: ReturnType<typeof compose>, k: number): number => {
  const a = c.arrows[k] as { start: { x: number; y: number }; end: { x: number; y: number } };
  return Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y);
};

describe('the worker draws a turned species', () => {
  const turned = (value: string, turn: number) => toolkit.depict({ format: 'smiles', value }, { ...OPTIONS, turn });

  it('turned by 90 degrees clockwise: the same atoms, the picture stands up', async () => {
    const flat = await turned('[CH3:1][CH2:2][CH2:3][CH3:4]', 0);
    const up = await turned('[CH3:1][CH2:2][CH2:3][CH3:4]', 3);
    if (!flat.ok || !up.ok) throw new Error('not drawn');
    expect(flat.depiction.width).toBeGreaterThan(flat.depiction.height);
    expect(up.depiction.height).toBeGreaterThan(up.depiction.width);
    const y = (map: number) => up.depiction.atoms?.find((a) => a.map === map)?.y ?? 0;
    expect(y(4)).toBeGreaterThan(y(1));
    expect(up.depiction.key).not.toBe(flat.depiction.key);
  });

  it('an unspecified double bond is drawn as a plain double bond, not a crossed one, and can be turned', async () => {
    // the two lines of a plain double bond are parallel; a crossed ("either") one is two lines that cross
    const lines = (svg: string): number[][] => [...svg.matchAll(/<path\s[^>]*?class=['"]bond-1 [^'"]*['"][^>]*?\sd=['"]([^'"]+)['"]/g)].map((m) => (m[1] ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []);
    for (const turn of [0, 3, 12]) {
      const out = await turned('C[CH:3]=[CH:4]C', turn);
      if (!out.ok) throw new Error(out.error);
      const [a, b] = lines(out.depiction.svg) as [number[], number[]];
      const slope = (l: number[]): number => Math.atan2((l[3] as number) - (l[1] as number), (l[2] as number) - (l[0] as number)) % Math.PI;
      expect(Math.abs(Math.sin(slope(a) - slope(b))), `turn ${turn}`).toBeLessThan(0.05);
    }
  });

  it('a wedged species may be turned but never mirrored', async () => {
    expect((await turned('C[C@@H:2]([Br:3])CC', 5)).ok).toBe(true);
    expect(await turned('C[C@@H:2]([Br:3])CC', 12)).toMatchObject({ ok: false, reason: 'refused' });
    expect((await turned('C[CH:2]([Br:3])CC', 12)).ok).toBe(true);
  });

  it('a turn outside 0 to 23, or without atom positions, is a programmer error', async () => {
    await expect(turned('[CH3:1]', 24)).rejects.toThrow(RangeError);
    await expect(toolkit.depict({ format: 'smiles', value: 'C' }, { ...OPTIONS, atomPositions: false, turn: 1 })).rejects.toThrow(RangeError);
  });
});

describe('the demo steps are placed as a textbook places them', () => {
  it('SN2: the arrow into the carbon comes in at 150 degrees or more from the leaving group', async () => {
    const s = stepOf('mec_sn2-haloalkane', 0);
    const asked: { value: string; turn: number }[] = [];
    const loaded = await load(s, portWith(asked));
    const composed = compose(s, loaded);
    const at = places(loaded, composed);
    const carbon = at.get(2) as { x: number; y: number };
    const leaving = at.get(3) as { x: number; y: number };
    const start = (composed.arrows[0] as { start: { x: number; y: number } }).start;
    const u = Math.atan2(start.y - carbon.y, start.x - carbon.x);
    const v = Math.atan2(leaving.y - carbon.y, leaving.x - carbon.x);
    const angle = (Math.abs(Math.atan2(Math.sin(u - v), Math.cos(u - v))) * 180) / Math.PI;
    console.log(`SN2 attack to leaving group angle: ${angle.toFixed(1)} degrees`);
    expect(angle).toBeGreaterThanOrEqual(150);
    // the wedged reactant and product are never asked for mirrored
    for (const call of asked.filter((c) => c.value.includes('@'))) expect(call.turn).toBeLessThan(12);
  }, 60_000);

  it('aldol step 1: the hydroxide arrow is at least 30 % shorter than in the unturned layout', async () => {
    const s = stepOf('mec_aldol-ethanal', 0);
    const loaded = await load(s);
    const was = arrowChord(compose(s, await unturned(s, loaded)), 0);
    const now = arrowChord(compose(s, loaded), 0);
    console.log(`aldol step 1 hydroxide arrow, drawing units: ${was.toFixed(1)} -> ${now.toFixed(1)}`);
    expect(now).toBeLessThanOrEqual(0.7 * was);
  }, 60_000);

  it('the same step gives the same picture twice', async () => {
    const s = stepOf('mec_aldol-ethanal', 1);
    expect(compose(s, await load(s))).toEqual(compose(s, await load(s)));
  }, 60_000);
});

describe('weights and marks (G2)', () => {
  const css = readFileSync('src/render/mechanism/step-drawing.module.css', 'utf8').replace(/\r/g, '');
  /** The declarations of the first rule whose selector list names `.name`. */
  const rule = (name: string): string => [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)].find((m) => new RegExp(`\\.${name}(?![\\w-])`).test((m[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')))?.[2] ?? '';

  it('a curved arrow is as thick as a drawn bond', async () => {
    const out = await toolkit.depict({ format: 'smiles', value: 'CC=O' }, { ...OPTIONS, bondPx: 44 });
    const bond = /class=.bond-0[^>]*stroke-width:([\d.]+)px/.exec(out.ok ? out.depiction.svg : '')?.[1];
    expect(bond).toBeDefined();
    expect(/stroke-width:\s*([\d.]+)/.exec(rule('arrow'))?.[1]).toBe(String(Number(bond)));
  });

  it('the "+" is at label size and in the bonds\' ink; the ink is black in every theme', () => {
    expect(rule('plus')).toMatch(/fill:\s*var\(--mech-ink\)/);
    expect(rule('plus')).not.toMatch(/font-size/); // the size is in drawing units, on the element: no token could say it
    expect(PLUS_FONT_UNITS).toBe(22); // the label font of the drawings at 44 px per bond
    const inks = [...readFileSync('src/ui/design/tokens.css', 'utf8').matchAll(/--mech-ink:\s*(#[0-9A-Fa-f]+)/g)].map((m) => m[1]);
    expect(inks).toEqual(['#000000', '#000000', '#000000']);
  });
});
