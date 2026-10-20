/**
 * The atom-map numbers of ONE mechanism step (step 6.5a decision D4): the maps the chem worker reads from the step's structures, through the
 * structure panel's own `parse` port. A bond change or an electron movement is CHOSEN from these (a choice list, never free numbers). The first
 * reading is at once, later ones 400 ms after the last edit (the structure panel's debounce); an answer for an older set of structures is dropped.
 * A structure the worker cannot read adds no map and is counted, so the person is told. Bounded: at most `MAX_OFFERED_MAPS` maps are offered.
 * No chemistry here: the worker reads, this file collects.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
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
}

const NONE: StepMaps = { phase: 'none', maps: [], unread: 0, cut: false };

export function useStepMaps(structures: readonly StructureRep[], port: StructurePort | undefined, timers: { after(ms: number, run: () => void): () => void }): StepMaps {
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
      void Promise.all(stable.map((structure) => port.parse(structure))).then((outcomes) => {
        if (mine !== version.current) return;
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
        if (unread === outcomes.length && message !== undefined) setState({ phase: 'unavailable', maps: [], unread, message: `The chemistry engine did not answer: ${message}`, cut: false });
        else setState({ phase: 'ready', maps: all.slice(0, MAX_OFFERED_MAPS), unread, cut: all.length > MAX_OFFERED_MAPS });
      });
    };
    if (first.current) {
      first.current = false;
      run();
      return undefined;
    }
    return timers.after(STEP_MAPS_DEBOUNCE_MS, run);
  }, [stable, port, timers]);
  return state;
}

/** Every pair of the maps, lower number first. */
export function pairsOf(maps: readonly number[]): readonly Pair[] {
  return maps.flatMap((a, i) => maps.slice(i + 1).map((b): Pair => [a, b]));
}

/** Every site of the maps: per atom its atom, lone pair and radical, then the bonds (pairs). */
export function sitesOf(maps: readonly number[]): readonly Site[] {
  return [
    ...maps.flatMap((atom): Site[] => [
      { kind: 'atom', atom },
      { kind: 'lone_pair', atom },
      { kind: 'radical', atom },
    ]),
    ...pairsOf(maps).map((atoms): Site => ({ kind: 'bond', atoms })),
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
