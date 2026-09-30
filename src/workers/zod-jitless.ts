/**
 * Imported FIRST by every worker entry (SECURITY §4, ADR-035): Zod's JIT builds its parsers with `new Function`, which the
 * page policy does not allow; with `jitless` it interprets the schemas instead. A side-effect module, so the setting is
 * in place before any other module of the entry is evaluated.
 */
import { z } from 'zod';

z.config({ jitless: true });
