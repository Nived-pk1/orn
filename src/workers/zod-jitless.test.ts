import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import './zod-jitless';

describe('worker entries run Zod without its JIT (SECURITY §4)', () => {
  it('the side-effect module sets jitless', () => {
    expect(z.config().jitless).toBe(true);
  });

  it('every worker entry imports it before anything else', () => {
    for (const entry of ['compute', 'chem']) {
      const text = readFileSync(`src/workers/${entry}/entry.ts`, 'utf8');
      const imports = text.split('\n').filter((l) => l.startsWith('import '));
      expect(imports[0]).toBe("import '@/workers/zod-jitless';");
    }
  });
});
