/**
 * What a mechanism step's drawing is made of (step 8.5, ADR-038 D2-D4): every structure of the step is drawn by the structure tool WITH its
 * atom positions, the sides are decided by the rule of `core/mechanisms/sides.ts`, and a step that cannot be drawn says why in words
 * (never a blank box, never a partial drawing). Async over the port; no DOM. The picture itself is `composeStep` (layout) over what this returns.
 */
import { movementAtoms, stepSides } from '@/core/mechanisms';
import { composeStep, planStep, type Choice, type DrawnSpecies, type PlanSpecies } from './geometry';
import type { DrawableStep, StepDrawingAnswer, StepDrawingPort } from './contracts';

export const NO_DRAWING_WORDS = {
  noMaps: 'No drawing: this step has no atom-mapped structures.',
  missingAtoms: "No drawing: an electron movement names an atom that is not in this step's structures.",
  engine: 'Drawings need the structure tool, which did not load.',
} as const;
export const NO_MOVEMENTS_WORDS = 'No electron movements given for this step.';

export interface DrawnPart {
  readonly drawn: DrawnSpecies;
  /** The structure's drawing (sanitised SVG text) to show as an image; absent for a text box. */
  readonly svg?: string;
}

export type LoadedStep =
  | { readonly status: 'ready'; readonly before: readonly DrawnPart[]; readonly after: readonly DrawnPart[]; readonly noMovements: boolean }
  | { readonly status: 'none'; readonly words: (typeof NO_DRAWING_WORDS)['noMaps' | 'missingAtoms'] }
  | { readonly status: 'engine' };

/** A text box for a species with no structure: wide enough for its words at the drawing's label size. */
function labelBox(text: string): DrawnSpecies {
  return { kind: 'label', label: text, transitionState: false, width: Math.max(56, Math.min(220, 8 * text.length + 16)), height: 36, atoms: [], bonds: [] };
}

type Answered = Extract<StepDrawingAnswer, { ok: true }>;
const drawnOf = (answer: Answered): DrawnSpecies => ({ kind: 'structure', transitionState: false, width: answer.width, height: answer.height, atoms: (answer.atoms ?? []).map((a) => ({ map: a.map, x: a.x, y: a.y, rx: a.rx, ry: a.ry })), bonds: [...(answer.bonds ?? [])], glyphs: [...(answer.glyphs ?? [])] });

const isEngineFailure = (answer: StepDrawingAnswer): boolean => !answer.ok && (answer.reason === 'unavailable' || answer.reason === 'timeout');

export async function loadStep(step: DrawableStep, port: StepDrawingPort): Promise<LoadedStep> {
  const hasMovements = step.electronMovements.length > 0;
  const log = (message: string): void => port.log?.('mechanism_drawing', `step ${step.number}: ${message}`);
  const answers = await Promise.all(
    step.species.map(async (one): Promise<StepDrawingAnswer | undefined> => {
      if (one.structure === undefined) return undefined;
      const answer = await port.depict(one.structure, true);
      // a refused position table in a step with no arrow to place: the plain drawing is enough
      if (!answer.ok && answer.reason === 'refused' && !hasMovements) {
        log(answer.message);
        return port.depict(one.structure, false);
      }
      return answer;
    }),
  );
  if (answers.some((a) => a !== undefined && isEngineFailure(a))) return { status: 'engine' };
  const refused = answers.find((a) => a !== undefined && !a.ok && a.reason === 'refused');
  if (refused !== undefined && !refused.ok) {
    log(refused.message);
    return { status: 'none', words: NO_DRAWING_WORDS.missingAtoms };
  }

  const parts = step.species.map((one, k): { readonly drawn: DrawnSpecies; readonly svg?: string } => {
    const answer = answers[k];
    if (answer === undefined) return { drawn: labelBox(one.label ?? one.role.replaceAll('_', ' ')) };
    if (!answer.ok) {
      log(`${one.role}: ${answer.message}`);
      return { drawn: labelBox(one.label ?? one.role.replaceAll('_', ' ')) };
    }
    return { svg: answer.svg, drawn: drawnOf(answer) };
  });
  if (!parts.some((part) => part.drawn.atoms.length > 0)) return { status: 'none', words: NO_DRAWING_WORDS.noMaps };

  const sides = stepSides(
    step.species.map((one, k) => ({ role: one.role, maps: (parts[k] as DrawnPart).drawn.atoms.map((a) => a.map) })),
    movementAtoms(step.electronMovements),
  );
  // placement (step 8.5g): turn, mirror (never with stereo) and order; a turned species is drawn again by the structure tool
  const planned = (k: number): PlanSpecies => {
    const part = parts[k] as DrawnPart;
    const value = step.species[k]?.structure?.value ?? '';
    // a drawing without a bond is a lone atom or a text box: turning it changes nothing
    const canTurn = part.drawn.atoms.length > 0 && part.svg?.includes('bond-') === true;
    return { drawn: part.drawn, canTurn, canMirror: !value.includes('@') };
  };
  const plan = planStep({ before: sides.before.map(planned), after: sides.after.map(planned), movements: step.electronMovements });
  const show = async (k: number, turn: number): Promise<DrawnPart> => {
    let part = parts[k] as DrawnPart;
    const structure = step.species[k]?.structure;
    if (turn !== 0 && structure !== undefined) {
      const answer = await port.depict(structure, true, turn);
      if (answer.ok) part = { svg: answer.svg, drawn: drawnOf(answer) };
      else log(`${step.species[k]?.role}: kept as first drawn: ${answer.message}`);
    }
    return { ...part, drawn: { ...part.drawn, transitionState: step.species[k]?.role === 'transition_state' } };
  };
  const pick = (indexes: readonly number[], choices: readonly Choice[]): Promise<DrawnPart[]> => Promise.all(choices.map((c) => show(indexes[c.index] as number, c.turn)));
  const [before, after] = await Promise.all([pick(sides.before, plan.before), pick(sides.after, plan.after)]);
  // every movement must name an atom that exactly one drawn species of the before side holds; checked here so the words are decided once
  const check = composeStep({ before: before.map((p) => p.drawn), after: after.map((p) => p.drawn), orientation: 'row', reversible: step.reversible, movements: step.electronMovements });
  if (!check.ok) {
    log(`the movements name atoms the before side does not hold once: ${check.missing.join(', ')}`);
    return { status: 'none', words: NO_DRAWING_WORDS.missingAtoms };
  }
  return { status: 'ready', before, after, noMovements: !hasMovements };
}
