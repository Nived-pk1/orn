/**
 * The step drawing's port (step 8.5): what `src/render/mechanism` needs, made from the depiction service. A drawing is asked at the fixed bond
 * length with its atom positions; object URLs are made and revoked here (a browser API), never in the render layer. `retry` loads the structure
 * tool again, as the banner's Retry does.
 */
import type { AppServices } from '@/app/services';
import type { StepDrawingPort } from '@/render/mechanism';

export type StepDrawingServices = Pick<AppServices, 'depictions' | 'logApp'> & Partial<Pick<AppServices, 'retryEngine'>>;

export function createStepDrawingPort(services: StepDrawingServices): StepDrawingPort {
  return {
    async depict(structure, positions) {
      const answer = await services.depictions.depict(structure, { width: 220, height: 220, showAtomMaps: false, fixedScale: true, ...(positions ? { atomPositions: true } : {}) });
      if (!answer.ok) return { ok: false, reason: answer.reason === 'queue_full' || answer.reason === 'cancelled' ? 'unavailable' : answer.reason, message: answer.message };
      return { ok: true, svg: answer.svg, width: answer.width, height: answer.height, ...(answer.atoms === undefined ? {} : { atoms: answer.atoms, bonds: answer.bonds ?? [] }) };
    },
    createUrl: (svg) => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    ...(services.retryEngine === undefined ? {} : { retry: () => void services.retryEngine?.('chem') }),
    log: (type, message) => services.logApp(type, message),
  };
}
