/**
 * The step drawing's port (step 8.5; the size is not used at a fixed scale: it is the small size the structure rows use), made in the lazy chunks that use it from the depictions port the navigator already hands them (so the
 * entry carries none of it): drawings at the fixed bond length, with atom positions when asked. A busy or cancelled answer is `unavailable`
 * (the engine words and Retry); every other refusal keeps its reason and message. Object URLs are the port's own (a browser API, made by the app).
 */
import { SIZE_RULES } from '@/render/equation';
import type { DepictionPort } from '@/render/svg';
import type { StepDrawingPort } from './contracts';

export type DepictionsLike = Pick<DepictionPort, 'depict' | 'createUrl' | 'revokeUrl' | 'mode' | 'onMode'>;

export function stepDrawingFrom(depictions: DepictionsLike, extras: { readonly retry?: () => void; readonly log?: (type: string, message: string) => void } = {}): StepDrawingPort {
  return {
    async depict(structure, positions, turn) {
      const size = { width: 120, height: 80, fixedScale: true, bondPx: SIZE_RULES.mechanism.standard, ...(positions ? { atomPositions: true, ...(turn ? { turn } : {}) } : {}) };
      const condensed = (depictions.mode?.() ?? 'skeletal') !== 'skeletal';
      const answer = await (condensed ? depictions.depict(structure, size, 'condensed') : depictions.depict(structure, size));
      if (!answer.ok) return { ok: false, reason: answer.reason === 'queue_full' || answer.reason === 'cancelled' ? 'unavailable' : answer.reason, message: answer.message };
      if (answer.width === undefined || answer.height === undefined) return { ok: false, reason: 'invalid', message: 'the drawing has no size' };
      return { ok: true, svg: answer.svg, width: answer.width, height: answer.height, ...(answer.atoms === undefined ? {} : { atoms: answer.atoms, bonds: answer.bonds ?? [], glyphs: answer.glyphs ?? [] }) };
    },
    ...(depictions.mode === undefined ? {} : { mode: () => depictions.mode?.() ?? 'skeletal' }),
    ...(depictions.onMode === undefined ? {} : { onMode: (listener: () => void) => depictions.onMode?.(listener) ?? (() => undefined) }),
    createUrl: (svg) => depictions.createUrl(svg),
    revokeUrl: (url) => depictions.revokeUrl(url),
    ...(extras.retry === undefined ? {} : { retry: extras.retry }),
    ...(extras.log === undefined ? {} : { log: extras.log }),
  };
}
