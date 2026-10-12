/** A fake `ExportPorts` for the export tests (step 5.9b): scripted answers, saved files recorded, no clock, no DOM. */
import { vi, type Mock } from 'vitest';
import type { ExportResult } from '@/io';
import type { ExportPorts, ExportReply, ExportRunOptions } from '@/features/data-exchange';

export const OK_RESULT: ExportResult = {
  bytes: new TextEncoder().encode('{"x":1}\n'),
  counts: { species: 3, reaction: 2 },
  missingAssets: [],
  missingReferences: [],
};

export interface FakePorts extends ExportPorts {
  readonly run: Mock<ExportPorts['run']>;
  readonly save: Mock<ExportPorts['save']>;
  /** The flow options of the last run, to drive progress and to see the signal. */
  lastFlow(): ExportRunOptions;
  /** Settles the pending run. */
  finish(answer: ExportReply): void;
  /** What `unavailable()` answers. */
  blocked: string | undefined;
}

export function fakePorts(options: { readonly title?: string; readonly images?: { count: number; bytes: number } } = {}): FakePorts {
  let settle: ((answer: ExportReply) => void) | undefined;
  let flow: ExportRunOptions = {};
  const kit: FakePorts = {
    blocked: undefined,
    run: vi.fn((_options, _format, given) => {
      flow = given;
      return new Promise<ExportReply>((resolve) => {
        settle = resolve;
      });
    }),
    save: vi.fn(),
    datasetTitle: () => options.title ?? 'Organic Reaction Navigator demo',
    today: () => '2026-10-12',
    images: () => options.images ?? { count: 0, bytes: 0 },
    nameOf: (ref) => (ref.id === 'ast_one' ? 'benzene.png' : undefined),
    unavailable: () => kit.blocked,
    log: () => undefined,
    lastFlow: () => flow,
    finish: (answer) => settle?.(answer),
  };
  return kit;
}
