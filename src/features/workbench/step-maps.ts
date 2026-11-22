/**
 * The atom-map numbers of ONE mechanism step (step 6.5a decision D4): the maps the chem worker reads from the step's structures, through the
 * structure panel's own `parse` port. A bond change or an electron movement is CHOSEN from these (a choice list, never free numbers). The first
 * reading is at once, later ones 400 ms after the last edit (the structure panel's debounce); an answer for an older set of structures is dropped.
 * A structure the worker cannot read adds no map and is counted, so the person is told. Bounded: at most `MAX_OFFERED_MAPS` maps are offered.
 * No chemistry here: the worker reads, this file collects.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StepDrawingPort } from '@/render/mechanism';
import type { StructureRep } from '@/core/schema';
import type { StructurePort } from './structure-contracts';
import type { Pair, Site } from './step-rows-model';

export const MAX_OFFERED_MAPS = 60;
export const STEP_MAPS_DEBOUNCE_MS = 400;

export interface StepMaps {
  /** `none`: the step has no structure; `reading`; `ready`; `unavailable`: no worker or no answer. */
  readonly phase: 'none' | 'reading' | 'ready' | 'unavailable';
  /** Ascending, each once, at most `MAX_OFFERED_MAPS`. */
  readonly maps: readonly number[];
  /** How many structures could not be read, and the words when the worker did not answer. */
  readonly unread: number;
  readonly message?: string;
  readonly cut: boolean;
  /** The pairs of `maps` that are BONDED in the step's structures, as the structure tool reports (step 8.5); empty when it gave none. */
  readonly bonded: readonly Pair[];
}

const NONE: StepMaps = { phase: 'none', maps: [], unread: 0, cut: false, bonded: [] };

export function useStepMaps(structures: readonly StructureRep[], port: StructurePort | undefined, timers: { after(ms: number, run: () => void): () => void }, drawing?: StepDrawingPort): StepMaps {
  const key = JSON.stringify(structures);
  const stable = useMemo(() => structures, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState<StepMaps>(structures.length === 0 ? NONE : { ...NONE, phase: 'reading' });
  const first = useRef(true);
  const version = useRef(0);
  useEffect(() => {
    version.current += 1;
    const mine = version.current;
    if (stable.length === 0) {
      setState(NONE);
      return undefined;
    }
    if (port === undefined) {
      setState({ ...NONE, phase: 'unavailable', message: 'The chemistry engine is not available here, so the atom maps of this step cannot be listed.' });
      return undefined;
    }
    const run = (): void => {
      setState((was) => (was.phase === 'ready' ? was : { ...NONE, phase: 'reading' }));
      void Promise.all([Promise.all(stable.map((structure) => port.parse(structure))), Promise.all(stable.map((structure) => (drawing === undefined ? undefined : drawing.depict(structure, true))))]).then(([outcomes, drawn]) => {
        if (mine !== version.current) return;
        const bonds = new Map<string, Pair>();
        for (const answer of drawn) if (answer?.ok === true) for (const bond of answer.bonds ?? []) bonds.set(`${bond.a}-${bond.b}`, [bond.a, bond.b]);
        const found = new Set<number>();
        let unread = 0;
        let message: string | undefined;
        for (const outcome of outcomes) {
          if (outcome.ok) for (const map of outcome.facts.atomMaps) found.add(map);
          else {
            unread += 1;
            if (outcome.reason !== 'invalid') message = outcome.error;
          }
        }
        const all = [...found].sort((a, b) => a - b);
        const offered = all.slice(0, MAX_OFFERED_MAPS);
        const bonded = [...bonds.values()].filter((pair) => offered.includes(pair[0]) && offered.includes(pair[1])).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        if (unread === outcomes.length && message !== undefined) setState({ phase: 'unavailable', maps: [], unread, message: `The chemistry engine did not answer: ${message}`, cut: false, bonded: [] });
        else setState({ phase: 'ready', maps: offered, unread, cut: all.length > MAX_OFFERED_MAPS, bonded });
      });
    };
    if (first.current) {
      first.current = false;
      run();
      return undefined;
    }
    return timers.after(STEP_MAPS_DEBOUNCE_MS, run);
  }, [stable, port, timers, drawing]);
  return state;
}

/** Every pair of the maps, lower number first; the pairs in `bonded` (bonded in the step's structures) come first, then the rest in that order. */
export function pairsOf(maps: readonly number[], bonded: readonly Pair[] = []): readonly Pair[] {
  const all = maps.flatMap((a, i) => maps.slice(i + 1).map((b): Pair => [a, b]));
  const isBonded = (pair: Pair): boolean => bonded.some((b) => b[0] === pair[0] && b[1] === pair[1]);
  return [...all.filter(isBonded), ...all.filter((pair) => !isBonded(pair))];
}

/** Every site of the maps: per atom its atom, lone pair and radical, then the bonds (pairs, the bonded ones first). */
export function sitesOf(maps: readonly number[], bonded: readonly Pair[] = []): readonly Site[] {
  return [
    ...maps.flatMap((atom): Site[] => [
      { kind: 'atom', atom },
      { kind: 'lone_pair', atom },
      { kind: 'radical', atom },
    ]),
    ...pairsOf(maps, bonded).map((atoms): Site => ({ kind: 'bond', atoms })),
  ];
}

export const pairWords = (pair: Pair): string => `Atoms ${pair[0]} and ${pair[1]}`;
export function siteWords(site: Site): string {
  switch (site.kind) {
    case 'atom':
      return `Atom ${site.atom}`;
    case 'lone_pair':
      return `Lone pair on atom ${site.atom}`;
    case 'radical':
      return `Radical on atom ${site.atom}`;
    case 'bond':
      return `Bond between atoms ${site.atoms[0]} and ${site.atoms[1]}`;
  }
}
export const MISSING_MAP_NOTE = "not in this step's structures";

/** Why a new bond change or movement cannot be added now, in words; undefined when it can. */
export function addReason(maps: StepMaps, needs: 1 | 2): string | undefined {
  if (maps.phase === 'none') return ADD_FIRST;
  if (maps.phase === 'reading') return 'reading the structures of this step';
  if (maps.phase === 'unavailable') return maps.message;
  if (maps.maps.length === 0) return ADD_FIRST;
  return maps.maps.length < needs ? 'this step has fewer than two atom maps' : undefined;
}
export const ADD_FIRST = 'Add atom-mapped structures to this step first';
